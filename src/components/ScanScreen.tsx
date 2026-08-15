import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  ScanLine,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  Warehouse,
  Calendar,
  Hash,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  Eye,
} from 'lucide-react';
import { IposMasterData, RawInvoiceData } from '../types';
import { SAMPLE_INVOICE_PRESETS } from '../data/mockData';

interface ScanScreenProps {
  masterData: IposMasterData | null;
  onInvoiceExtracted: (
    rawInvoice: RawInvoiceData,
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
  ) => void;
  onGotoAdmin: () => void;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({
  masterData,
  onInvoiceExtracted,
  onGotoAdmin,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Invoice Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [customSupplierName, setCustomSupplierName] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    masterData?.warehouses?.[0]?.warehouseId || ''
  );
  const [documentDate, setDocumentDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    setSelectedFile(file);

    const isPdfFile = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    setIsPdf(isPdfFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = SAMPLE_INVOICE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setSelectedSupplierId(preset.supplierId);
    setSelectedWarehouseId(preset.warehouseId);
    setDocumentDate(preset.documentDate);
    setInvoiceNumber(preset.invoiceNumber);

    // Call extraction completion directly with pre-structured mock invoice
    const supplierObj = masterData?.suppliers?.find((s) => s.supplierId === preset.supplierId);
    const warehouseObj = masterData?.warehouses?.find((w) => w.warehouseId === preset.warehouseId);

    onInvoiceExtracted(preset.rawInvoice, {
      supplierId: preset.supplierId,
      supplierName: supplierObj?.supplierName || preset.supplierName,
      warehouseId: preset.warehouseId,
      warehouseName: warehouseObj?.warehouseName || 'Kho Bếp Nóng',
      documentDate: preset.documentDate,
      invoiceNumber: preset.invoiceNumber,
      fileName: `${preset.name}.jpg`,
    });
  };

  const handleExtractWithGemini = async () => {
    if (!previewUrl) {
      setErrorMessage('Vui lòng chọn hoặc kéo thả ảnh/PDF hóa đơn.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: previewUrl,
          mimeType: selectedFile?.type || 'image/jpeg',
          fileName: selectedFile?.name || 'invoice_upload.jpg',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Không thể trích xuất hóa đơn qua Gemini AI.');
      }

      const extractedData: RawInvoiceData = result.data;

      // Auto-detect or resolve supplier & date if present
      let finalSupplierId = selectedSupplierId;
      let finalSupplierName = customSupplierName;

      if (!finalSupplierId && extractedData.supplier_raw_name) {
        const found = masterData?.suppliers?.find(
          (s) =>
            s.supplierName.toLowerCase().includes(extractedData.supplier_raw_name!.toLowerCase()) ||
            extractedData.supplier_raw_name!.toLowerCase().includes(s.supplierName.toLowerCase())
        );
        if (found) {
          finalSupplierId = found.supplierId;
          finalSupplierName = found.supplierName;
        } else {
          finalSupplierName = extractedData.supplier_raw_name;
        }
      } else if (finalSupplierId) {
        const found = masterData?.suppliers?.find((s) => s.supplierId === finalSupplierId);
        if (found) finalSupplierName = found.supplierName;
      }

      const finalDate = extractedData.document_date || documentDate;
      const finalInvoiceNo = extractedData.invoice_number || invoiceNumber;
      const warehouseObj = masterData?.warehouses?.find((w) => w.warehouseId === selectedWarehouseId);

      onInvoiceExtracted(extractedData, {
        supplierId: finalSupplierId,
        supplierName: finalSupplierName || 'Nhà cung cấp chưa đặt tên',
        warehouseId: selectedWarehouseId,
        warehouseName: warehouseObj?.warehouseName || 'Kho Tổng',
        documentDate: finalDate,
        invoiceNumber: finalInvoiceNo,
        imagePreviewUrl: previewUrl,
        fileName: selectedFile?.name,
      });
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMessage(err.message || 'Lỗi kết nối máy chủ Gemini AI');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasMasterData = (masterData?.items?.length || 0) > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Missing Master Data Alert */}
      {!hasMasterData && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong>Cơ sở dữ liệu iPOS đang trống (0 mặt hàng):</strong> Hãy chuyển sang màn hình{' '}
              <span className="font-semibold text-amber-900">Quản trị CSDL (Admin)</span> để tải lên các file Excel danh mục hàng hóa iPOS (<code>FILE_NHAP_MAU_NHAP_MUA_HANG.xlsx</code>, <code>Danh sách hàng hoá.xlsx</code>, v.v.).
            </div>
          </div>
          <button
            id="btn-goto-admin-from-scan"
            onClick={onGotoAdmin}
            className="flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shrink-0 shadow-sm transition-all"
          >
            <span>⚙️ Mở Quản trị CSDL để nạp Excel</span>
          </button>
        </div>
      )}

      {/* Preset Quick Tests Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Mẫu hóa đơn kiểm thử nhanh (1-Click Test)</span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Thử nghiệm trực tiếp các tình huống chữ viết tay, số lượng lẻ 2,5 kg và cảnh báo iPOS mà không cần tải ảnh.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SAMPLE_INVOICE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleLoadPreset(preset.id)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 transition-all flex items-center space-x-2 shadow-2xs hover:border-emerald-500/50"
            >
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Document Uploader & Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-800">Ảnh chụp / PDF hóa đơn gốc</h3>
              </div>

              {previewUrl && (
                <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg p-1 text-xs">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1 text-[11px] font-mono text-slate-500">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(200, z + 20))}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    title="Kích thước gốc"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Document Viewer / Drop Zone */}
            <div className="p-4 bg-slate-100/50 min-h-[420px] flex items-center justify-center">
              {previewUrl ? (
                <div className="w-full h-[500px] overflow-auto flex items-center justify-center p-2 rounded-xl bg-white border border-slate-200">
                  {isPdf ? (
                    <embed
                      src={previewUrl}
                      type="application/pdf"
                      className="w-full h-full rounded-lg"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Hóa đơn tải lên"
                      style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-sm transition-transform"
                    />
                  )}
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full h-[400px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                      : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
                    className="hidden"
                  />
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-semibold text-slate-800">
                    Kéo thả hoặc click để chọn ảnh/PDF hóa đơn
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Hỗ trợ định dạng JPG, JPEG, PNG, PDF. Đảm bảo chữ viết tay hoặc chữ in không bị lóa sáng.
                  </p>
                  <span className="mt-4 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl border border-slate-300/80 transition-colors">
                    Chọn tệp từ máy tính
                  </span>
                </div>
              )}
            </div>

            {previewUrl && (
              <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-2 truncate">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate font-medium text-slate-700">
                    {selectedFile?.name || 'Ảnh hóa đơn được tải lên'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium ml-4 shrink-0"
                >
                  Đổi ảnh khác
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Invoice Metadata & Extraction Control (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Thông tin chứng từ nhập mua</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cấu hình kho nhập và nhà cung cấp để gán mã chứng từ iPOS chuẩn xác.
              </p>
            </div>

            {/* Warehouse Selector (Required) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kho nhập hàng iPOS (*)</span>
              </label>
              <select
                id="select-warehouse"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white text-xs font-medium text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                {masterData?.warehouses && masterData.warehouses.length > 0 ? (
                  masterData.warehouses.map((wh) => (
                    <option key={wh.warehouseId} value={wh.warehouseId}>
                      [{wh.warehouseId}] {wh.warehouseName}
                    </option>
                  ))
                ) : (
                  <option value="KHO_TONG">Kho Tổng Trung Tâm</option>
                )}
              </select>
            </div>

            {/* Supplier Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Nhà cung cấp (Tùy chọn hoặc để AI tự đọc)</span>
              </label>
              <select
                id="select-supplier"
                value={selectedSupplierId}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value);
                  if (e.target.value) {
                    const supp = masterData?.suppliers?.find((s) => s.supplierId === e.target.value);
                    if (supp) setCustomSupplierName(supp.supplierName);
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-white text-xs font-medium text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">-- Để Gemini AI tự động nhận diện tên NCC --</option>
                {masterData?.suppliers?.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    [{s.supplierId}] {s.supplierName}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Date & Invoice No */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ngày chứng từ</span>
                </label>
                <input
                  id="input-doc-date"
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <Hash className="w-3.5 h-3.5 text-slate-500" />
                  <span>Số hóa đơn / Phiếu</span>
                </label>
                <input
                  id="input-invoice-number"
                  type="text"
                  placeholder="VD: GH-2025/01"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{errorMessage}</div>
                </div>
                <div className="flex items-center justify-end space-x-2 pt-1 border-t border-rose-200/60">
                  <button
                    type="button"
                    onClick={handleExtractWithGemini}
                    disabled={isProcessing || !previewUrl}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-2xs"
                  >
                    <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>Thử lại ngay</span>
                  </button>
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              id="btn-extract-gemini"
              onClick={handleExtractWithGemini}
              disabled={isProcessing || !previewUrl}
              className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center space-x-2 transition-all shadow-md ${
                isProcessing || !previewUrl
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-lg active:scale-[0.99]'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Gemini AI đang đọc chữ & đối chiếu...</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-5 h-5" />
                  <span>Bắt đầu nhận diện & đối chiếu iPOS</span>
                </>
              )}
            </button>

            {/* Model & Security Note */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Xử lý Server-side qua Gemini 3.7 Flash & Fallback</span>
              </span>
              <span>Bảo mật API Key</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
