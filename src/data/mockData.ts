import { IposMasterData, RawInvoiceData } from '../types';

export const SAMPLE_IPOS_MASTER_DATA: IposMasterData = {
  // 1. Hàng hoá
  items: [
    { itemId: 'HH0001', itemName: 'Thịt bò ba chỉ Úc đông lạnh', unitId: 'KG', unitName: 'kg', costPrice: 195000, category: 'Thịt tươi & đông lạnh', categoryId: 'NH01', barcode: '8930001001', status: 'Đang dùng' },
    { itemId: 'HH0002', itemName: 'Thăn bò Úc tươi cắt lát', unitId: 'KG', unitName: 'kg', costPrice: 280000, category: 'Thịt tươi & đông lạnh', categoryId: 'NH01', barcode: '8930001002', status: 'Đang dùng' },
    { itemId: 'HH0003', itemName: 'Sữa tươi tiệt trùng TH True Milk không đường 1L', unitId: 'HOP', unitName: 'hộp', costPrice: 34000, category: 'Sữa & bơ sữa', categoryId: 'NH02', barcode: '8930001003', status: 'Đang dùng' },
    { itemId: 'HH0004', itemName: 'Sữa đặc có đường Ông Thọ đỏ 380g', unitId: 'LON', unitName: 'lon', costPrice: 24500, category: 'Sữa & bơ sữa', categoryId: 'NH02', barcode: '8930001004', status: 'Đang dùng' },
    { itemId: 'HH0005', itemName: 'Rau xà lách Romaine sạch Đà Lạt', unitId: 'KG', unitName: 'kg', costPrice: 42000, category: 'Rau củ quả', categoryId: 'NH03', barcode: '8930001005', status: 'Đang dùng' },
    { itemId: 'HH0006', itemName: 'Cà chua bi tươi Đà Lạt', unitId: 'KG', unitName: 'kg', costPrice: 35000, category: 'Rau củ quả', categoryId: 'NH03', barcode: '8930001006', status: 'Đang dùng' },
    { itemId: 'HH0007', itemName: 'Đường kính trắng Biên Hòa 1kg', unitId: 'GOI', unitName: 'gói', costPrice: 26000, category: 'Gia vị & phụ gia', categoryId: 'NH04', barcode: '8930001007', status: 'Đang dùng' },
    { itemId: 'HH0008', itemName: 'Nước sốt tiêu đen Lee Kum Kee 500g', unitId: 'CHAI', unitName: 'chai', costPrice: 68000, category: 'Gia vị & phụ gia', categoryId: 'NH04', barcode: '8930001008', status: 'Đang dùng' },
    { itemId: 'HH0009', itemName: 'Hạt cà phê Robusta rang mộc Đắk Lắk', unitId: 'KG', unitName: 'kg', costPrice: 185000, category: 'Nguyên liệu pha chế', categoryId: 'NH05', barcode: '8930001009', status: 'Đang dùng' },
    { itemId: 'HH0010', itemName: 'Trà lài thượng hạng Lộc Phát 500g', unitId: 'GOI', unitName: 'gói', costPrice: 115000, category: 'Nguyên liệu pha chế', categoryId: 'NH05', barcode: '8930001010', status: 'Đang dùng' },
    { itemId: 'HH0011', itemName: 'Bột béo B-One Thái Lan 1kg', unitId: 'GOI', unitName: 'gói', costPrice: 65000, category: 'Nguyên liệu pha chế', categoryId: 'NH05', barcode: '8930001011', status: 'Đang dùng' },
    { itemId: 'HH0012', itemName: 'Bơ lạt Anchor New Zealand 227g', unitId: 'HOP', unitName: 'hộp', costPrice: 75000, category: 'Sữa & bơ sữa', categoryId: 'NH02', barcode: '8930001012', status: 'Đang dùng' },
    { itemId: 'HH0013', itemName: 'Phô mai Mozzarella bào sợi 1kg', unitId: 'GOI', unitName: 'gói', costPrice: 190000, category: 'Sữa & bơ sữa', categoryId: 'NH02', barcode: '8930001013', status: 'Đang dùng' },
    { itemId: 'HH0014', itemName: 'Dầu ăn Simply đậu nành 5L', unitId: 'CAN', unitName: 'can', costPrice: 275000, category: 'Gia vị & phụ gia', categoryId: 'NH04', barcode: '8930001014', status: 'Đang dùng' },
    { itemId: 'HH0015', itemName: 'Hành tây trắng Đà Lạt', unitId: 'KG', unitName: 'kg', costPrice: 22000, category: 'Rau củ quả', categoryId: 'NH03', barcode: '8930001015', status: 'Đang dùng' },
    { itemId: '35G8YERBXDA4', itemName: 'Máy hút bụi cầm tay mini', unitId: 'CAI', unitName: 'Cái', costPrice: 450000, category: 'Thiết bị & Dụng cụ', categoryId: 'NH06', barcode: '8930001016', status: 'Đang dùng' },
  ],

  // 2. Nhóm hàng hoá
  categories: [
    { categoryId: 'NH01', categoryName: 'Thịt tươi & đông lạnh', description: 'Các loại thịt bò, heo, gà, hải sản' },
    { categoryId: 'NH02', categoryName: 'Sữa & bơ sữa', description: 'Sữa chua, bơ lạt, phô mai, whipping cream' },
    { categoryId: 'NH03', categoryName: 'Rau củ quả', description: 'Rau xanh, nấm, củ quả nhập hàng ngày' },
    { categoryId: 'NH04', categoryName: 'Gia vị & phụ gia', description: 'Đường, muối, tiêu, nước sốt đóng chai' },
    { categoryId: 'NH05', categoryName: 'Nguyên liệu pha chế', description: 'Trà, cà phê, siro, bột béo, trân châu' },
    { categoryId: 'NH06', categoryName: 'Thiết bị & Dụng cụ', description: 'Dụng cụ quầy bar, thiết bị làm bếp' },
  ],

  // 3. Đơn vị tính
  units: [
    { unitId: 'KG', unitName: 'kg', description: 'Kilogram' },
    { unitId: 'GRAM', unitName: 'g', description: 'Gram' },
    { unitId: 'HOP', unitName: 'hộp', description: 'Hộp giấy/nhựa' },
    { unitId: 'LON', unitName: 'lon', description: 'Lon thiếc/nhôm' },
    { unitId: 'CHAI', unitName: 'chai', description: 'Chai thủy tinh/nhựa' },
    { unitId: 'GOI', unitName: 'gói', description: 'Gói / túi bao bì' },
    { unitId: 'CAN', unitName: 'can', description: 'Can 5L / 10L' },
    { unitId: 'CAI', unitName: 'cái', description: 'Cái / chiếc' },
    { unitId: 'THUNG', unitName: 'thùng', description: 'Thùng carton' },
    { unitId: 'BAO', unitName: 'bao', description: 'Bao tải lớn' },
    { unitId: 'KET', unitName: 'két', description: 'Két nhựa nước ngọt/bia' },
  ],

  // 4. Quy đổi đơn vị tính
  unitConversions: [
    { itemId: 'HH0003', itemName: 'Sữa tươi tiệt trùng TH True Milk không đường 1L', sourceUnitName: 'thùng', targetUnitName: 'hộp', conversionRate: 12, description: '1 thùng = 12 hộp 1L' },
    { itemId: 'HH0004', itemName: 'Sữa đặc có đường Ông Thọ đỏ 380g', sourceUnitName: 'thùng', targetUnitName: 'lon', conversionRate: 24, description: '1 thùng = 24 lon 380g' },
    { itemId: 'HH0007', itemName: 'Đường kính trắng Biên Hòa 1kg', sourceUnitName: 'bao', targetUnitName: 'gói', conversionRate: 50, description: '1 bao = 50 gói 1kg' },
    { itemId: 'HH0008', itemName: 'Nước sốt tiêu đen Lee Kum Kee 500g', sourceUnitName: 'thùng', targetUnitName: 'chai', conversionRate: 12, description: '1 thùng = 12 chai 500g' },
    { itemId: 'HH0010', itemName: 'Trà lài thượng hạng Lộc Phát 500g', sourceUnitName: 'thùng', targetUnitName: 'gói', conversionRate: 20, description: '1 thùng = 20 gói 500g' },
  ],

  // 5. Công thức chế biến (BOM)
  recipes: [
    { recipeId: 'BOM01', parentItemId: 'TP01', parentItemName: 'Bò bít tết sốt tiêu đen', ingredientItemId: 'HH0002', ingredientItemName: 'Thăn bò Úc tươi cắt lát', quantity: 0.2, unitName: 'kg', lossRate: 5, note: '200g thăn bò' },
    { recipeId: 'BOM01', parentItemId: 'TP01', parentItemName: 'Bò bít tết sốt tiêu đen', ingredientItemId: 'HH0008', ingredientItemName: 'Nước sốt tiêu đen Lee Kum Kee 500g', quantity: 0.05, unitName: 'chai', lossRate: 0, note: '50g sốt tiêu' },
    { recipeId: 'BOM01', parentItemId: 'TP01', parentItemName: 'Bò bít tết sốt tiêu đen', ingredientItemId: 'HH0012', ingredientItemName: 'Bơ lạt Anchor New Zealand 227g', quantity: 0.02, unitName: 'hộp', lossRate: 0, note: '20g bơ lạt' },
    { recipeId: 'BOM02', parentItemId: 'TP02', parentItemName: 'Trà sữa Lài kem béo', ingredientItemId: 'HH0010', ingredientItemName: 'Trà lài thượng hạng Lộc Phát 500g', quantity: 0.03, unitName: 'gói', lossRate: 2, note: '30g cốt trà' },
    { recipeId: 'BOM02', parentItemId: 'TP02', parentItemName: 'Trà sữa Lài kem béo', ingredientItemId: 'HH0011', ingredientItemName: 'Bột béo B-One Thái Lan 1kg', quantity: 0.04, unitName: 'gói', lossRate: 0, note: '40g bột béo' },
    { recipeId: 'BOM02', parentItemId: 'TP02', parentItemName: 'Trà sữa Lài kem béo', ingredientItemId: 'HH0004', ingredientItemName: 'Sữa đặc có đường Ông Thọ đỏ 380g', quantity: 0.05, unitName: 'lon', lossRate: 0, note: '30ml sữa đặc' },
  ],

  // 6. Kho hàng
  warehouses: [
    { warehouseId: 'KHO_TONG', warehouseName: 'Kho Tổng Trung Tâm', branchId: 'CN_HQ', address: 'Kho Trung chuyển Logistics KCN Tân Bình', phone: '028.38123456' },
    { warehouseId: 'KHO_BEP', warehouseName: 'Kho Bếp Nóng - CN1', branchId: 'CN01', address: '120 Nguyễn Huệ, Quận 1, TP.HCM', phone: '028.38221133' },
    { warehouseId: 'KHO_BAR', warehouseName: 'Kho Quầy Bar & Pha Chế', branchId: 'CN01', address: '120 Nguyễn Huệ, Quận 1, TP.HCM', phone: '028.38221144' },
    { warehouseId: 'KHO_LANH', warehouseName: 'Kho Lạnh Cấp Đông', branchId: 'CN_HQ', address: 'Kho nhiệt độ -18°C KCN Tân Bình', phone: '028.38123457' },
  ],

  // 7. Khách hàng
  customers: [
    { customerId: 'KH001', customerName: 'Khách hàng thân thiết VIP', phone: '0909123456', address: 'Quận 1, TP.HCM', customerGroup: 'VIP' },
    { customerId: 'KH002', customerName: 'Công ty Du lịch Bến Thành', phone: '02838998877', address: 'Quận 3, TP.HCM', taxCode: '0301234567', customerGroup: 'DOANH_NGHIEP' },
    { customerId: 'KH003', customerName: 'Khách lẻ vãng lai', customerGroup: 'KHACH_LE' },
  ],

  // 8. Nhà cung cấp
  suppliers: [
    { supplierId: 'NCC001', supplierName: 'Công ty CP Thực phẩm Sao Mai', phone: '0901234567', taxCode: '0102345678', address: 'Số 12 Kim Mã, Ba Đình, Hà Nội', supplierGroup: 'THUC_PHAM' },
    { supplierId: 'NCC002', supplierName: 'Đại lý Nông sản Đà Lạt Xanh', phone: '0988765432', taxCode: '5800123456', address: 'Chợ đầu mối Nông sản Thủ Đức', supplierGroup: 'RAU_CU' },
    { supplierId: 'NCC003', supplierName: 'Công ty TNHH Sữa & Bơ Phổ Thông', phone: '0912334455', taxCode: '0311223344', address: 'KCN Tân Bình, TP.HCM', supplierGroup: 'BO_SUA' },
    { supplierId: 'NCC004', supplierName: 'Cửa hàng Bách Hóa Nguyên Liệu An Nhiên', phone: '0977112233', taxCode: '0314556677', address: '45 Lê Lợi, Q.1, TP.HCM', supplierGroup: 'PHA_CHE' },
  ],

  // 9. Nhóm nhà cung cấp
  supplierGroups: [
    { groupId: 'THUC_PHAM', groupName: 'Nhà cung cấp Thực phẩm & Thịt', description: 'Các đơn vị cung ứng thịt bò, heo, gia cầm' },
    { groupId: 'RAU_CU', groupName: 'Nhà cung cấp Rau củ quả tươi', description: 'Nông trại và chợ đầu mối cung cấp hàng ngày' },
    { groupId: 'BO_SUA', groupName: 'Nhà cung cấp Bơ sữa & Phô mai', description: 'Đơn vị nhập khẩu bơ, sữa tươi tiệt trùng' },
    { groupId: 'PHA_CHE', groupName: 'Nhà cung cấp Nguyên liệu pha chế', description: 'Cà phê, trà, siro, hương liệu quầy bar' },
  ],

  // 10. Bảng giá
  priceLists: [
    { priceListId: 'BG_MUA_STANDARD', priceListName: 'Bảng giá mua hợp đồng chuẩn 2025', itemId: 'HH0001', itemName: 'Thịt bò ba chỉ Úc đông lạnh', unitName: 'kg', price: 195000, effectiveDate: '2025-01-01' },
    { priceListId: 'BG_MUA_STANDARD', priceListName: 'Bảng giá mua hợp đồng chuẩn 2025', itemId: 'HH0002', itemName: 'Thăn bò Úc tươi cắt lát', unitName: 'kg', price: 280000, effectiveDate: '2025-01-01' },
    { priceListId: 'BG_MUA_STANDARD', priceListName: 'Bảng giá mua hợp đồng chuẩn 2025', itemId: 'HH0003', itemName: 'Sữa tươi tiệt trùng TH True Milk không đường 1L', unitName: 'hộp', price: 34000, effectiveDate: '2025-01-01' },
    { priceListId: 'BG_MUA_STANDARD', priceListName: 'Bảng giá mua hợp đồng chuẩn 2025', itemId: 'HH0009', itemName: 'Hạt cà phê Robusta rang mộc Đắk Lắk', unitName: 'kg', price: 185000, effectiveDate: '2025-01-01' },
  ],

  // 11. Lý do
  reasons: [
    { reasonId: 'NM', reasonName: 'Nhập mua hàng thông thường', reasonType: 'NHAP', description: 'Nhập mua hàng trực tiếp từ nhà cung cấp', isDefault: true },
    { reasonId: 'NM_HD', reasonName: 'Nhập mua theo hợp đồng định kỳ', reasonType: 'NHAP', description: 'Nhập hàng hóa có ký hợp đồng khung' },
    { reasonId: 'NM_TRA', reasonName: 'Xuất trả lại hàng cho Nhà cung cấp', reasonType: 'XUAT', description: 'Xuất hoàn trả hàng lỗi/kém phẩm chất cho NCC' },
    { reasonId: 'CK_KHO', reasonName: 'Chuyển kho nội bộ', reasonType: 'DIEU_CHINH', description: 'Điều chuyển giữa kho tổng và kho chi nhánh' },
    { reasonId: 'DC_KK', reasonName: 'Điều chỉnh thừa/thiếu sau kiểm kê', reasonType: 'DIEU_CHINH', description: 'Điều chỉnh số lượng thực tế sau ca kiểm' },
  ],

  // 12. Định mức tồn kho
  stockNorms: [
    { itemId: 'HH0001', itemName: 'Thịt bò ba chỉ Úc đông lạnh', warehouseId: 'KHO_BEP', warehouseName: 'Kho Bếp Nóng - CN1', minStock: 10, maxStock: 50, unitName: 'kg' },
    { itemId: 'HH0003', itemName: 'Sữa tươi tiệt trùng TH True Milk không đường 1L', warehouseId: 'KHO_BAR', warehouseName: 'Kho Quầy Bar & Pha Chế', minStock: 24, maxStock: 120, unitName: 'hộp' },
    { itemId: 'HH0009', itemName: 'Hạt cà phê Robusta rang mộc Đắk Lắk', warehouseId: 'KHO_BAR', warehouseName: 'Kho Quầy Bar & Pha Chế', minStock: 15, maxStock: 60, unitName: 'kg' },
  ],

  catalogSourceInfo: 'Bộ dữ liệu iPOS chuẩn 12 danh mục (16 mặt hàng, 4 NCC, 4 Kho, 5 Lý do, 5 Quy đổi ĐVT)',
  importedAt: Date.now(),
};

export const SAMPLE_INVOICE_PRESETS: {
  id: string;
  name: string;
  description: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  documentDate: string;
  invoiceNumber: string;
  imageUrl?: string;
  rawInvoice: RawInvoiceData;
}[] = [
  {
    id: 'sample_handwritten_fnb',
    name: 'Phiếu giao hàng viết tay - Sao Mai Food',
    description: 'Phiếu giao hàng viết tay thực tế có chữ viết tắt, số lượng thập phân 2,5 kg, 1 mặt hàng thiếu số lượng (RED) và 1 mặt hàng độ tin cậy vừa (YELLOW).',
    supplierId: 'NCC001',
    supplierName: 'Công ty CP Thực phẩm Sao Mai',
    warehouseId: 'KHO_BEP',
    documentDate: '2025-05-18',
    invoiceNumber: 'GH-2025/0518',
    rawInvoice: {
      supplier_raw_name: 'Cty Sao Mai Thực phẩm',
      document_date: '2025-05-18',
      invoice_number: 'GH-2025/0518',
      note: 'Giao buổi sáng trước 10h, bếp nhận đủ tem bảo quản lạnh',
      rows: [
        {
          line_no: 1,
          raw_item_name: 'Thịt bò ba chỉ Úc đ/lạnh',
          raw_unit: 'kg',
          quantity: 15.5,
          price: 195000,
          amount: 3022500,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 2,
          raw_item_name: 'Thăn bò Úc tươi lát mỏng',
          raw_unit: 'kg',
          quantity: 4.8,
          price: 280000,
          amount: 1344000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 3,
          raw_item_name: 'Sốt tiêu đen Lee Kum Kee 500g',
          raw_unit: 'chai',
          quantity: 6,
          price: 68000,
          amount: 408000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 4,
          raw_item_name: 'Bơ lạt Anchor 227gr',
          raw_unit: 'hộp',
          quantity: 12,
          price: 75000,
          amount: 900000,
          visual_certainty: 'medium',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 5,
          raw_item_name: 'Rau xà lách Romain Đà Lạt',
          raw_unit: 'kg',
          quantity: 8.5,
          price: 42000,
          amount: 357000,
          visual_certainty: 'medium',
          needs_review: true,
          review_reason: 'Chữ viết tay Romain hơi mờ nét cuối',
        },
        {
          line_no: 6,
          raw_item_name: 'Phô mai kéo sợi Mozza',
          raw_unit: 'gói',
          quantity: null, // Test missing quantity -> triggers RED
          price: 190000,
          amount: null,
          visual_certainty: 'low',
          needs_review: true,
          review_reason: 'Cột số lượng bị rách mép giấy không đọc được số lượng',
        },
      ],
    },
  },
  {
    id: 'sample_beverage_slip',
    name: 'Hóa đơn nguyên liệu pha chế Quầy Bar',
    description: 'Hóa đơn cà phê, trà lài Lộc Phát, bột béo, sữa TH không đường có chuyển đổi ĐVT.',
    supplierId: 'NCC004',
    supplierName: 'Cửa hàng Bách Hóa Nguyên Liệu An Nhiên',
    warehouseId: 'KHO_BAR',
    documentDate: '2025-05-19',
    invoiceNumber: 'HD-AN-9921',
    rawInvoice: {
      supplier_raw_name: 'Bách Hóa Nguyên Liệu An Nhiên',
      document_date: '2025-05-19',
      invoice_number: 'HD-AN-9921',
      note: 'Thanh toán chuyển khoản sau 3 ngày',
      rows: [
        {
          line_no: 1,
          raw_item_name: 'Cà phê Robusta mộc Daklak',
          raw_unit: 'kg',
          quantity: 20,
          price: 185000,
          amount: 3700000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 2,
          raw_item_name: 'Trà lài Lộc Phát 500g',
          raw_unit: 'gói',
          quantity: 10,
          price: 115000,
          amount: 1150000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 3,
          raw_item_name: 'Sữa TH tiệt trùng ko đường 1L',
          raw_unit: 'thùng',
          quantity: 5,
          price: 408000,
          amount: 2040000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 4,
          raw_item_name: 'Sữa đặc Ông Thọ đỏ',
          raw_unit: 'lon',
          quantity: 48,
          price: 24500,
          amount: 1176000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 5,
          raw_item_name: 'Bột béo B-One Thái',
          raw_unit: 'gói',
          quantity: 15,
          price: 65000,
          amount: 975000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
        {
          line_no: 6,
          raw_item_name: 'Đường cát trắng Biên Hòa 1kg',
          raw_unit: 'gói',
          quantity: 25,
          price: 26000,
          amount: 650000,
          visual_certainty: 'high',
          needs_review: false,
          review_reason: null,
        },
      ],
    },
  },
];
