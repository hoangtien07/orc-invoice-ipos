import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  Download,
  Trash2,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  Database,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FolderSync,
  Box,
  Hash,
  Scale,
  ChefHat,
  Warehouse,
  Users,
  Building2,
  Tag,
  DollarSign,
  HelpCircle,
  TrendingDown,
  BookMarked,
  Sparkles,
} from 'lucide-react';
import {
  IposMasterData,
  IposItem,
  LearnedItemAlias,
  LearnedUnitAlias,
  IposItemCategory,
  IposUnit,
  IposUnitConversion,
  IposRecipe,
  IposWarehouse,
  IposCustomer,
  IposSupplier,
  IposSupplierGroup,
  IposPriceList,
  IposReason,
  IposStockNorm,
} from '../types';
import {
  parseIposMasterDataFile,
  parseCategoriesFromExcelFile,
  parseUnitsFromExcelFile,
  parseConversionsFromExcelFile,
  parseRecipesFromExcelFile,
  parseWarehousesFromExcelFile,
  parseCustomersFromExcelFile,
  parseSuppliersFromExcelFile,
  parseSupplierGroupsFromExcelFile,
  parsePriceListsFromExcelFile,
  parseReasonsFromExcelFile,
  parseStockNormsFromExcelFile,
  parseMultipleIposExcelFiles,
  exportMasterDataToExcel,
  exportCategoriesToExcel,
  exportUnitsToExcel,
  exportConversionsToExcel,
  exportRecipesToExcel,
  exportWarehousesToExcel,
  exportCustomersToExcel,
  exportSuppliersToExcel,
  exportSupplierGroupsToExcel,
  exportPriceListsToExcel,
  exportReasonsToExcel,
  exportStockNormsToExcel,
} from '../utils/excel';
import {
  saveMasterData,
  deleteMultipleIposItems,
  deleteLearnedAlias,
  deleteCategory,
  deleteUnit,
  deleteConversion,
  deleteRecipe,
  deleteWarehouse,
  deleteCustomer,
  deleteSupplier,
  deleteSupplierGroup,
  deletePriceList,
  deleteReason,
  deleteStockNorm,
} from '../utils/db';
import { normalizeVietnameseForSearch } from '../utils/vietnamese';

// Subcomponents
import { AdminConfirmDialog, ConfirmDialogState } from './admin/AdminConfirmDialog';
import { EditItemModal } from './admin/AdminModals';
import { ItemsTab } from './admin/tabs/ItemsTab';
import {
  CategoriesTab,
  UnitsTab,
  ConversionsTab,
  RecipesTab,
  WarehousesTab,
  CustomersTab,
  SuppliersTab,
  SupplierGroupsTab,
  PriceListsTab,
  ReasonsTab,
  StockNormsTab,
  AliasesTab,
} from './admin/tabs/OtherTabs';
import { TemplateTab, BackupTab } from './admin/tabs/TemplateAndBackupTab';

export type AdminTabType =
  | 'items'
  | 'categories'
  | 'units'
  | 'conversions'
  | 'recipes'
  | 'warehouses'
  | 'customers'
  | 'suppliers'
  | 'supplierGroups'
  | 'priceLists'
  | 'reasons'
  | 'stockNorms'
  | 'template'
  | 'aliases'
  | 'backup';

interface AdminScreenProps {
  masterData: IposMasterData | null;
  aliases?: LearnedItemAlias[];
  learnedAliases?: LearnedItemAlias[];
  learnedUnitAliases?: LearnedUnitAlias[];
  onMasterDataUpdated: (data: IposMasterData) => void;
  onAliasesUpdated: () => void;
  onBackToApp?: () => void;
  onSwitchToEndUser?: () => void;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({
  masterData,
  aliases: directAliases,
  learnedAliases,
  learnedUnitAliases,
  onMasterDataUpdated,
  onAliasesUpdated,
  onBackToApp,
  onSwitchToEndUser,
}) => {
  const handleBackToApp = onSwitchToEndUser || onBackToApp || (() => {});
  const aliases = useMemo(() => directAliases || learnedAliases || [], [directAliases, learnedAliases]);
  const [activeTab, setActiveTab] = useState<AdminTabType>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [uploadMode, setUploadMode] = useState<'replace' | 'merge'>('merge');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Pagination & Multi-select
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Dialog & Modal States
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [editingItem, setEditingItem] = useState<{ isNew: boolean; item: IposItem } | null>(null);

  const excelInputRef = useRef<HTMLInputElement>(null);

  // Safe data arrays
  const items = useMemo(() => masterData?.items || [], [masterData]);
  const categories = useMemo(() => masterData?.categories || [], [masterData]);
  const units = useMemo(() => masterData?.units || [], [masterData]);
  const conversions = useMemo(() => masterData?.unitConversions || [], [masterData]);
  const recipes = useMemo(() => masterData?.recipes || [], [masterData]);
  const warehouses = useMemo(() => masterData?.warehouses || [], [masterData]);
  const customers = useMemo(() => masterData?.customers || [], [masterData]);
  const suppliers = useMemo(() => masterData?.suppliers || [], [masterData]);
  const supplierGroups = useMemo(() => masterData?.supplierGroups || [], [masterData]);
  const priceLists = useMemo(() => masterData?.priceLists || [], [masterData]);
  const reasons = useMemo(() => masterData?.reasons || [], [masterData]);
  const stockNorms = useMemo(() => masterData?.stockNorms || [], [masterData]);

  // Unique categories for item filter dropdown
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.category && it.category.trim()) set.add(it.category.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered lists
  const filteredItems = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    return items.filter((it) => {
      if (selectedCategoryFilter !== 'ALL' && it.category !== selectedCategoryFilter) return false;
      if (!q) return true;
      return (
        normalizeVietnameseForSearch(it.itemName).includes(q) ||
        normalizeVietnameseForSearch(it.itemId).includes(q) ||
        (it.barcode && normalizeVietnameseForSearch(it.barcode).includes(q)) ||
        (it.unitName && normalizeVietnameseForSearch(it.unitName).includes(q))
      );
    });
  }, [items, searchQuery, selectedCategoryFilter]);

  const filteredCategories = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return categories;
    return categories.filter(
      (c) =>
        normalizeVietnameseForSearch(c.categoryName).includes(q) ||
        normalizeVietnameseForSearch(c.categoryId).includes(q)
    );
  }, [categories, searchQuery]);

  const filteredUnits = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return units;
    return units.filter(
      (u) =>
        normalizeVietnameseForSearch(u.unitName).includes(q) ||
        normalizeVietnameseForSearch(u.unitId).includes(q)
    );
  }, [units, searchQuery]);

  const filteredConversions = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return conversions;
    return conversions.filter(
      (c) =>
        (c.itemName && normalizeVietnameseForSearch(c.itemName).includes(q)) ||
        (c.itemId && normalizeVietnameseForSearch(c.itemId).includes(q)) ||
        normalizeVietnameseForSearch(c.sourceUnitName).includes(q) ||
        normalizeVietnameseForSearch(c.targetUnitName).includes(q)
    );
  }, [conversions, searchQuery]);

  const filteredRecipes = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        normalizeVietnameseForSearch(r.parentItemName).includes(q) ||
        normalizeVietnameseForSearch(r.parentItemId).includes(q) ||
        normalizeVietnameseForSearch(r.ingredientItemName).includes(q) ||
        normalizeVietnameseForSearch(r.ingredientItemId).includes(q)
    );
  }, [recipes, searchQuery]);

  const filteredWarehouses = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return warehouses;
    return warehouses.filter(
      (w) =>
        normalizeVietnameseForSearch(w.warehouseName).includes(q) ||
        normalizeVietnameseForSearch(w.warehouseId).includes(q) ||
        (w.address && normalizeVietnameseForSearch(w.address).includes(q))
    );
  }, [warehouses, searchQuery]);

  const filteredCustomers = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return customers;
    return customers.filter(
      (c) =>
        normalizeVietnameseForSearch(c.customerName).includes(q) ||
        normalizeVietnameseForSearch(c.customerId).includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.taxCode && c.taxCode.includes(q))
    );
  }, [customers, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        normalizeVietnameseForSearch(s.supplierName).includes(q) ||
        normalizeVietnameseForSearch(s.supplierId).includes(q) ||
        (s.taxCode && s.taxCode.includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
  }, [suppliers, searchQuery]);

  const filteredSupplierGroups = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return supplierGroups;
    return supplierGroups.filter((g) => {
      const id = g.groupId || g.supplierGroupId || '';
      const name = g.groupName || g.supplierGroupName || '';
      return normalizeVietnameseForSearch(name).includes(q) || normalizeVietnameseForSearch(id).includes(q);
    });
  }, [supplierGroups, searchQuery]);

  const filteredPriceLists = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return priceLists;
    return priceLists.filter(
      (p) =>
        normalizeVietnameseForSearch(p.priceListName).includes(q) ||
        normalizeVietnameseForSearch(p.itemName).includes(q) ||
        normalizeVietnameseForSearch(p.itemId).includes(q)
    );
  }, [priceLists, searchQuery]);

  const filteredReasons = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return reasons;
    return reasons.filter(
      (r) =>
        normalizeVietnameseForSearch(r.reasonName).includes(q) ||
        normalizeVietnameseForSearch(r.reasonId).includes(q)
    );
  }, [reasons, searchQuery]);

  const filteredStockNorms = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return stockNorms;
    return stockNorms.filter(
      (n) =>
        normalizeVietnameseForSearch(n.itemName).includes(q) ||
        normalizeVietnameseForSearch(n.itemId).includes(q) ||
        normalizeVietnameseForSearch(n.warehouseId).includes(q)
    );
  }, [stockNorms, searchQuery]);

  const filteredAliases = useMemo(() => {
    const q = normalizeVietnameseForSearch(searchQuery);
    if (!q) return aliases;
    return aliases.filter(
      (a) =>
        normalizeVietnameseForSearch(a.raw_item_sample).includes(q) ||
        normalizeVietnameseForSearch(a.selected_item_name).includes(q) ||
        normalizeVietnameseForSearch(a.selected_item_id).includes(q)
    );
  }, [aliases, searchQuery]);

  // Current list length & pagination helper
  const getCurrentListLength = () => {
    switch (activeTab) {
      case 'items':
        return filteredItems.length;
      case 'categories':
        return filteredCategories.length;
      case 'units':
        return filteredUnits.length;
      case 'conversions':
        return filteredConversions.length;
      case 'recipes':
        return filteredRecipes.length;
      case 'warehouses':
        return filteredWarehouses.length;
      case 'customers':
        return filteredCustomers.length;
      case 'suppliers':
        return filteredSuppliers.length;
      case 'supplierGroups':
        return filteredSupplierGroups.length;
      case 'priceLists':
        return filteredPriceLists.length;
      case 'reasons':
        return filteredReasons.length;
      case 'stockNorms':
        return filteredStockNorms.length;
      case 'aliases':
        return filteredAliases.length;
      default:
        return 0;
    }
  };

  const totalPages = Math.max(1, Math.ceil(getCurrentListLength() / pageSize));
  const paginate = <T,>(arr: T[]): T[] => {
    const start = (currentPage - 1) * pageSize;
    return arr.slice(start, start + pageSize);
  };

  // Tab definitions
  const tabsConfig: { id: AdminTabType; name: string; count: number; icon: any }[] = [
    { id: 'items', name: '1. Hàng hoá', count: items.length, icon: Box },
    { id: 'categories', name: '2. Nhóm hàng', count: categories.length, icon: Layers },
    { id: 'units', name: '3. Đơn vị tính', count: units.length, icon: Hash },
    { id: 'conversions', name: '4. Bảng quy đổi ĐVT', count: conversions.length, icon: Scale },
    { id: 'recipes', name: '5. Định lượng / BOM', count: recipes.length, icon: ChefHat },
    { id: 'warehouses', name: '6. Kho hàng', count: warehouses.length, icon: Warehouse },
    { id: 'customers', name: '7. Khách hàng', count: customers.length, icon: Users },
    { id: 'suppliers', name: '8. Nhà cung cấp', count: suppliers.length, icon: Building2 },
    { id: 'supplierGroups', name: '9. Nhóm NCC', count: supplierGroups.length, icon: Tag },
    { id: 'priceLists', name: '10. Bảng giá mua', count: priceLists.length, icon: DollarSign },
    { id: 'reasons', name: '11. Lý do xuất nhập', count: reasons.length, icon: HelpCircle },
    { id: 'stockNorms', name: '12. Định mức tồn kho', count: stockNorms.length, icon: TrendingDown },
    { id: 'template', name: 'Mẫu Excel iPOS', count: masterData?.templateFileName ? 1 : 0, icon: FileSpreadsheet },
    { id: 'aliases', name: 'Từ điển học máy (AI)', count: aliases.length, icon: BookMarked },
    { id: 'backup', name: 'Sao lưu & Phục hồi CSDL', count: 0, icon: Database },
  ];

  // Excel Single Tab Upload
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.target.files ? Array.from(e.target.files) : []) as File[];
    if (files.length === 0) return;

    if (files.length > 1) {
      await handleSmartMultiFilesUpload(files);
      return;
    }

    const file: File = files[0];
    setIsProcessing(true);
    setNotification(null);

    try {
      if (activeTab === 'items') {
        const res = await parseIposMasterDataFile(file, { mode: uploadMode }, masterData || undefined);
        await saveMasterData(res.masterData);
        onMasterDataUpdated(res.masterData);
        setNotification({
          type: 'success',
          message: `Đã nạp thành công danh mục ${res.itemCount} mặt hàng iPOS (tự động đồng bộ ${res.categoryCount} nhóm, ${res.unitCount} ĐVT, ${res.conversionCount} quy đổi).`,
        });
      } else if (activeTab === 'categories') {
        const res = await parseCategoriesFromExcelFile(file, { mode: uploadMode }, categories);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          categories: res.categories,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.categories.length} Nhóm hàng hoá.` });
      } else if (activeTab === 'units') {
        const res = await parseUnitsFromExcelFile(file, { mode: uploadMode }, units);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          units: res.units,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.units.length} Đơn vị tính.` });
      } else if (activeTab === 'conversions') {
        const res = await parseConversionsFromExcelFile(file, { mode: uploadMode }, conversions);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          unitConversions: res.conversions,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.conversions.length} Quy đổi ĐVT.` });
      } else if (activeTab === 'recipes') {
        const res = await parseRecipesFromExcelFile(file, { mode: uploadMode }, recipes);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          recipes: res.recipes,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.recipes.length} dòng Công thức (BOM).` });
      } else if (activeTab === 'warehouses') {
        const res = await parseWarehousesFromExcelFile(file, { mode: uploadMode }, warehouses);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          warehouses: res.warehouses,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.warehouses.length} Kho hàng.` });
      } else if (activeTab === 'customers') {
        const res = await parseCustomersFromExcelFile(file, { mode: uploadMode }, customers);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          customers: res.customers,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.customers.length} Khách hàng.` });
      } else if (activeTab === 'suppliers') {
        const res = await parseSuppliersFromExcelFile(file, { mode: uploadMode }, suppliers);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          suppliers: res.suppliers,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.suppliers.length} Nhà cung cấp.` });
      } else if (activeTab === 'supplierGroups') {
        const res = await parseSupplierGroupsFromExcelFile(file, { mode: uploadMode }, supplierGroups);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          supplierGroups: res.supplierGroups,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({
          type: 'success',
          message: `Đã nạp thành công ${res.supplierGroups.length} Nhóm nhà cung cấp.`,
        });
      } else if (activeTab === 'priceLists') {
        const res = await parsePriceListsFromExcelFile(file, { mode: uploadMode }, priceLists);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          priceLists: res.priceLists,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.priceLists.length} dòng Bảng giá.` });
      } else if (activeTab === 'reasons') {
        const res = await parseReasonsFromExcelFile(file, { mode: uploadMode }, reasons);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          reasons: res.reasons,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.reasons.length} Lý do xuất nhập.` });
      } else if (activeTab === 'stockNorms') {
        const res = await parseStockNormsFromExcelFile(file, { mode: uploadMode }, stockNorms);
        const updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
          stockNorms: res.stockNorms,
        };
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setNotification({ type: 'success', message: `Đã nạp thành công ${res.stockNorms.length} Định mức tồn kho.` });
      }
    } catch (err: any) {
      console.error('Error importing Excel:', err);
      setNotification({
        type: 'error',
        message: `Lỗi đọc file Excel: ${err?.message || 'Vui lòng kiểm tra lại cấu trúc file.'}`,
      });
    } finally {
      setIsProcessing(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  // Multi-file drag and drop smart recognition
  const handleSmartMultiFilesUpload = async (files: File[]) => {
    setIsProcessing(true);
    setNotification(null);
    try {
      const updated = await parseMultipleIposExcelFiles(files, masterData, { mode: uploadMode });
      await saveMasterData(updated);
      onMasterDataUpdated(updated);
      setNotification({
        type: 'success',
        message: `Đã nhận diện và nạp thành công ${files.length} file Excel vào 12 danh mục nghiệp vụ!`,
      });
    } catch (err: any) {
      console.error('Error smart multi file parse:', err);
      setNotification({
        type: 'error',
        message: `Lỗi nạp file: ${err?.message || 'Vui lòng kiểm tra định dạng file.'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export current tab to Excel
  const handleExportCurrentTab = () => {
    switch (activeTab) {
      case 'items':
        if (masterData) exportMasterDataToExcel(masterData);
        break;
      case 'categories':
        exportCategoriesToExcel(categories);
        break;
      case 'units':
        exportUnitsToExcel(units);
        break;
      case 'conversions':
        exportConversionsToExcel(conversions);
        break;
      case 'recipes':
        exportRecipesToExcel(recipes);
        break;
      case 'warehouses':
        exportWarehousesToExcel(warehouses);
        break;
      case 'customers':
        exportCustomersToExcel(customers);
        break;
      case 'suppliers':
        exportSuppliersToExcel(suppliers);
        break;
      case 'supplierGroups':
        exportSupplierGroupsToExcel(supplierGroups);
        break;
      case 'priceLists':
        exportPriceListsToExcel(priceLists);
        break;
      case 'reasons':
        exportReasonsToExcel(reasons);
        break;
      case 'stockNorms':
        exportStockNormsToExcel(stockNorms);
        break;
      default:
        break;
    }
  };

  // Clear current tab
  const handleClearCurrentTab = () => {
    const currentTabObj = tabsConfig.find((t) => t.id === activeTab);
    if (!currentTabObj) return;

    setConfirmDialog({
      isOpen: true,
      title: `Xác nhận xóa danh mục "${currentTabObj.name}"`,
      message: `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu trong tab ${currentTabObj.name}? Hành động này không thể hoàn tác.`,
      confirmText: 'Xóa toàn bộ tab',
      type: 'danger',
      onConfirm: async () => {
        let updated: IposMasterData = {
          ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
        };
        switch (activeTab) {
          case 'items':
            updated.items = [];
            break;
          case 'categories':
            updated.categories = [];
            break;
          case 'units':
            updated.units = [];
            break;
          case 'conversions':
            updated.unitConversions = [];
            break;
          case 'recipes':
            updated.recipes = [];
            break;
          case 'warehouses':
            updated.warehouses = [];
            break;
          case 'customers':
            updated.customers = [];
            break;
          case 'suppliers':
            updated.suppliers = [];
            break;
          case 'supplierGroups':
            updated.supplierGroups = [];
            break;
          case 'priceLists':
            updated.priceLists = [];
            break;
          case 'reasons':
            updated.reasons = [];
            break;
          case 'stockNorms':
            updated.stockNorms = [];
            break;
          default:
            return;
        }
        await saveMasterData(updated);
        onMasterDataUpdated(updated);
        setSelectedItemIds([]);
        setNotification({
          type: 'info',
          message: `Đã xóa sạch dữ liệu của tab ${currentTabObj.name}.`,
        });
      },
    });
  };

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const droppedFiles = (Array.from(e.dataTransfer.files) as File[]).filter(
          (f: File) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
        );
        if (droppedFiles.length > 0) {
          await handleSmartMultiFilesUpload(droppedFiles);
        }
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-emerald-950/60 backdrop-blur-sm flex flex-col items-center justify-center text-white pointer-events-none animate-in fade-in">
          <div className="p-8 bg-slate-900/90 rounded-3xl border-2 border-dashed border-emerald-400 text-center space-y-3 max-w-lg mx-4">
            <Sparkles className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-xl font-bold">Thả các file Excel iPOS vào đây</h3>
            <p className="text-sm text-slate-300">
              Hệ thống AI sẽ tự động phân loại thông minh vào 12 danh mục nghiệp vụ tương ứng.
            </p>
          </div>
        </div>
      )}

      {/* Top Navigation & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleBackToApp}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            title="Quay lại Quét Hóa Đơn"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <span>Chuẩn hóa 12 Danh mục Nghiệp vụ iPOS</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                Quản trị Admin
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Quản lý CSDL vật tư, quy đổi ĐVT, BOM, bảng giá mua và nhà cung cấp chuẩn hệ thống iPOS.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Upload Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setUploadMode('merge')}
              className={`px-3 py-1 rounded-lg transition-all ${
                uploadMode === 'merge' ? 'bg-white text-emerald-700 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              Gộp thêm (Merge)
            </button>
            <button
              onClick={() => setUploadMode('replace')}
              className={`px-3 py-1 rounded-lg transition-all ${
                uploadMode === 'replace' ? 'bg-white text-rose-700 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              Ghi đè (Replace)
            </button>
          </div>

          <button
            onClick={handleBackToApp}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
          >
            Quay lại Quét Hóa Đơn
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : notification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
            {notification.type === 'info' && <Database className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 ml-4 font-bold">
            ×
          </button>
        </div>
      )}

      {/* 12 Tabs Horizontal Scrollable Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-sm overflow-x-auto scrollbar-thin">
        <div className="flex items-center space-x-1.5 min-w-max">
          {tabsConfig.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                  setSearchQuery('');
                  setSelectedItemIds([]);
                }}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-200' : 'text-slate-400'}`} />
                <span>{tab.name}</span>
                {tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Action Header for Current Tab */}
        {activeTab !== 'template' && activeTab !== 'backup' && (
          <div className="p-4 border-b border-slate-200/80 bg-slate-50/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Search Box */}
              <div className="relative min-w-[240px] max-w-sm flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Tìm kiếm mã, tên, từ khóa..."
                  className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Category Filter (Items Tab Only) */}
              {activeTab === 'items' && uniqueCategories.length > 0 && (
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => {
                    setSelectedCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="ALL">Tất cả nhóm ({items.length})</option>
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Actions for current tab */}
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={excelInputRef}
                multiple
                accept=".xlsx,.xls"
                onChange={handleExcelImport}
                className="hidden"
              />

              {/* Import Excel */}
              <button
                disabled={isProcessing}
                onClick={() => excelInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                <span>Nạp Excel tab này</span>
              </button>

              {/* Export Excel */}
              <button
                onClick={handleExportCurrentTab}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                <span>Xuất Excel</span>
              </button>

              {/* Add New (Items tab) */}
              {activeTab === 'items' && (
                <button
                  onClick={() =>
                    setEditingItem({
                      isNew: true,
                      item: {
                        itemId: `SP_${Date.now().toString().slice(-4)}`,
                        itemName: '',
                        unitId: 'KG',
                        unitName: 'Kg',
                        status: 'Đang dùng',
                      },
                    })
                  }
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm hàng hoá</span>
                </button>
              )}

              {/* Delete All in Tab */}
              {getCurrentListLength() > 0 && (
                <button
                  onClick={handleClearCurrentTab}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors"
                  title="Xóa toàn bộ dữ liệu của tab hiện tại"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa toàn bộ</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: ITEMS */}
        {activeTab === 'items' && (
          <ItemsTab
            items={paginate(filteredItems)}
            selectedItemIds={selectedItemIds}
            onToggleSelectItem={(id) =>
              setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
            onSelectAllPage={() => {
              const pageIds = paginate<IposItem>(filteredItems).map((i: IposItem) => i.itemId);
              const allSelected = pageIds.every((id) => selectedItemIds.includes(id));
              if (allSelected) {
                setSelectedItemIds((prev) => prev.filter((id) => !pageIds.includes(id)));
              } else {
                setSelectedItemIds((prev) => Array.from(new Set([...prev, ...pageIds])));
              }
            }}
            onDeleteSelected={() => {
              if (selectedItemIds.length === 0) return;
              setConfirmDialog({
                isOpen: true,
                title: `Xác nhận xóa ${selectedItemIds.length} mặt hàng`,
                message: `Bạn có chắc muốn xóa ${selectedItemIds.length} mặt hàng đã chọn khỏi danh mục?`,
                confirmText: 'Xóa các mục đã chọn',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteMultipleIposItems(selectedItemIds);
                  onMasterDataUpdated(updated);
                  setSelectedItemIds([]);
                  setNotification({
                    type: 'success',
                    message: `Đã xóa thành công ${selectedItemIds.length} mặt hàng.`,
                  });
                },
              });
            }}
            onEditItem={(it) => setEditingItem({ isNew: false, item: { ...it } })}
            onDeleteItem={(it) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xác nhận xóa hàng hoá',
                message: `Bạn có chắc muốn xóa mặt hàng "${it.itemName}" (${it.itemId}) khỏi danh mục?`,
                confirmText: 'Xóa mặt hàng',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteMultipleIposItems([it.itemId]);
                  onMasterDataUpdated(updated);
                  setNotification({
                    type: 'success',
                    message: `Đã xóa mặt hàng "${it.itemName}".`,
                  });
                },
              });
            }}
          />
        )}

        {/* TAB 2: CATEGORIES */}
        {activeTab === 'categories' && (
          <CategoriesTab
            categories={paginate(filteredCategories)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa nhóm hàng',
                message: `Bạn có chắc muốn xóa nhóm "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteCategory(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 3: UNITS */}
        {activeTab === 'units' && (
          <UnitsTab
            units={paginate(filteredUnits)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa đơn vị tính',
                message: `Bạn có chắc muốn xóa ĐVT "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteUnit(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 4: CONVERSIONS */}
        {activeTab === 'conversions' && (
          <ConversionsTab
            conversions={paginate(filteredConversions)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(index, label) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa quy tắc quy đổi',
                message: `Bạn có chắc muốn xóa quy tắc quy đổi "${label}"?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteConversion(index);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 5: RECIPES */}
        {activeTab === 'recipes' && (
          <RecipesTab
            recipes={paginate(filteredRecipes)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(index, label) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa dòng công thức',
                message: `Bạn có chắc muốn xóa ${label}?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteRecipe(index);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 6: WAREHOUSES */}
        {activeTab === 'warehouses' && (
          <WarehousesTab
            warehouses={paginate(filteredWarehouses)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa kho hàng',
                message: `Bạn có chắc muốn xóa kho "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteWarehouse(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 7: CUSTOMERS */}
        {activeTab === 'customers' && (
          <CustomersTab
            customers={paginate(filteredCustomers)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa khách hàng',
                message: `Bạn có chắc muốn xóa khách hàng "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteCustomer(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 8: SUPPLIERS */}
        {activeTab === 'suppliers' && (
          <SuppliersTab
            suppliers={paginate(filteredSuppliers)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa nhà cung cấp',
                message: `Bạn có chắc muốn xóa NCC "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteSupplier(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 9: SUPPLIER GROUPS */}
        {activeTab === 'supplierGroups' && (
          <SupplierGroupsTab
            supplierGroups={paginate(filteredSupplierGroups)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa nhóm NCC',
                message: `Bạn có chắc muốn xóa nhóm NCC "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteSupplierGroup(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 10: PRICE LISTS */}
        {activeTab === 'priceLists' && (
          <PriceListsTab
            priceLists={paginate(filteredPriceLists)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(index, label) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa giá',
                message: `Bạn có chắc muốn xóa ${label}?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deletePriceList(index);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 11: REASONS */}
        {activeTab === 'reasons' && (
          <ReasonsTab
            reasons={paginate(filteredReasons)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa lý do',
                message: `Bạn có chắc muốn xóa lý do "${name}" (${id})?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteReason(id);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 12: STOCK NORMS */}
        {activeTab === 'stockNorms' && (
          <StockNormsTab
            stockNorms={paginate(filteredStockNorms)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(index, label) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa định mức',
                message: `Bạn có chắc muốn xóa ${label}?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  const updated = await deleteStockNorm(index);
                  onMasterDataUpdated(updated);
                },
              });
            }}
          />
        )}

        {/* TAB 13: TEMPLATE */}
        {activeTab === 'template' && (
          <TemplateTab
            masterData={masterData}
            onMasterDataUpdated={onMasterDataUpdated}
            setNotification={setNotification}
          />
        )}

        {/* TAB 14: ALIASES (LEARNED DICTIONARY) */}
        {activeTab === 'aliases' && (
          <AliasesTab
            aliases={paginate(filteredAliases)}
            currentPage={currentPage}
            pageSize={pageSize}
            onDelete={(id, name) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Xóa từ điển học máy',
                message: `Bạn có chắc muốn xóa quy tắc học máy cho "${name}"?`,
                confirmText: 'Xóa',
                type: 'danger',
                onConfirm: async () => {
                  await deleteLearnedAlias(id);
                  onAliasesUpdated();
                },
              });
            }}
          />
        )}

        {/* TAB 15: BACKUP */}
        {activeTab === 'backup' && (
          <BackupTab
            onMasterDataUpdated={onMasterDataUpdated}
            onAliasesUpdated={onAliasesUpdated}
            setNotification={setNotification}
            setConfirmDialog={setConfirmDialog}
          />
        )}

        {/* Pagination Bar */}
        {activeTab !== 'template' && activeTab !== 'backup' && getCurrentListLength() > 0 && (
          <div className="p-4 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Hiển thị{' '}
              <strong>
                {Math.min(getCurrentListLength(), (currentPage - 1) * pageSize + 1)} -{' '}
                {Math.min(getCurrentListLength(), currentPage * pageSize)}
              </strong>{' '}
              trong tổng số <strong>{getCurrentListLength()}</strong> bản ghi
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none"
              >
                <option value={15}>15 dòng / trang</option>
                <option value={25}>25 dòng / trang</option>
                <option value={50}>50 dòng / trang</option>
                <option value={100}>100 dòng / trang</option>
              </select>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-medium">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Dialogs */}
      <AdminConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

      <EditItemModal
        data={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={async (itemToSave) => {
          let updatedItems = [...items];
          if (editingItem?.isNew) {
            updatedItems.push(itemToSave);
          } else {
            updatedItems = updatedItems.map((it) => (it.itemId === itemToSave.itemId ? itemToSave : it));
          }
          const updated: IposMasterData = {
            ...(masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] }),
            items: updatedItems,
          };
          await saveMasterData(updated);
          onMasterDataUpdated(updated);
          setEditingItem(null);
          setNotification({
            type: 'success',
            message: `Đã lưu thành công mặt hàng "${itemToSave.itemName}".`,
          });
        }}
      />
    </div>
  );
};
