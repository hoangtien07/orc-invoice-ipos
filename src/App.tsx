import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ScanScreen } from './components/ScanScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { AdminScreen } from './components/AdminScreen';
import { AliasModal } from './components/AliasModal';
import { TestModal } from './components/TestModal';
import {
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
  MatchedInvoiceRow,
  RawInvoiceData,
} from './types';
import {
  getLearnedItemAliases,
  getLearnedUnitAliases,
  loadMasterData,
  saveInvoiceSession,
} from './utils/db';
import { CatalogResolver } from './utils/resolver';

export default function App() {
  const [currentView, setCurrentView] = useState<'enduser' | 'admin'>('enduser');
  const [currentStep, setCurrentStep] = useState<'scan' | 'review'>('scan');
  const [masterData, setMasterData] = useState<IposMasterData | null>(null);
  const [learnedAliases, setLearnedAliases] = useState<LearnedItemAlias[]>([]);
  const [learnedUnitAliases, setLearnedUnitAliases] = useState<LearnedUnitAlias[]>([]);

  // Current Working Invoice State
  const [rawInvoice, setRawInvoice] = useState<RawInvoiceData | null>(null);
  const [matchedRows, setMatchedRows] = useState<MatchedInvoiceRow[]>([]);
  const [invoiceMeta, setInvoiceMeta] = useState<{
    supplierId: string;
    supplierName: string;
    warehouseId: string;
    warehouseName: string;
    documentDate: string;
    invoiceNumber: string;
    imagePreviewUrl?: string;
    fileName?: string;
  }>({
    supplierId: '',
    supplierName: '',
    warehouseId: 'KHO_TONG',
    warehouseName: 'Kho Tổng Trung Tâm',
    documentDate: new Date().toISOString().slice(0, 10),
    invoiceNumber: '',
  });

  // Modal states
  const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Initialize data on mount
  useEffect(() => {
    async function init() {
      const data = await loadMasterData();
      if (data) {
        setMasterData(data);
        if (data.warehouses && data.warehouses.length > 0) {
          setInvoiceMeta((prev) => ({
            ...prev,
            warehouseId: data.warehouses[0].warehouseId,
            warehouseName: data.warehouses[0].warehouseName,
          }));
        }
      }

      await refreshAliases();
    }

    init();
  }, []);

  const refreshAliases = async () => {
    const itemAliases = await getLearnedItemAliases();
    const unitAliases = await getLearnedUnitAliases();
    setLearnedAliases(itemAliases);
    setLearnedUnitAliases(unitAliases);
  };

  const handleMasterDataUpdated = (data: IposMasterData) => {
    setMasterData(data);
    if (data.warehouses && data.warehouses.length > 0 && !invoiceMeta.warehouseId) {
      setInvoiceMeta((prev) => ({
        ...prev,
        warehouseId: data.warehouses[0].warehouseId,
        warehouseName: data.warehouses[0].warehouseName,
      }));
    }
  };

  const handleInvoiceExtracted = (
    extracted: RawInvoiceData,
    meta: {
      supplierId: string;
      supplierName: string;
      warehouseId: string;
      warehouseName: string;
      documentDate: string;
      invoiceNumber: string;
      imagePreviewUrl?: string;
      fileName?: string;
    }
  ) => {
    setRawInvoice(extracted);
    setInvoiceMeta(meta);

    // Resolve catalog and fuzzy matching
    const resolver = new CatalogResolver(
      masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] },
      learnedAliases,
      learnedUnitAliases
    );

    const processed = resolver.processInvoiceRows(extracted.rows, meta.supplierId);
    setMatchedRows(processed);

    // Save session to history
    saveInvoiceSession({
      id: `inv_${Date.now()}`,
      supplierName: meta.supplierName,
      supplierId: meta.supplierId,
      warehouseId: meta.warehouseId,
      invoiceNumber: meta.invoiceNumber,
      documentDate: meta.documentDate,
      rows: processed,
      rawInvoice: extracted,
      imagePreviewUrl: meta.imagePreviewUrl,
      fileName: meta.fileName,
    });

    setCurrentStep('review');
  };

  const handleResetAll = () => {
    setRawInvoice(null);
    setMatchedRows([]);
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
                onInvoiceExtracted={handleInvoiceExtracted}
                onGotoAdmin={() => setCurrentView('admin')}
              />
            )}

            {currentStep === 'review' && (
              <ReviewScreen
                rows={matchedRows}
                setRows={setMatchedRows}
                masterData={masterData}
                rawInvoice={rawInvoice}
                meta={invoiceMeta}
                learnedAliases={learnedAliases}
                learnedUnitAliases={learnedUnitAliases}
                onAliasesUpdated={refreshAliases}
                onBackToScan={() => setCurrentStep('scan')}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>iPOS Invoice AI</strong> — Xử lý hóa đơn & phiếu xuất kho nhà hàng sang Excel iPOS Inventory
          </div>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>Admin CSDL & End User Nhập mua hàng</span>
            <span>•</span>
            <span>IndexedDB Storage</span>
            <span>•</span>
            <span>Fuzzy Match + AI Aliases</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
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

