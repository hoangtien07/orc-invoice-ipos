import {
  IposCustomer,
  IposItem,
  IposItemCategory,
  IposMasterData,
  IposPriceList,
  IposReason,
  IposRecipe,
  IposStockNorm,
  IposSupplier,
  IposSupplierGroup,
  IposUnit,
  IposUnitConversion,
  IposWarehouse,
  LearnedItemAlias,
  LearnedUnitAlias,
  MatchedInvoiceRow,
  RawInvoiceData,
} from '../types';

const DB_NAME = 'ipos_invoice_ai_db_v3';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

// Clean up any old db instances if necessary
try {
  if (typeof window !== 'undefined' && window.indexedDB) {
    // Delete legacy db names if they were previously created with mock data
    ['ipos_invoice_ai_db', 'ipos_invoice_ai_db_v2'].forEach((oldName) => {
      try {
        window.indexedDB.deleteDatabase(oldName);
      } catch (e) {
        // ignore
      }
    });
  }
} catch (e) {
  // ignore
}

export async function getDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Master data store
      if (!db.objectStoreNames.contains('master_data')) {
        db.createObjectStore('master_data', { keyPath: 'id' });
      }

      // Learned item aliases store (compound index or key: supplier_id + ':::' + normalized_raw_item_name)
      if (!db.objectStoreNames.contains('item_aliases')) {
        const itemStore = db.createObjectStore('item_aliases', { keyPath: 'id' });
        itemStore.createIndex('by_supplier_and_raw', ['supplier_id', 'normalized_raw_item_name'], { unique: false });
        itemStore.createIndex('by_supplier', 'supplier_id', { unique: false });
      }

      // Learned unit aliases store
      if (!db.objectStoreNames.contains('unit_aliases')) {
        db.createObjectStore('unit_aliases', { keyPath: 'normalized_raw_unit' });
      }

      // Invoice history store
      if (!db.objectStoreNames.contains('invoice_history')) {
        const histStore = db.createObjectStore('invoice_history', { keyPath: 'id' });
        histStore.createIndex('by_created', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Save Master Data into IndexedDB
 */
export async function saveMasterData(data: IposMasterData): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master_data', 'readwrite');
    const store = tx.objectStore('master_data');
    const req = store.put({ id: 'current_master_data', ...data, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Load Master Data from IndexedDB
 */
export async function loadMasterData(): Promise<IposMasterData | null> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('master_data', 'readonly');
      const store = tx.objectStore('master_data');
      const req = store.get('current_master_data');
      req.onsuccess = () => {
        if (req.result) {
          const { id, updatedAt, ...rest } = req.result;
          resolve(rest as IposMasterData);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Error loading master data from IndexedDB:', err);
    return null;
  }
}

/**
 * Save or update learned Item Alias
 */
export async function saveLearnedItemAlias(alias: {
  supplier_id: string;
  supplier_name?: string;
  normalized_raw_item_name: string;
  raw_item_sample: string;
  selected_item_id: string;
  selected_item_name: string;
  selected_unit?: string;
}): Promise<void> {
  const db = await getDb();
  const id = `${alias.supplier_id || '*'}:::${alias.normalized_raw_item_name}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('item_aliases', 'readwrite');
    const store = tx.objectStore('item_aliases');

    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as LearnedItemAlias | undefined;
      const record: LearnedItemAlias = {
        id,
        supplier_id: alias.supplier_id || '*',
        supplier_name: alias.supplier_name || '',
        normalized_raw_item_name: alias.normalized_raw_item_name,
        raw_item_sample: alias.raw_item_sample,
        selected_item_id: alias.selected_item_id,
        selected_item_name: alias.selected_item_name,
        selected_unit: alias.selected_unit || '',
        updatedAt: Date.now(),
        timesUsed: (existing?.timesUsed || 0) + 1,
      };

      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get all learned item aliases (or by supplier)
 */
export async function getLearnedItemAliases(supplierId?: string): Promise<LearnedItemAlias[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_aliases', 'readonly');
      const store = tx.objectStore('item_aliases');
      const req = store.getAll();
      req.onsuccess = () => {
        const all: LearnedItemAlias[] = req.result || [];
        if (!supplierId || supplierId === '*') {
          resolve(all);
        } else {
          // Return aliases matching this supplier OR global wildcard '*'
          resolve(all.filter((a) => a.supplier_id === supplierId || a.supplier_id === '*'));
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Error fetching aliases:', err);
    return [];
  }
}

/**
 * Delete a learned alias
 */
export async function deleteLearnedAlias(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('item_aliases', 'readwrite');
    const store = tx.objectStore('item_aliases');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save or update learned Unit Alias
 */
export async function saveLearnedUnitAlias(normalizedRawUnit: string, targetUnitName: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unit_aliases', 'readwrite');
    const store = tx.objectStore('unit_aliases');
    const req = store.put({
      normalized_raw_unit: normalizedRawUnit,
      target_unit_name: targetUnitName,
      updatedAt: Date.now(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all learned unit aliases
 */
export async function getLearnedUnitAliases(): Promise<LearnedUnitAlias[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('unit_aliases', 'readonly');
      const store = tx.objectStore('unit_aliases');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Error fetching unit aliases:', err);
    return [];
  }
}

/**
 * Delete a learned unit alias
 */
export async function deleteLearnedUnitAlias(normalizedRawUnit: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unit_aliases', 'readwrite');
    const store = tx.objectStore('unit_aliases');
    const req = store.delete(normalizedRawUnit);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------- Master Data Helper Getters/Setters ----------------------

export function getEmptyMasterData(): IposMasterData {
  return {
    items: [],
    categories: [],
    units: [],
    unitConversions: [],
    recipes: [],
    warehouses: [],
    customers: [],
    suppliers: [],
    supplierGroups: [],
    priceLists: [],
    reasons: [],
    stockNorms: [],
  };
}

// 1. Items (Hàng hoá)
export async function saveIposItem(item: IposItem): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.items = current.items || [];
  const idx = current.items.findIndex((i) => i.itemId === item.itemId);
  if (idx >= 0) {
    current.items[idx] = { ...current.items[idx], ...item };
  } else {
    current.items.unshift(item);
  }
  await saveMasterData(current);
  return current;
}

export async function deleteIposItem(itemId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.items = (current.items || []).filter((i) => i.itemId !== itemId);
  await saveMasterData(current);
  return current;
}

export async function deleteMultipleIposItems(itemIds: string[]): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  const idSet = new Set(itemIds);
  current.items = (current.items || []).filter((i) => !idSet.has(i.itemId));
  await saveMasterData(current);
  return current;
}

export async function clearAllItems(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.items = [];
  current.catalogSourceInfo = undefined;
  await saveMasterData(current);
  return current;
}

// 2. Categories (Nhóm hàng hoá)
export async function saveCategory(cat: IposItemCategory): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.categories = current.categories || [];
  const idx = current.categories.findIndex((c) => c.categoryId === cat.categoryId);
  if (idx >= 0) current.categories[idx] = { ...current.categories[idx], ...cat };
  else current.categories.unshift(cat);
  await saveMasterData(current);
  return current;
}

export async function deleteCategory(categoryId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.categories = (current.categories || []).filter((c) => c.categoryId !== categoryId);
  await saveMasterData(current);
  return current;
}

export async function clearAllCategories(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.categories = [];
  await saveMasterData(current);
  return current;
}

// 3. Units (Đơn vị tính)
export async function saveUnit(unit: IposUnit): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.units = current.units || [];
  const idx = current.units.findIndex((u) => u.unitId === unit.unitId || u.unitName.toLowerCase() === unit.unitName.toLowerCase());
  if (idx >= 0) current.units[idx] = { ...current.units[idx], ...unit };
  else current.units.unshift(unit);
  await saveMasterData(current);
  return current;
}

export async function deleteUnit(unitId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.units = (current.units || []).filter((u) => u.unitId !== unitId);
  await saveMasterData(current);
  return current;
}

export async function clearAllUnits(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.units = [];
  await saveMasterData(current);
  return current;
}

// 4. Conversions (Quy đổi ĐVT)
export async function saveUnitConversion(conv: IposUnitConversion, editIndex?: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.unitConversions = current.unitConversions || [];
  if (editIndex !== undefined && editIndex >= 0 && editIndex < current.unitConversions.length) {
    current.unitConversions[editIndex] = conv;
  } else {
    current.unitConversions.unshift(conv);
  }
  await saveMasterData(current);
  return current;
}

export async function deleteUnitConversion(index: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.unitConversions = (current.unitConversions || []).filter((_, i) => i !== index);
  await saveMasterData(current);
  return current;
}

export const deleteConversion = deleteUnitConversion;

export async function clearAllUnitConversions(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.unitConversions = [];
  await saveMasterData(current);
  return current;
}

// 5. Recipes / BOM (Công thức chế biến)
export async function saveRecipe(recipe: IposRecipe, editIndex?: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.recipes = current.recipes || [];
  if (editIndex !== undefined && editIndex >= 0 && editIndex < current.recipes.length) {
    current.recipes[editIndex] = recipe;
  } else {
    current.recipes.unshift(recipe);
  }
  await saveMasterData(current);
  return current;
}

export async function deleteRecipe(index: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.recipes = (current.recipes || []).filter((_, i) => i !== index);
  await saveMasterData(current);
  return current;
}

export async function clearAllRecipes(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.recipes = [];
  await saveMasterData(current);
  return current;
}

// 6. Warehouses (Kho hàng)
export async function saveWarehouse(warehouse: IposWarehouse): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.warehouses = current.warehouses || [];
  const idx = current.warehouses.findIndex((w) => w.warehouseId === warehouse.warehouseId);
  if (idx >= 0) current.warehouses[idx] = { ...current.warehouses[idx], ...warehouse };
  else current.warehouses.unshift(warehouse);
  await saveMasterData(current);
  return current;
}

export async function deleteWarehouse(warehouseId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.warehouses = (current.warehouses || []).filter((w) => w.warehouseId !== warehouseId);
  await saveMasterData(current);
  return current;
}

export async function clearAllWarehouses(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.warehouses = [];
  await saveMasterData(current);
  return current;
}

// 7. Customers (Khách hàng)
export async function saveCustomer(customer: IposCustomer): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.customers = current.customers || [];
  const idx = current.customers.findIndex((c) => c.customerId === customer.customerId);
  if (idx >= 0) current.customers[idx] = { ...current.customers[idx], ...customer };
  else current.customers.unshift(customer);
  await saveMasterData(current);
  return current;
}

export async function deleteCustomer(customerId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.customers = (current.customers || []).filter((c) => c.customerId !== customerId);
  await saveMasterData(current);
  return current;
}

export async function clearAllCustomers(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.customers = [];
  await saveMasterData(current);
  return current;
}

// 8. Suppliers (Nhà cung cấp)
export async function saveSupplier(supplier: IposSupplier): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.suppliers = current.suppliers || [];
  const idx = current.suppliers.findIndex((s) => s.supplierId === supplier.supplierId);
  if (idx >= 0) current.suppliers[idx] = { ...current.suppliers[idx], ...supplier };
  else current.suppliers.unshift(supplier);
  await saveMasterData(current);
  return current;
}

export async function deleteSupplier(supplierId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.suppliers = (current.suppliers || []).filter((s) => s.supplierId !== supplierId);
  await saveMasterData(current);
  return current;
}

export async function clearAllSuppliers(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.suppliers = [];
  await saveMasterData(current);
  return current;
}

// 9. Supplier Groups (Nhóm nhà cung cấp)
export async function saveSupplierGroup(group: IposSupplierGroup): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.supplierGroups = current.supplierGroups || [];
  const idx = current.supplierGroups.findIndex((g) => g.groupId === group.groupId);
  if (idx >= 0) current.supplierGroups[idx] = { ...current.supplierGroups[idx], ...group };
  else current.supplierGroups.unshift(group);
  await saveMasterData(current);
  return current;
}

export async function deleteSupplierGroup(groupId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.supplierGroups = (current.supplierGroups || []).filter((g) => g.groupId !== groupId);
  await saveMasterData(current);
  return current;
}

export async function clearAllSupplierGroups(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.supplierGroups = [];
  await saveMasterData(current);
  return current;
}

// 10. Price Lists (Bảng giá)
export async function savePriceList(pl: IposPriceList, editIndex?: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.priceLists = current.priceLists || [];
  if (editIndex !== undefined && editIndex >= 0 && editIndex < current.priceLists.length) {
    current.priceLists[editIndex] = pl;
  } else {
    current.priceLists.unshift(pl);
  }
  await saveMasterData(current);
  return current;
}

export async function deletePriceList(index: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.priceLists = (current.priceLists || []).filter((_, i) => i !== index);
  await saveMasterData(current);
  return current;
}

export async function clearAllPriceLists(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.priceLists = [];
  await saveMasterData(current);
  return current;
}

// 11. Reasons (Lý do)
export async function saveReason(reason: IposReason): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.reasons = current.reasons || [];
  const idx = current.reasons.findIndex((r) => r.reasonId === reason.reasonId);
  if (idx >= 0) current.reasons[idx] = { ...current.reasons[idx], ...reason };
  else current.reasons.unshift(reason);
  await saveMasterData(current);
  return current;
}

export async function deleteReason(reasonId: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.reasons = (current.reasons || []).filter((r) => r.reasonId !== reasonId);
  await saveMasterData(current);
  return current;
}

export async function clearAllReasons(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.reasons = [];
  await saveMasterData(current);
  return current;
}

// 12. Stock Norms (Định mức tồn kho)
export async function saveStockNorm(norm: IposStockNorm, editIndex?: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.stockNorms = current.stockNorms || [];
  if (editIndex !== undefined && editIndex >= 0 && editIndex < current.stockNorms.length) {
    current.stockNorms[editIndex] = norm;
  } else {
    current.stockNorms.unshift(norm);
  }
  await saveMasterData(current);
  return current;
}

export async function deleteStockNorm(index: number): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.stockNorms = (current.stockNorms || []).filter((_, i) => i !== index);
  await saveMasterData(current);
  return current;
}

export async function clearAllStockNorms(): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.stockNorms = [];
  await saveMasterData(current);
  return current;
}

// Template
export async function saveTemplateFile(base64: string, fileName: string): Promise<IposMasterData> {
  const current = (await loadMasterData()) || getEmptyMasterData();
  current.templateWorkbookBase64 = base64;
  current.templateFileName = fileName;
  await saveMasterData(current);
  return current;
}

/**
 * Clear entire DB (All stores)
 */
export async function clearEntireDatabase(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['master_data', 'item_aliases', 'unit_aliases', 'invoice_history'], 'readwrite');
    tx.objectStore('master_data').clear();
    tx.objectStore('item_aliases').clear();
    tx.objectStore('unit_aliases').clear();
    tx.objectStore('invoice_history').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Export all DB contents as JSON backup
 */
export async function exportAllDataAsJson(): Promise<string> {
  const masterData = await loadMasterData();
  const itemAliases = await getLearnedItemAliases();
  const unitAliases = await getLearnedUnitAliases();
  const history = await getInvoiceHistory();

  const backup = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    masterData,
    itemAliases,
    unitAliases,
    history,
  };

  return JSON.stringify(backup, null, 2);
}

/**
 * Import all data from JSON backup
 */
export async function importAllDataFromJson(jsonStr: string): Promise<{ masterData: IposMasterData; aliasesCount: number }> {
  const data = JSON.parse(jsonStr);
  if (!data || typeof data !== 'object') {
    throw new Error('Dữ liệu JSON không hợp lệ.');
  }

  if (data.masterData) {
    await saveMasterData(data.masterData);
  }

  let aliasesCount = 0;
  if (Array.isArray(data.itemAliases)) {
    for (const alias of data.itemAliases) {
      await saveLearnedItemAlias(alias);
      aliasesCount++;
    }
  }

  if (Array.isArray(data.unitAliases)) {
    for (const u of data.unitAliases) {
      await saveLearnedUnitAlias(u.normalized_raw_unit, u.target_unit_name);
    }
  }

  return {
    masterData: data.masterData || getEmptyMasterData(),
    aliasesCount,
  };
}

/**
 * Save review invoice snapshot in history
 */
export async function saveInvoiceSession(session: {
  id: string;
  supplierName: string;
  supplierId: string;
  warehouseId: string;
  invoiceNumber: string;
  documentDate: string;
  rows: MatchedInvoiceRow[];
  rawInvoice: RawInvoiceData;
  imagePreviewUrl?: string;
  fileName?: string;
  createdAt?: number;
}): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('invoice_history', 'readwrite');
      const store = tx.objectStore('invoice_history');
      const req = store.put({
        ...session,
        createdAt: session.createdAt || Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to save invoice session to history:', e);
  }
}

/**
 * Get invoice history list
 */
export async function getInvoiceHistory(): Promise<any[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('invoice_history', 'readonly');
      const store = tx.objectStore('invoice_history');
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}
