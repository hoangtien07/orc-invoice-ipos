import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Loader2,
  Eye,
  X,
  Layers,
  Building,
  Warehouse,
  Calendar,
  Image as ImageIcon,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  InvoiceDocumentSession,
  InvoiceImageItem,
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
  RawInvoiceData,
} from '../types';
import { compressImageIfNeeded, groupExtractedInvoices } from '../utils/invoiceGrouper';

interface ScanScreenProps {
  masterData: IposMasterData | null;
  learnedAliases?: LearnedItemAlias[];
  learnedUnitAliases?: LearnedUnitAlias[];
  onInvoicesExtracted: (invoices: InvoiceDocumentSession[]) => void;
  onGotoAdmin: () => void;
}

interface SelectedUploadFile {
  id: string;
  file: File;
  previewUrl: string;
  isPdf: boolean;
  status: 'pending' | 'scanning' | 'done' | 'error';
  errorMsg?: string;
  extractedData?: RawInvoiceData;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({
  masterData,
  learnedAliases = [],
  learnedUnitAliases = [],
  onInvoicesExtracted,
  onGotoAdmin,
}) => {
  const [fileList, setFileList] = useState<SelectedUploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [currentScanIndex, setCurrentScanIndex] = useState<number>(0);
  const [scanProgressPercent, setScanProgressPercent] = useState<number>(0);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Form options applied to invoices if user desires
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    masterData?.warehouses?.[0]?.warehouseId || 'KHO_TONG'
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // Image Lightbox
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add files to list
  const handleAddFiles = async (files: FileList | File[]) => {
    setGeneralError(null);
    const newItems: SelectedUploadFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      try {
        const compressedBase64 = await compressImageIfNeeded(file);
        newItems.push({
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file,
          previewUrl: compressedBase64,
          isPdf,
          status: 'pending',
        });
      } catch (e) {
        console.warn('Image processing error:', e);
      }
    }

    if (newItems.length > 0) {
      setFileList((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFileList((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClearAll = () => {
    setFileList([]);
    setGeneralError(null);
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
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // Run batch extraction with Gemini AI sequentially
  const handleStartBatchExtraction = async () => {
    if (fileList.length === 0) {
      setGeneralError('Vui lòng chọn ít nhất một ảnh hoặc file hóa đơn.');
      return;
    }

    setIsBatchProcessing(true);
    setGeneralError(null);

    const pendingFiles = [...fileList];
    const extractedResults: Array<{
      image: InvoiceImageItem;
      rawInvoice: RawInvoiceData;
    }> = [];

    let successCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const item = pendingFiles[i];
      setCurrentScanIndex(i + 1);
      setScanProgressPercent(Math.round(((i) / pendingFiles.length) * 100));

      // Mark current item as scanning
      setFileList((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'scanning', errorMsg: undefined } : f))
      );

      try {
        const response = await fetch('/api/extract-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: item.previewUrl,
            mimeType: item.file.type || 'image/jpeg',
            fileName: item.file.name,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Gemini không trích xuất được dữ liệu.');
        }

        const rawData: RawInvoiceData = result.data;

        // Update item in state
        setFileList((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'done', extractedData: rawData } : f))
        );

        extractedResults.push({
          image: {
            id: item.id,
            fileName: item.file.name,
            previewUrl: item.previewUrl,
            fileType: item.file.type,
            fileSize: item.file.size,
          },
          rawInvoice: rawData,
        });

        successCount++;
      } catch (err: any) {
        console.error(`Error scanning file ${item.file.name}:`, err);
        setFileList((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'error', errorMsg: err.message || 'Lỗi quét AI' } : f
          )
        );
      }

      // Small pause between items to prevent API rate spikes
      if (i < pendingFiles.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setScanProgressPercent(100);
    setIsBatchProcessing(false);

    if (extractedResults.length === 0) {
      setGeneralError('Không trích xuất được nội dung từ các ảnh đã chọn. Vui lòng thử lại với ảnh rõ nét hơn.');
      return;
    }

    // Resolve default warehouse
    const whObj = masterData?.warehouses?.find((w) => w.warehouseId === selectedWarehouseId);
    const defaultWhName = whObj ? whObj.warehouseName : 'Kho Tổng Trung Tâm';

    // Group scanned results into InvoiceDocumentSession[]
    const groupedSessions = groupExtractedInvoices(
      extractedResults,
      selectedWarehouseId,
      defaultWhName,
      masterData,
      learnedAliases,
      learnedUnitAliases,
      selectedSupplierId
    );

    // Transition to review screen
    onInvoicesExtracted(groupedSessions);
  };

  // Quick 1-Click Multi-Invoice Demonstration Preset
  const handleLoadMultiInvoiceSample = () => {
    const defaultWh = masterData?.warehouses?.[0]?.warehouseId || 'KHO_TONG';
    const defaultWhName = masterData?.warehouses?.[0]?.warehouseName || 'Kho Tổng Trung Tâm';

    const dummyResults: Array<{
      image: InvoiceImageItem;
      rawInvoice: RawInvoiceData;
    }> = [
      // Invoice 1: Rau Củ Quả Đà Lạt (2 ảnh cùng 1 hóa đơn)
      {
        image: {
          id: 'demo_img_1a',
          fileName: 'hoa_don_rau_cu_trang1.jpg',
          previewUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
        },
        rawInvoice: {
          supplier_raw_name: 'HỢP TÁC XÃ RAU SẠCH ĐÀ LẠT',
          document_date: new Date().toISOString().slice(0, 10),
          invoice_number: 'HD-RAU-2025/089',
          note: 'Trang 1 - Rau củ tươi nhập sáng',
          rows: [
            {
              line_no: 1,
              raw_item_name: 'Cà chua Đà Lạt chọn lọc',
              raw_unit: 'Kg',
              quantity: 15,
              price: 25000,
              amount: 375000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
            {
              line_no: 2,
              raw_item_name: 'Khoai tây vàng Đà Lạt',
              raw_unit: 'Kg',
              quantity: 20,
              price: 32000,
              amount: 640000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
          ],
        },
      },
      {
        image: {
          id: 'demo_img_1b',
          fileName: 'hoa_don_rau_cu_trang2.jpg',
          previewUrl: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop&q=80',
        },
        rawInvoice: {
          supplier_raw_name: 'HỢP TÁC XÃ RAU SẠCH ĐÀ LẠT',
          document_date: new Date().toISOString().slice(0, 10),
          invoice_number: 'HD-RAU-2025/089',
          note: 'Trang 2 - Gia vị và hành ngò',
          rows: [
            {
              line_no: 3,
              raw_item_name: 'Hành lá tươi',
              raw_unit: 'Kg',
              quantity: 3,
              price: 45000,
              amount: 135000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
            {
              line_no: 4,
              raw_item_name: 'Chanh tươi không hạt',
              raw_unit: 'Kg',
              quantity: 5,
              price: 35000,
              amount: 175000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
          ],
        },
      },
      // Invoice 2: Đồ uống Giải khát Coca-Cola (Hóa đơn độc lập)
      {
        image: {
          id: 'demo_img_2',
          fileName: 'phieu_giao_hang_nuoc_ngot.jpg',
          previewUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
        },
        rawInvoice: {
          supplier_raw_name: 'CÔNG TY TNHH NGK COCA-COLA VIỆT NAM',
          document_date: new Date().toISOString().slice(0, 10),
          invoice_number: 'CC-094125',
          note: 'Giao đợt 1 quầy bar',
          rows: [
            {
              line_no: 1,
              raw_item_name: 'Coca Cola lon 330ml (Thùng 24)',
              raw_unit: 'Thùng',
              quantity: 10,
              price: 210000,
              amount: 2100000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
            {
              line_no: 2,
              raw_item_name: 'Nước suối Dasani 500ml',
              raw_unit: 'Thùng',
              quantity: 15,
              price: 95000,
              amount: 1425000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
          ],
        },
      },
      // Invoice 3: Thịt tươi sống MEATDeli (Hóa đơn độc lập)
      {
        image: {
          id: 'demo_img_3',
          fileName: 'phieu_nhap_thit_meatdeli.jpg',
          previewUrl: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=600&auto=format&fit=crop&q=80',
        },
        rawInvoice: {
          supplier_raw_name: 'CÔNG TY CỔ PHẦN MEATDELI',
          document_date: new Date().toISOString().slice(0, 10),
          invoice_number: 'MD-882194',
          note: 'Thịt tươi mát buổi sáng',
          rows: [
            {
              line_no: 1,
              raw_item_name: 'Thịt ba rọi heo sạch',
              raw_unit: 'Kg',
              quantity: 12.5,
              price: 145000,
              amount: 1812500,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
            {
              line_no: 2,
              raw_item_name: 'Nạc vai heo tươi',
              raw_unit: 'Kg',
              quantity: 8,
              price: 125000,
              amount: 1000000,
              visual_certainty: 'high',
              needs_review: false,
              review_reason: null,
            },
          ],
        },
      },
    ];

    const grouped = groupExtractedInvoices(
      dummyResults,
      defaultWh,
      defaultWhName,
      masterData,
      learnedAliases,
      learnedUnitAliases
    );

    onInvoicesExtracted(grouped);
  };

  const hasMasterData = (masterData?.items?.length || 0) > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Missing Master Data Warning */}
      {!hasMasterData && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong>Cơ sở dữ liệu iPOS đang trống (0 mặt hàng):</strong> Hãy chuyển sang màn hình{' '}
              <span className="font-semibold text-amber-900">Quản trị CSDL (Admin)</span> để nạp danh mục hàng hóa iPOS.
            </div>
          </div>
          <button
            onClick={onGotoAdmin}
            className="flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shrink-0 shadow-sm transition-all"
          >
            <span>⚙️ Mở Quản trị CSDL để nạp Excel</span>
          </button>
        </div>
      )}

      {/* Quick Test Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm">Thử nghiệm nhanh tính năng Đa Hóa Đơn:</span>
          </div>
          <p className="text-xs text-slate-400">
            Trải nghiệm tải 4 ảnh tự động gom thành 3 hóa đơn độc lập, duyệt thông tin và tải Excel/ZIP.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadMultiInvoiceSample}
          className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0"
        >
          <Layers className="w-4 h-4" />
          <span>Nạp mẫu thử 3 hóa đơn tự động</span>
        </button>
      </div>

      {/* Main Upload Zone and Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload Dropzone & Thumbnails (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all bg-white relative ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/50 scale-[1.005]'
                : 'border-slate-300 hover:border-slate-400 shadow-sm'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
              className="hidden"
            />

            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-xs">
                <Upload className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Kéo thả nhiều ảnh hóa đơn hoặc click để chọn file
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Hỗ trợ tải lên cùng lúc nhiều ảnh chụp, hóa đơn viết tay, phiếu giao hàng (PNG, JPG, PDF). AI sẽ tự động phân loại theo từng hóa đơn.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
                >
                  Chọn các file ảnh từ máy tính
                </button>
              </div>
            </div>
          </div>

          {/* Selected Files Gallery */}
          {fileList.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Danh sách ảnh đã chọn ({fileList.length} ảnh)
                  </h4>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm ảnh khác</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex items-center space-x-1 px-3 py-1.5 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa tất cả</span>
                  </button>
                </div>
              </div>

              {/* Thumbnails Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {fileList.map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative group bg-slate-50 border border-slate-200 rounded-xl p-2 flex flex-col justify-between overflow-hidden shadow-2xs hover:border-slate-300 transition-all"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-4/3 bg-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
                      {item.isPdf ? (
                        <FileText className="w-8 h-8 text-slate-400" />
                      ) : (
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setPreviewModalUrl(item.previewUrl)}
                        />
                      )}

                      {/* Status Overlay */}
                      {item.status === 'scanning' && (
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs flex flex-col items-center justify-center text-white text-xs">
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mb-1" />
                          <span>Đang quét...</span>
                        </div>
                      )}

                      {item.status === 'done' && (
                        <div className="absolute top-1 right-1 p-1 bg-emerald-600 text-white rounded-full shadow-xs">
                          <Check className="w-3 h-3" />
                        </div>
                      )}

                      {item.status === 'error' && (
                        <div className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full shadow-xs">
                          <AlertCircle className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    {/* File Name & Remove */}
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 truncate max-w-[100px]" title={item.file.name}>
                        #{idx + 1}. {item.file.name}
                      </span>
                      {!isBatchProcessing && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                          title="Xóa ảnh này"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {generalError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-3 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Lỗi xử lý:</strong> {generalError}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Settings & Launch Batch Action (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Thiết lập nhập hàng iPOS</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Các cấu hình mặc định sẽ được áp dụng nếu trên hóa đơn không ghi rõ.
              </p>
            </div>

            {/* Warehouse Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kho nhập hàng mặc định (*)</span>
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

            {/* Supplier Select (Optional override) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Building className="w-3.5 h-3.5 text-blue-600" />
                <span>Nhà cung cấp (Tùy chọn)</span>
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Để AI tự nhận diện từ từng ảnh --</option>
                {masterData?.suppliers?.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    [{s.supplierId}] {s.supplierName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Nếu để trống, AI sẽ tự động đọc tên và số hóa đơn trên từng ảnh để phân loại và ghép nhà cung cấp tương ứng.
              </p>
            </div>

            {/* Batch Progress Bar during extraction */}
            {isBatchProcessing && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                  <span className="flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Đang quét ảnh {currentScanIndex} / {fileList.length}...</span>
                  </span>
                  <span>{scanProgressPercent}%</span>
                </div>

                <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${scanProgressPercent}%` }}
                  ></div>
                </div>

                <p className="text-[11px] text-emerald-700">
                  Gemini AI đang nhận diện chi tiết từng dòng mặt hàng và đối chiếu mã iPOS...
                </p>
              </div>
            )}

            {/* Launch Batch Scan Button */}
            <button
              id="btn-start-batch-scan"
              type="button"
              disabled={isBatchProcessing || fileList.length === 0}
              onClick={handleStartBatchExtraction}
              className={`w-full flex items-center justify-center space-x-2 py-3.5 px-4 rounded-2xl text-xs font-bold shadow-md transition-all ${
                isBatchProcessing || fileList.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-lg'
              }`}
            >
              {isBatchProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xử lý {fileList.length} ảnh...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    Bắt đầu nhận diện {fileList.length > 0 ? `(${fileList.length} ảnh)` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {previewModalUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2">
            <button
              type="button"
              onClick={() => setPreviewModalUrl(null)}
              className="absolute top-4 right-4 p-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewModalUrl}
              alt="Hóa đơn xem thử"
              className="max-w-full max-h-[85vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
