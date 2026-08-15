import { SAMPLE_IPOS_MASTER_DATA } from '../data/mockData';
import { MatchedInvoiceRow, RawInvoiceRow } from '../types';
import { validateForExport } from './excel';
import { CatalogResolver } from './resolver';
import {
  normalizeText,
  normalizeWithoutAccents,
  parseVietnameseNumber,
  removeAccents,
} from './vietnamese';

export interface TestResultItem {
  id: string;
  category: string;
  name: string;
  description: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export interface TestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  items: TestResultItem[];
}

export function runAllUnitTests(): TestSuiteResult {
  const startTime = performance.now();
  const items: TestResultItem[] = [];

  function assert(
    category: string,
    id: string,
    name: string,
    description: string,
    condition: boolean,
    actual?: any,
    expected?: any
  ) {
    items.push({
      id,
      category,
      name,
      description,
      passed: Boolean(condition),
      actual: typeof actual === 'object' ? JSON.stringify(actual) : String(actual),
      expected: typeof expected === 'object' ? JSON.stringify(expected) : String(expected),
    });
  }

  // 1. Vietnamese Text Normalization & Accent Removal
  {
    const raw1 = '  Thịt Bò Ba Chỉ Úc (Đông Lạnh) !!!  ';
    const norm1 = normalizeText(raw1);
    assert(
      'Chuẩn hóa tiếng Việt',
      'norm_1',
      'Xóa ký tự đặc biệt & khoảng trắng thừa',
      'Loại bỏ dấu câu, chuyển chữ thường, gộp khoảng trắng',
      norm1 === 'thịt bò ba chỉ úc đông lạnh',
      norm1,
      'thịt bò ba chỉ úc đông lạnh'
    );

    const raw2 = 'Đường kính trắng Biên Hòa';
    const noAcc = removeAccents(raw2);
    assert(
      'Chuẩn hóa tiếng Việt',
      'norm_2',
      'Xóa dấu thanh & chữ Đ/đ',
      'Chuyển Đ/đ thành D/d và bóc tách toàn bộ dấu thanh tiếng Việt',
      noAcc === 'Duong kinh trang Bien Hoa',
      noAcc,
      'Duong kinh trang Bien Hoa'
    );

    const raw3 = 'Sữa tươi tiệt trùng TH True Milk';
    const noAccNorm = normalizeWithoutAccents(raw3);
    assert(
      'Chuẩn hóa tiếng Việt',
      'norm_3',
      'Chuẩn hóa không dấu cho tìm kiếm mờ',
      'Kết hợp chuyển thường và xóa dấu',
      noAccNorm === 'sua tuoi tiet trung th true milk',
      noAccNorm,
      'sua tuoi tiet trung th true milk'
    );
  }

  // 2. Decimal Comma & Number Parsing
  {
    const n1 = parseVietnameseNumber('2,5');
    assert(
      'Xử lý số & dấu phẩy',
      'num_1',
      'Phân tích số thập phân 2,5',
      'Chuyển dấu phẩy tiếng Việt "2,5" thành float 2.5',
      n1 === 2.5,
      n1,
      2.5
    );

    const n2 = parseVietnameseNumber('1.250.000');
    assert(
      'Xử lý số & dấu phẩy',
      'num_2',
      'Phân tích tiền tệ có dấu chấm phân cách hàng nghìn',
      '"1.250.000" thành 1250000',
      n2 === 1250000,
      n2,
      1250000
    );

    const n3 = parseVietnameseNumber('1.250.000,50 đ');
    assert(
      'Xử lý số & dấu phẩy',
      'num_3',
      'Phân tích số hỗn hợp có cả chấm, phẩy và ký hiệu đ',
      '"1.250.000,50 đ" thành 1250000.5',
      n3 === 1250000.5,
      n3,
      1250000.5
    );

    const n4 = parseVietnameseNumber(null);
    assert(
      'Xử lý số & dấu phẩy',
      'num_4',
      'Giá trị trống / null trả về null',
      'Không được tự ý gán số 0 cho giá trị null',
      n4 === null,
      n4,
      null
    );
  }

  // 3. Candidate Matching & Fuzzy Search
  {
    const resolver = new CatalogResolver(SAMPLE_IPOS_MASTER_DATA);
    const candidates = resolver.resolveCandidates('Thịt bò ba chỉ Úc đ/lạnh', 'kg', 'NCC001');

    assert(
      'Đối chiếu danh mục iPOS',
      'match_1',
      'Tìm kiếm mờ mặt hàng có chữ viết tắt',
      '"Thịt bò ba chỉ Úc đ/lạnh" phải khớp với HH0001 (Thịt bò ba chỉ Úc đông lạnh)',
      candidates.length > 0 && candidates[0].item.itemId === 'HH0001',
      candidates[0]?.item?.itemId,
      'HH0001'
    );

    assert(
      'Đối chiếu danh mục iPOS',
      'match_2',
      'Độ tương thích ĐVT',
      'ĐVT kg phải khớp hoàn toàn',
      candidates.length > 0 && candidates[0].unitMatch === true,
      candidates[0]?.unitMatch,
      true
    );

    assert(
      'Đối chiếu danh mục iPOS',
      'match_3',
      'Giới hạn tối đa 5 ứng viên',
      'Hệ thống chỉ trả về top 5 ứng viên phù hợp nhất',
      candidates.length <= 5,
      candidates.length,
      '<= 5'
    );
  }

  // 4. Alias Priority
  {
    const learnedAlias = {
      supplier_id: 'NCC001',
      normalized_raw_item_name: 'thit bo nuong bbq',
      raw_item_sample: 'Thịt bò nướng BBQ',
      selected_item_id: 'HH0002', // Thăn bò Úc
      selected_item_name: 'Thăn bò Úc tươi cắt lát',
      selected_unit: 'kg',
      updatedAt: Date.now(),
      timesUsed: 5,
    };

    const resolverWithAlias = new CatalogResolver(SAMPLE_IPOS_MASTER_DATA, [learnedAlias]);
    const candidates = resolverWithAlias.resolveCandidates('Thịt bò nướng BBQ', 'kg', 'NCC001');

    assert(
      'Ưu tiên Alias học được',
      'alias_1',
      'Mặt hàng học được phải đứng đầu bảng xếp hạng',
      'Nhà cung cấp NCC001 viết "Thịt bò nướng BBQ" phải ưu tiên chọn HH0002 theo quy tắc đã học',
      candidates.length > 0 &&
        candidates[0].matchType === 'learned_alias' &&
        candidates[0].item.itemId === 'HH0002',
      `${candidates[0]?.matchType} -> ${candidates[0]?.item?.itemId}`,
      'learned_alias -> HH0002'
    );
  }

  // 5. Missing Quantity Detection & RED Classification
  {
    const resolver = new CatalogResolver(SAMPLE_IPOS_MASTER_DATA);
    const rawMissingQty: RawInvoiceRow = {
      line_no: 1,
      raw_item_name: 'Thịt bò ba chỉ Úc đông lạnh',
      raw_unit: 'kg',
      quantity: null, // Missing quantity
      price: 195000,
      amount: null,
      visual_certainty: 'high',
      needs_review: false,
      review_reason: null,
    };

    const processed = resolver.processInvoiceRows([rawMissingQty]);
    assert(
      'Phát hiện lỗi số lượng (RED)',
      'qty_err_1',
      'Thiếu số lượng bắt buộc phải gắn nhãn RED',
      'Dòng không có số lượng không được tự động phê duyệt',
      processed[0].status === 'RED',
      processed[0].status,
      'RED'
    );

    assert(
      'Phát hiện lỗi số lượng (RED)',
      'qty_err_2',
      'Cảnh báo rõ ràng trong danh sách warnings',
      'Cảnh báo phải nêu rõ lý do thiếu số lượng',
      processed[0].warnings.some((w) => w.includes('số lượng')),
      processed[0].warnings.join('; '),
      'Chứa thông điệp cảnh báo số lượng'
    );
  }

  // 6. Export Validation
  {
    const dummyGreenRow: MatchedInvoiceRow = {
      id: 'row_1',
      line_no: 1,
      raw: {
        line_no: 1,
        raw_item_name: 'Bò Úc',
        raw_unit: 'kg',
        quantity: 10,
        price: 195000,
        amount: 1950000,
        visual_certainty: 'high',
        needs_review: false,
        review_reason: null,
      },
      selectedCandidate: SAMPLE_IPOS_MASTER_DATA.items[0],
      candidates: [],
      status: 'GREEN',
      warnings: [],
      raw_item_name: 'Bò Úc',
      item_id: 'HH0001',
      item_name: 'Thịt bò ba chỉ Úc đông lạnh',
      unit: 'kg',
      quantity: 10,
      price: 195000,
      discount: 0,
      discount_amount: 0,
      vat: 0,
      amount_vat: 0,
      sub_total: 1950000,
      note: '',
      isManuallyConfirmed: true,
    };

    const dummyRedRow: MatchedInvoiceRow = {
      ...dummyGreenRow,
      id: 'row_2',
      line_no: 2,
      status: 'RED',
      quantity: null,
      warnings: ['Thiếu số lượng'],
    };

    const dummyUnconfirmedYellowRow: MatchedInvoiceRow = {
      ...dummyGreenRow,
      id: 'row_3',
      line_no: 3,
      status: 'YELLOW',
      isManuallyConfirmed: false,
      warnings: ['Cần kiểm tra lại'],
    };

    // Test with all GREEN rows
    const validResult = validateForExport([dummyGreenRow]);
    assert(
      'Kiểm định xuất Excel',
      'val_1',
      'Cho phép xuất khi toàn bộ dòng là GREEN',
      'Tất cả các dòng hợp lệ được phép xuất',
      validResult.canExport === true && validResult.redCount === 0,
      validResult.canExport,
      true
    );

    // Test with RED row
    const blockedByRed = validateForExport([dummyGreenRow, dummyRedRow]);
    assert(
      'Kiểm định xuất Excel',
      'val_2',
      'Chặn xuất khi có dòng RED',
      'Tuyệt đối không xuất file nếu còn dòng lỗi RED',
      blockedByRed.canExport === false && blockedByRed.redCount === 1,
      `canExport: ${blockedByRed.canExport}, redCount: ${blockedByRed.redCount}`,
      'canExport: false, redCount: 1'
    );

    // Test with unconfirmed YELLOW row
    const blockedByYellow = validateForExport([dummyGreenRow, dummyUnconfirmedYellowRow]);
    assert(
      'Kiểm định xuất Excel',
      'val_3',
      'Chặn xuất khi còn dòng YELLOW chưa được xác nhận',
      'Dòng màu vàng cần người dùng bấm xác nhận rõ ràng trước khi xuất file',
      blockedByYellow.canExport === false && blockedByYellow.unconfirmedYellowCount === 1,
      `canExport: ${blockedByYellow.canExport}, unconfirmedYellow: ${blockedByYellow.unconfirmedYellowCount}`,
      'canExport: false, unconfirmedYellow: 1'
    );
  }

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  const passed = items.filter((i) => i.passed).length;
  const failed = items.filter((i) => !i.passed).length;

  return {
    total: items.length,
    passed,
    failed,
    durationMs,
    items,
  };
}
