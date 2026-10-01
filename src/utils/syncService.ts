import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  deleteDoc,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './firebase';
import {
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
  IposItem,
  ReconciliationSession,
} from '../types';
import {
  getEmptyMasterData,
  loadMasterData,
  saveMasterData,
  getLearnedItemAliases,
  saveLearnedItemAlias,
  getLearnedUnitAliases,
  saveLearnedUnitAlias,
  getInvoiceHistory,
  saveInvoiceSession,
  getReconciliationSessions,
  saveReconciliationSession,
  healMasterDataUnits,
  registerCloudHook,
} from './db';

const STORE_ID = 'default_store';
const ITEMS_PER_CHUNK = 350;

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'ready';

export interface SyncInfo {
  state: SyncState;
  lastSyncedAt: number | null;
  cloudItemsCount: number;
  cloudAliasesCount: number;
  lastError: string | null;
  isOnline: boolean;
}

type SyncListener = (info: SyncInfo) => void;
type MasterDataListener = (data: IposMasterData) => void;
type AliasesListener = () => void;

class CloudSyncService {
  private syncInfo: SyncInfo = {
    state: 'ready',
    lastSyncedAt: null,
    cloudItemsCount: 0,
    cloudAliasesCount: 0,
    lastError: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };

  private syncListeners: Set<SyncListener> = new Set();
  private masterDataListeners: Set<MasterDataListener> = new Set();
  private aliasesListeners: Set<AliasesListener> = new Set();

  private unsubMasterData: Unsubscribe | null = null;
  private unsubAliases: Unsubscribe | null = null;
  private unsubUnits: Unsubscribe | null = null;
  private isInitialized = false;
  private isSyncingNow = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateSyncInfo({ isOnline: true });
        this.syncBidirectional();
      });
      window.addEventListener('offline', () => {
        this.updateSyncInfo({ isOnline: false, state: 'offline' });
      });
    }
  }

  public getSyncInfo(): SyncInfo {
    return { ...this.syncInfo };
  }

  public subscribeSync(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    listener(this.getSyncInfo());
    return () => this.syncListeners.delete(listener);
  }

  public onRemoteMasterData(listener: MasterDataListener): () => void {
    this.masterDataListeners.add(listener);
    return () => this.masterDataListeners.delete(listener);
  }

  public onRemoteAliases(listener: AliasesListener): () => void {
    this.aliasesListeners.add(listener);
    return () => this.aliasesListeners.delete(listener);
  }

  private updateSyncInfo(partial: Partial<SyncInfo>) {
    this.syncInfo = { ...this.syncInfo, ...partial };
    this.syncListeners.forEach((fn) => {
      try {
        fn(this.getSyncInfo());
      } catch (e) {
        console.error('Error in sync listener:', e);
      }
    });
  }

  /**
   * Initialize Cloud Sync (called on app startup)
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      this.updateSyncInfo({ state: 'syncing' });

      // 1. Initial bidirectional check and sync
      await this.syncBidirectional();

      // 2. Attach realtime listeners for cloud changes from other devices
      this.setupRealtimeListeners();
    } catch (err: any) {
      console.warn('Initial cloud sync notice:', err);
      this.updateSyncInfo({
        state: this.syncInfo.isOnline ? 'error' : 'offline',
        lastError: err?.message || 'Không thể kết nối Cloud DB',
      });
    }
  }

  /**
   * Set up Firestore realtime listeners
   */
  private setupRealtimeListeners() {
    if (!firestore) return;

    // Listen to Master Data metadata changes
    try {
      const masterDocRef = doc(firestore, `stores/${STORE_ID}/master_data/main`);
      this.unsubMasterData = onSnapshot(
        masterDocRef,
        async (snapshot) => {
          if (!snapshot.exists()) return;
          const remoteMeta = snapshot.data();
          const remoteUpdatedAt = Number(remoteMeta.updatedAt || 0);

          const localData = await loadMasterData();
          const localUpdatedAt = Number(localData?.updatedAt || 0);

          // If remote is strictly newer or local has no items while remote has items
          if (remoteUpdatedAt > localUpdatedAt || (!localData?.items?.length && (remoteMeta.totalItems || 0) > 0)) {
            await this.pullMasterDataFromCloud(remoteMeta);
          }
        },
        (error) => {
          console.warn('Firestore master_data onSnapshot error:', error);
          this.updateSyncInfo({ state: 'offline', lastError: error.message });
        }
      );
    } catch (e) {
      console.warn('Could not attach master_data listener:', e);
    }

    // Listen to Item Aliases collection
    try {
      const aliasesColRef = collection(firestore, `stores/${STORE_ID}/item_aliases`);
      this.unsubAliases = onSnapshot(
        aliasesColRef,
        async (snapshot) => {
          let hasLocalChanges = false;
          const localAliases = await getLearnedItemAliases();
          const localMap = new Map(localAliases.map((a) => [a.id, a]));

          for (const docChange of snapshot.docChanges()) {
            if (docChange.type === 'added' || docChange.type === 'modified') {
              const remote = docChange.doc.data() as LearnedItemAlias;
              const local = localMap.get(remote.id);

              // "Với Learned Aliases lấy cái mới nhất"
              if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
                await saveLearnedItemAlias(remote, false); // false = don't re-push to cloud
                hasLocalChanges = true;
              }
            }
          }

          if (hasLocalChanges) {
            this.aliasesListeners.forEach((fn) => fn());
          }
          this.updateSyncInfo({
            cloudAliasesCount: snapshot.size,
          });
        },
        (error) => {
          console.warn('Firestore item_aliases onSnapshot error:', error);
        }
      );
    } catch (e) {
      console.warn('Could not attach aliases listener:', e);
    }
  }

  /**
   * Bidirectional sync:
   * - If remote is empty and local has data -> push local to cloud
   * - If local is empty and remote has data -> pull remote to local (crucial for new devices!)
   * - If both have data -> merge master data and aliases according to user requirements
   */
  public async syncBidirectional(): Promise<void> {
    if (this.isSyncingNow) return;
    this.isSyncingNow = true;
    this.updateSyncInfo({ state: 'syncing', lastError: null });

    try {
      const localData = await loadMasterData();
      const localHasData = (localData?.items?.length || 0) > 0;

      // Check remote master data
      const masterDocRef = doc(firestore, `stores/${STORE_ID}/master_data/main`);
      const masterSnap = await getDoc(masterDocRef);

      if (masterSnap.exists()) {
        const remoteMeta = masterSnap.data();
        const remoteTotalItems = Number(remoteMeta.totalItems || 0);

        if (!localHasData && remoteTotalItems > 0) {
          // Device is fresh/empty: Pull everything from Cloud!
          await this.pullMasterDataFromCloud(remoteMeta);
        } else if (localHasData && remoteTotalItems === 0) {
          // Local has data but Cloud is empty: Push to Cloud
          await this.pushMasterDataToCloud(localData!);
        } else if (localHasData && remoteTotalItems > 0) {
          // Both have data: Merge Master Data
          const remoteFull = await this.fetchFullRemoteMasterData(remoteMeta);
          const merged = this.mergeMasterData(localData!, remoteFull);
          await saveMasterData(merged, false); // save to local without re-push
          await this.pushMasterDataToCloud(merged); // sync merged back to cloud
          this.masterDataListeners.forEach((fn) => fn(merged));
        }
      } else if (localHasData) {
        // Cloud has no doc yet: push local data
        await this.pushMasterDataToCloud(localData!);
      }

      // Sync Aliases: pull remote, merge taking newest
      await this.syncAliasesBidirectional();

      // Sync Invoice history (latest metadata)
      await this.syncInvoicesFromCloud();

      // Sync Reconciliation sessions
      await this.syncReconciliationsFromCloud();

      this.updateSyncInfo({
        state: 'synced',
        lastSyncedAt: Date.now(),
      });
    } catch (err: any) {
      console.error('Bidirectional sync error:', err);
      this.updateSyncInfo({
        state: 'error',
        lastError: err?.message || 'Lỗi đồng bộ dữ liệu Cloud',
      });
    } finally {
      this.isSyncingNow = false;
    }
  }

  /**
   * Fetch full master data from cloud chunks
   */
  private async fetchFullRemoteMasterData(remoteMeta: any): Promise<IposMasterData> {
    const chunksCount = Number(remoteMeta.itemChunksCount || 0);
    const items: IposItem[] = [];

    if (chunksCount > 0) {
      for (let i = 0; i < chunksCount; i++) {
        try {
          const chunkDocRef = doc(firestore, `stores/${STORE_ID}/master_data_chunks/chunk_${i}`);
          const chunkSnap = await getDoc(chunkDocRef);
          if (chunkSnap.exists()) {
            const data = chunkSnap.data();
            if (Array.isArray(data.items)) {
              items.push(...data.items);
            }
          }
        } catch (e) {
          console.warn(`Failed to read chunk_${i}:`, e);
        }
      }
    }

    return {
      templateFileName: remoteMeta.templateFileName,
      templateWorkbookBase64: remoteMeta.templateWorkbookBase64,
      categories: remoteMeta.categories || [],
      units: remoteMeta.units || [],
      unitConversions: remoteMeta.unitConversions || [],
      recipes: remoteMeta.recipes || [],
      warehouses: remoteMeta.warehouses || [],
      customers: remoteMeta.customers || [],
      suppliers: remoteMeta.suppliers || [],
      supplierGroups: remoteMeta.supplierGroups || [],
      priceLists: remoteMeta.priceLists || [],
      reasons: remoteMeta.reasons || [],
      stockNorms: remoteMeta.stockNorms || [],
      items,
      updatedAt: remoteMeta.updatedAt || Date.now(),
    };
  }

  /**
   * Pull master data from cloud and save to local
   */
  public async pullMasterDataFromCloud(remoteMeta?: any): Promise<IposMasterData | null> {
    try {
      this.updateSyncInfo({ state: 'syncing' });
      if (!remoteMeta) {
        const masterDocRef = doc(firestore, `stores/${STORE_ID}/master_data/main`);
        const snap = await getDoc(masterDocRef);
        if (!snap.exists()) return null;
        remoteMeta = snap.data();
      }

      const remoteData = await this.fetchFullRemoteMasterData(remoteMeta);
      healMasterDataUnits(remoteData);

      // Save directly to local IndexedDB (with skipCloudPush=true to prevent infinite echo)
      await saveMasterData(remoteData, false);

      this.updateSyncInfo({
        state: 'synced',
        lastSyncedAt: Date.now(),
        cloudItemsCount: remoteData.items.length,
      });

      // Notify UI
      this.masterDataListeners.forEach((fn) => fn(remoteData));
      return remoteData;
    } catch (e: any) {
      console.error('Error pulling master data from cloud:', e);
      this.updateSyncInfo({
        state: 'error',
        lastError: e?.message || 'Không thể tải dữ liệu từ Cloud',
      });
      return null;
    }
  }

  /**
   * Push Master Data to Cloud with chunking
   */
  public async pushMasterDataToCloud(data: IposMasterData): Promise<void> {
    if (!firestore) return;
    this.updateSyncInfo({ state: 'syncing' });

    try {
      const items = data.items || [];
      const totalItems = items.length;
      const chunksCount = Math.ceil(totalItems / ITEMS_PER_CHUNK);

      // 1. Upload chunks
      for (let i = 0; i < chunksCount; i++) {
        const start = i * ITEMS_PER_CHUNK;
        const chunkItems = items.slice(start, start + ITEMS_PER_CHUNK);
        const chunkDocRef = doc(firestore, `stores/${STORE_ID}/master_data_chunks/chunk_${i}`);
        await setDoc(chunkDocRef, {
          chunkIndex: i,
          updatedAt: Date.now(),
          items: chunkItems,
        });
      }

      // If previous chunks count was higher, clean up old chunk docs
      // (Safe cleanup for up to 10 extra old chunks)
      for (let extra = chunksCount; extra < chunksCount + 5; extra++) {
        try {
          const oldChunkRef = doc(firestore, `stores/${STORE_ID}/master_data_chunks/chunk_${extra}`);
          await deleteDoc(oldChunkRef);
        } catch {
          // ignore
        }
      }

      // 2. Save main metadata doc
      const masterDocRef = doc(firestore, `stores/${STORE_ID}/master_data/main`);
      await setDoc(masterDocRef, {
        updatedAt: data.updatedAt || Date.now(),
        templateFileName: data.templateFileName || '',
        // Save template base64 only if reasonable size (< 500KB)
        templateWorkbookBase64:
          data.templateWorkbookBase64 && data.templateWorkbookBase64.length < 500000
            ? data.templateWorkbookBase64
            : '',
        categories: data.categories || [],
        units: data.units || [],
        unitConversions: data.unitConversions || [],
        recipes: data.recipes || [],
        warehouses: data.warehouses || [],
        customers: data.customers || [],
        suppliers: data.suppliers || [],
        supplierGroups: data.supplierGroups || [],
        priceLists: data.priceLists || [],
        reasons: data.reasons || [],
        stockNorms: data.stockNorms || [],
        totalItems,
        itemChunksCount: chunksCount,
      });

      this.updateSyncInfo({
        state: 'synced',
        lastSyncedAt: Date.now(),
        cloudItemsCount: totalItems,
      });
    } catch (err: any) {
      console.error('Error pushing master data to cloud:', err);
      this.updateSyncInfo({
        state: 'error',
        lastError: err?.message || 'Không thể đồng bộ Master Data lên Cloud',
      });
    }
  }

  /**
   * Merge two master data records (Rule: Union/Merge items, categories, suppliers, etc.)
   */
  public mergeMasterData(local: IposMasterData, remote: IposMasterData): IposMasterData {
    // 1. Merge items by itemId
    const itemMap = new Map<string, IposItem>();
    (remote.items || []).forEach((it) => itemMap.set(it.itemId, it));
    (local.items || []).forEach((it) => {
      if (!itemMap.has(it.itemId)) {
        itemMap.set(it.itemId, it);
      } else {
        // Merge item attributes, prefer non-empty
        const existing = itemMap.get(it.itemId)!;
        itemMap.set(it.itemId, {
          ...existing,
          ...it,
          itemName: it.itemName || existing.itemName,
          unitName: it.unitName || existing.unitName,
          category: it.category || existing.category,
        });
      }
    });

    // 2. Merge suppliers by supplierId
    const supplierMap = new Map<string, any>();
    (remote.suppliers || []).forEach((s) => supplierMap.set(s.supplierId, s));
    (local.suppliers || []).forEach((s) => supplierMap.set(s.supplierId, { ...supplierMap.get(s.supplierId), ...s }));

    // 3. Merge warehouses by warehouseId
    const whMap = new Map<string, any>();
    (remote.warehouses || []).forEach((w) => whMap.set(w.warehouseId, w));
    (local.warehouses || []).forEach((w) => whMap.set(w.warehouseId, { ...whMap.get(w.warehouseId), ...w }));

    // 4. Merge categories by categoryId
    const catMap = new Map<string, any>();
    (remote.categories || []).forEach((c) => catMap.set(c.categoryId, c));
    (local.categories || []).forEach((c) => catMap.set(c.categoryId, { ...catMap.get(c.categoryId), ...c }));

    // 5. Merge units by unitId or unitName
    const unitMap = new Map<string, any>();
    (remote.units || []).forEach((u) => unitMap.set(u.unitId || u.unitName, u));
    (local.units || []).forEach((u) => unitMap.set(u.unitId || u.unitName, { ...unitMap.get(u.unitId || u.unitName), ...u }));

    // 6. Merge conversions
    const convMap = new Map<string, any>();
    (remote.unitConversions || []).forEach((c) => {
      convMap.set(`${c.itemId || c.itemName}:::${c.sourceUnitName}:::${c.targetUnitName}`, c);
    });
    (local.unitConversions || []).forEach((c) => {
      convMap.set(`${c.itemId || c.itemName}:::${c.sourceUnitName}:::${c.targetUnitName}`, c);
    });

    const merged: IposMasterData = {
      templateFileName: local.templateFileName || remote.templateFileName,
      templateWorkbookBase64: local.templateWorkbookBase64 || remote.templateWorkbookBase64,
      items: Array.from(itemMap.values()),
      suppliers: Array.from(supplierMap.values()),
      warehouses: Array.from(whMap.values()),
      categories: Array.from(catMap.values()),
      units: Array.from(unitMap.values()),
      unitConversions: Array.from(convMap.values()),
      recipes: local.recipes?.length ? local.recipes : remote.recipes || [],
      customers: local.customers?.length ? local.customers : remote.customers || [],
      supplierGroups: local.supplierGroups?.length ? local.supplierGroups : remote.supplierGroups || [],
      priceLists: local.priceLists?.length ? local.priceLists : remote.priceLists || [],
      reasons: local.reasons?.length ? local.reasons : remote.reasons || [],
      stockNorms: local.stockNorms?.length ? local.stockNorms : remote.stockNorms || [],
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
    };

    healMasterDataUnits(merged);
    return merged;
  }

  /**
   * Sync Learned Aliases: "Với Learned Aliases lấy cái mới nhất"
   */
  public async syncAliasesBidirectional(): Promise<void> {
    if (!firestore) return;

    try {
      const localAliases = await getLearnedItemAliases();
      const localMap = new Map(localAliases.map((a) => [a.id, a]));

      const colRef = collection(firestore, `stores/${STORE_ID}/item_aliases`);
      const snap = await getDocs(colRef);

      const remoteMap = new Map<string, LearnedItemAlias>();
      snap.forEach((d) => {
        const item = d.data() as LearnedItemAlias;
        remoteMap.set(item.id, item);
      });

      let updatedLocalCount = 0;

      // Check remote items against local: take whichever has newest updatedAt
      for (const [id, remote] of remoteMap.entries()) {
        const local = localMap.get(id);
        if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
          // Remote is newer, update local
          await saveLearnedItemAlias(remote, false);
          updatedLocalCount++;
        } else if (local && (local.updatedAt || 0) > (remote.updatedAt || 0)) {
          // Local is newer, push to cloud
          await this.pushItemAliasToCloud(local);
        }
      }

      // Check local items missing from cloud
      for (const [id, local] of localMap.entries()) {
        if (!remoteMap.has(id)) {
          await this.pushItemAliasToCloud(local);
        }
      }

      // Unit aliases sync
      await this.syncUnitAliases();

      if (updatedLocalCount > 0) {
        this.aliasesListeners.forEach((fn) => fn());
      }

      this.updateSyncInfo({
        cloudAliasesCount: Math.max(snap.size, localAliases.length),
      });
    } catch (e) {
      console.warn('Aliases sync error:', e);
    }
  }

  private async syncUnitAliases(): Promise<void> {
    if (!firestore) return;
    try {
      const localUnits = await getLearnedUnitAliases();
      const localUnitMap = new Map(localUnits.map((u) => [u.normalized_raw_unit, u]));

      const colRef = collection(firestore, `stores/${STORE_ID}/unit_aliases`);
      const snap = await getDocs(colRef);

      for (const d of snap.docs) {
        const remote = d.data() as LearnedUnitAlias;
        const local = localUnitMap.get(remote.normalized_raw_unit);
        if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
          await saveLearnedUnitAlias(remote.normalized_raw_unit, remote.target_unit_name, false);
        }
      }

      for (const [unit, local] of localUnitMap.entries()) {
        if (!snap.docs.some((d) => d.id === encodeURIComponent(unit))) {
          await this.pushUnitAliasToCloud(local.normalized_raw_unit, local.target_unit_name);
        }
      }
    } catch (e) {
      console.warn('Unit aliases sync error:', e);
    }
  }

  /**
   * Push single item alias to cloud
   */
  public async pushItemAliasToCloud(alias: LearnedItemAlias): Promise<void> {
    if (!firestore) return;
    try {
      const docId = encodeURIComponent(alias.id);
      const aliasDocRef = doc(firestore, `stores/${STORE_ID}/item_aliases/${docId}`);
      await setDoc(aliasDocRef, {
        ...alias,
        updatedAt: alias.updatedAt || Date.now(),
      });
    } catch (e) {
      console.warn('Could not push alias to cloud:', e);
    }
  }

  /**
   * Delete item alias from cloud
   */
  public async deleteItemAliasFromCloud(aliasId: string): Promise<void> {
    if (!firestore) return;
    try {
      const docId = encodeURIComponent(aliasId);
      const aliasDocRef = doc(firestore, `stores/${STORE_ID}/item_aliases/${docId}`);
      await deleteDoc(aliasDocRef);
    } catch (e) {
      console.warn('Could not delete alias from cloud:', e);
    }
  }

  /**
   * Push unit alias to cloud
   */
  public async pushUnitAliasToCloud(normalizedRawUnit: string, targetUnitName: string): Promise<void> {
    if (!firestore) return;
    try {
      const docId = encodeURIComponent(normalizedRawUnit);
      const docRef = doc(firestore, `stores/${STORE_ID}/unit_aliases/${docId}`);
      await setDoc(docRef, {
        normalized_raw_unit: normalizedRawUnit,
        target_unit_name: targetUnitName,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Could not push unit alias to cloud:', e);
    }
  }

  /**
   * Delete unit alias from cloud
   */
  public async deleteUnitAliasFromCloud(normalizedRawUnit: string): Promise<void> {
    if (!firestore) return;
    try {
      const docId = encodeURIComponent(normalizedRawUnit);
      const docRef = doc(firestore, `stores/${STORE_ID}/unit_aliases/${docId}`);
      await deleteDoc(docRef);
    } catch (e) {
      console.warn('Could not delete unit alias from cloud:', e);
    }
  }

  /**
   * Push Invoice Session to Cloud:
   * "Đối với ảnh hóa đơn, chỉ cần lưu dữ liệu bảng số liệu đã bóc tách JSON"
   */
  public async pushInvoiceSessionToCloud(session: any): Promise<void> {
    if (!firestore) return;
    try {
      // Exclude base64 imagePreviewUrl to prevent size issues!
      const { imagePreviewUrl, ...cleanSession } = session;
      const docRef = doc(firestore, `stores/${STORE_ID}/invoices/${cleanSession.id}`);
      await setDoc(docRef, {
        ...cleanSession,
        createdAt: cleanSession.createdAt || Date.now(),
      });
    } catch (e) {
      console.warn('Could not push invoice session to cloud:', e);
    }
  }

  /**
   * Sync Invoice history from cloud to local IndexedDB
   */
  public async syncInvoicesFromCloud(): Promise<void> {
    if (!firestore) return;
    try {
      const colRef = collection(firestore, `stores/${STORE_ID}/invoices`);
      const snap = await getDocs(colRef);
      const localHistory = await getInvoiceHistory();
      const localIds = new Set(localHistory.map((h) => h.id));

      for (const d of snap.docs) {
        const remoteInvoice = d.data();
        if (!localIds.has(remoteInvoice.id)) {
          await saveInvoiceSession(remoteInvoice as any, false);
        }
      }
    } catch (e) {
      console.warn('Invoice history sync error:', e);
    }
  }

  /**
   * Push single Reconciliation session to Firestore
   */
  public async pushReconciliationToCloud(session: ReconciliationSession): Promise<void> {
    if (!firestore || !session?.id) return;
    try {
      const docRef = doc(firestore, `stores/${STORE_ID}/reconciliations/${session.id}`);
      await setDoc(docRef, JSON.parse(JSON.stringify(session)), { merge: true });
    } catch (e) {
      console.warn('Could not push reconciliation to cloud:', e);
    }
  }

  /**
   * Delete single Reconciliation session from Firestore
   */
  public async deleteReconciliationFromCloud(id: string): Promise<void> {
    if (!firestore || !id) return;
    try {
      await deleteDoc(doc(firestore, `stores/${STORE_ID}/reconciliations/${id}`));
    } catch (e) {
      console.warn('Could not delete reconciliation from cloud:', e);
    }
  }

  /**
   * Sync Reconciliation sessions from Firestore to local IndexedDB
   */
  public async syncReconciliationsFromCloud(): Promise<void> {
    if (!firestore) return;
    try {
      const colRef = collection(firestore, `stores/${STORE_ID}/reconciliations`);
      const snap = await getDocs(colRef);
      const localSessions = await getReconciliationSessions();
      const localIds = new Set(localSessions.map((s) => s.id));

      for (const d of snap.docs) {
        const remoteSession = d.data() as ReconciliationSession;
        if (!localIds.has(remoteSession.id)) {
          await saveReconciliationSession(remoteSession, false);
        }
      }
    } catch (e) {
      console.warn('Reconciliations sync error:', e);
    }
  }

  /**
   * Clear all cloud data (when user resets DB)
   */
  public async clearEntireCloudDatabase(): Promise<void> {
    if (!firestore) return;
    this.updateSyncInfo({ state: 'syncing' });

    try {
      // Delete master data doc
      await deleteDoc(doc(firestore, `stores/${STORE_ID}/master_data/main`));

      // Delete chunks
      for (let i = 0; i < 20; i++) {
        try {
          await deleteDoc(doc(firestore, `stores/${STORE_ID}/master_data_chunks/chunk_${i}`));
        } catch {}
      }

      // Delete aliases
      const aliasesSnap = await getDocs(collection(firestore, `stores/${STORE_ID}/item_aliases`));
      for (const d of aliasesSnap.docs) {
        await deleteDoc(d.ref);
      }

      // Delete unit aliases
      const unitSnap = await getDocs(collection(firestore, `stores/${STORE_ID}/unit_aliases`));
      for (const d of unitSnap.docs) {
        await deleteDoc(d.ref);
      }

      // Delete reconciliations
      const reconSnap = await getDocs(collection(firestore, `stores/${STORE_ID}/reconciliations`));
      for (const d of reconSnap.docs) {
        await deleteDoc(d.ref);
      }

      this.updateSyncInfo({
        state: 'synced',
        lastSyncedAt: Date.now(),
        cloudItemsCount: 0,
        cloudAliasesCount: 0,
      });
    } catch (e: any) {
      console.error('Error clearing cloud database:', e);
      this.updateSyncInfo({ state: 'error', lastError: e.message });
    }
  }
}

export const syncService = new CloudSyncService();

// Register hooks so db.ts triggers cloud sync automatically
registerCloudHook({
  pushMasterData: (data) => syncService.pushMasterDataToCloud(data),
  pushItemAlias: (alias) => syncService.pushItemAliasToCloud(alias),
  deleteItemAlias: (id) => syncService.deleteItemAliasFromCloud(id),
  pushUnitAlias: (raw, target) => syncService.pushUnitAliasToCloud(raw, target),
  deleteUnitAlias: (raw) => syncService.deleteUnitAliasFromCloud(raw),
  pushInvoice: (session) => syncService.pushInvoiceSessionToCloud(session),
  pushReconciliation: (session) => syncService.pushReconciliationToCloud(session),
  deleteReconciliation: (id) => syncService.deleteReconciliationFromCloud(id),
  clearCloud: () => syncService.clearEntireCloudDatabase(),
});

export default syncService;
