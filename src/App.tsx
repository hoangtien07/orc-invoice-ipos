import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ScanScreen } from './components/ScanScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { AdminScreen } from './components/AdminScreen';
import { ReconciliationScreen } from './components/ReconciliationScreen';
import { AliasModal } from './components/AliasModal';
import { TestModal } from './components/TestModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import {
  InvoiceDocumentSession,
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
} from './types';
import {
  getLearnedItemAliases,
  getLearnedUnitAliases,
  loadMasterData,
  saveInvoiceSession,
} from './utils/db';
import { syncService, SyncInfo } from './utils/syncService';

export default function App() {
  const [currentView, setCurrentView] = useState<'enduser' | 'admin'>('enduser');
  const [currentStep, setCurrentStep] = useState<'scan' | 'review' | 'reconcile'>('scan');
  const [masterData, setMasterData] = useState<IposMasterData | null>(null);
  const [learnedAliases, setLearnedAliases] = useState<LearnedItemAlias[]>([]);
  const [learnedUnitAliases, setLearnedUnitAliases] = useState<LearnedUnitAlias[]>([]);

  // Cloud Sync state
  const [syncInfo, setSyncInfo] = useState<SyncInfo>(syncService.getSyncInfo());
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);

  // Current Working Invoices Sessions State (Multiple Invoices support)
  const [invoices, setInvoices] = useState<InvoiceDocumentSession[]>([]);

  // Modal states
  const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Initialize data on mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      // 1. Instant Local Load (Local-First)
      const data = await loadMasterData();
      if (isMounted && data) {
        setMasterData(data);
      }
      await refreshAliases();

      // 2. Initialize Cloud Sync (Firebase Firestore Shared Store)
      try {
        await syncService.init();
      } catch (err) {
        console.warn('Sync init warning:', err);
      }
    }

    init();

    // 3. Listen to Sync Status changes
    const unsubSync = syncService.subscribeSync((info) => {
      if (isMounted) setSyncInfo(info);
    });

    // 4. Listen to real-time changes from other devices on the shared store
    const unsubMaster = syncService.onRemoteMasterData((remote) => {
      if (isMounted) setMasterData(remote);
    });

    const unsubAliases = syncService.onRemoteAliases(() => {
      if (isMounted) refreshAliases();
    });

    return () => {
      isMounted = false;
      unsubSync();
      unsubMaster();
      unsubAliases();
    };
  }, []);

  const refreshAliases = async () => {
    const itemAliases = await getLearnedItemAliases();
    const unitAliases = await getLearnedUnitAliases();
    setLearnedAliases(itemAliases);
    setLearnedUnitAliases(unitAliases);
  };

  const handleMasterDataUpdated = (data: IposMasterData) => {
    setMasterData(data);
  };

  const handleInvoicesExtracted = (extractedInvoices: InvoiceDocumentSession[]) => {
    setInvoices(extractedInvoices);

    // Save all invoice sessions into history asynchronously
    for (const inv of extractedInvoices) {
      saveInvoiceSession({
        id: inv.id,
        supplierName: inv.supplierName,
        supplierId: inv.supplierId,
        warehouseId: inv.warehouseId,
        invoiceNumber: inv.invoiceNumber,
        documentDate: inv.documentDate,
        rows: inv.matchedRows,
        rawInvoice: inv.rawInvoice,
        imagePreviewUrl: inv.images?.[0]?.previewUrl,
        fileName: inv.images?.map((i) => i.fileName).join(', '),
      });
    }

    setCurrentStep('review');
  };

  const handleResetAll = () => {
    setInvoices([]);
    setCurrentStep('scan');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Navbar with Mode Toggle */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        masterData={masterData}
        syncInfo={syncInfo}
        onOpenCloudSync={() => setIsCloudSyncModalOpen(true)}
        onOpenAliasManager={() => setIsAliasModalOpen(true)}
        onOpenTestRunner={() => setIsTestModalOpen(true)}
        onResetAll={handleResetAll}
      />

      {/* Main View Area */}
      <main className="flex-1">
        {currentView === 'admin' ? (
          <AdminScreen
            masterData={masterData}
            onMasterDataUpdated={handleMasterDataUpdated}
            learnedAliases={learnedAliases}
            learnedUnitAliases={learnedUnitAliases}
            onAliasesUpdated={refreshAliases}
            onSwitchToEndUser={() => setCurrentView('enduser')}
          />
        ) : (
          <>
            {currentStep === 'scan' && (
              <ScanScreen
                masterData={masterData}
                learnedAliases={learnedAliases}
                learnedUnitAliases={learnedUnitAliases}
                onInvoicesExtracted={handleInvoicesExtracted}
                onGotoAdmin={() => setCurrentView('admin')}
              />
            )}

            {currentStep === 'review' && (
              <ReviewScreen
                invoices={invoices}
                setInvoices={setInvoices}
                masterData={masterData}
                learnedAliases={learnedAliases}
                learnedUnitAliases={learnedUnitAliases}
                onAliasesUpdated={refreshAliases}
                onBackToScan={() => setCurrentStep('scan')}
                onOpenAliasManager={() => setIsAliasModalOpen(true)}
              />
            )}

            {currentStep === 'reconcile' && (
              <ReconciliationScreen
                masterData={masterData}
                learnedAliases={learnedAliases}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>iPOS Invoice AI</strong> — Xử lý nhận diện đa hóa đơn & phiếu xuất kho sang Excel iPOS Inventory
          </div>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>Nhận diện nhiều ảnh cùng lúc</span>
            <span>•</span>
            <span>Tự động gom nhóm & xuất file riêng</span>
            <span>•</span>
            <span>Hỗ trợ tải file nén ZIP</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CloudSyncModal
        isOpen={isCloudSyncModalOpen}
        onClose={() => setIsCloudSyncModalOpen(false)}
        syncInfo={syncInfo}
        masterData={masterData}
        aliasesCount={learnedAliases.length}
        onRefreshLocal={async () => {
          const fresh = await loadMasterData();
          if (fresh) setMasterData(fresh);
          await refreshAliases();
        }}
      />

      <AliasModal
        isOpen={isAliasModalOpen}
        onClose={() => setIsAliasModalOpen(false)}
        masterData={masterData}
        aliases={learnedAliases}
        unitAliases={learnedUnitAliases}
        onRefresh={refreshAliases}
      />

      <TestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />
    </div>
  );
}
