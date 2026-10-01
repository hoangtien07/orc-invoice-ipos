/**
 * Vietnamese diacritics mapping for accurate text search and normalization
 */
export function removeAccents(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Clean and normalize text: lowercase, remove special characters, collapse whitespace
 */
export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[.,\/#!$%\^&\*;:{}=\_`~()?"'\[\]\\<>@+|\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalized form without accents (for fuzzy fallback comparison)
 */
export function normalizeWithoutAccents(str: string | null | undefined): string {
  return normalizeText(removeAccents(str));
}

/**
 * Normalization for fast case-insensitive & accent-insensitive substring searching
 */
export function normalizeVietnameseForSearch(str: string | null | undefined): string {
  if (!str) return '';
  return removeAccents(str).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Robust Vietnamese & International number parser.
 * Handles:
 * - "2,5" -> 2.5
 * - "1.250.000" -> 1250000
 * - "1 250 000,50" -> 1250000.5
 * - "1,250,000.50" -> 1250000.5
 * - "2.5 kg" -> 2.5
 * - null/undefined/empty -> null
 */
export function parseVietnameseNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }

  let str = String(val).trim();
  if (!str) return null;

  // Remove currency symbols, spaces, and common units
  str = str.replace(/[₫đĐVNDvnd$kK\s]/g, '').trim();
  if (!str) return null;

  // Check if standard scientific or simple number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  }

  // Handle both comma and dot formats
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Determine which comes last
    const lastCommaIndex = str.lastIndexOf(',');
    const lastDotIndex = str.lastIndexOf('.');

    if (lastCommaIndex > lastDotIndex) {
      // Vietnamese format: 1.250.000,50 -> remove dots, replace comma with dot
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,250,000.50 -> remove commas
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Only comma present
    // Could be decimal comma: "2,5" or thousand separator: "1,250,000"
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length <= 3) {
      // High likelihood of decimal comma (e.g. 2,5 or 12,75)
      str = str.replace(',', '.');
    } else {
      // Likely thousand separators e.g. 1,000,000
      str = str.replace(/,/g, '');
    }
  } else if (hasDot) {
    // Only dot present
    // Could be thousand separator "1.250.000" or decimal dot "2.5"
    const parts = str.split('.');
    if (parts.length > 2) {
      // Multiple dots -> thousand separator (e.g. 1.250.000)
      str = str.replace(/\./g, '');
    } else if (parts.length === 2) {
      // Single dot: if part after dot has exactly 3 digits and no decimals, check if it's large integer like 150.000
      if (parts[1].length === 3 && parts[0].length >= 1 && parseInt(parts[0], 10) >= 10) {
        // e.g. 150.000 -> 150000 VND
        // But if it's like 1.500 it could be 1.5 or 1500; in VN currency, thousands are common for prices
        // Keep standard parseFloat if ambiguous or handle context
        str = str.replace(/\./g, '');
      }
      // If it's 2.5 or 0.75, keep it as 2.5
    }
  }

  // Extract leading valid number if string has trailing characters
  const match = str.match(/^-?\d+(\.\d+)?/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Format numbers as Vietnamese currency (VND)
 */
export function formatVND(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format quantity with up to 3 decimal places
 */
export function formatQuantity(qty: number | null | undefined): string {
  if (qty === null || qty === undefined || isNaN(qty)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 3,
  }).format(qty);
}

/**
 * Common standard Units of Measure in Vietnamese F&B and Retail Inventory
 */
export const SYSTEM_STANDARD_UNITS = [
  'kg',
  'g',
  'hộp',
  'lon',
  'gói',
  'chai',
  'can',
  'thùng',
  'bao',
  'túi',
  'lít',
  'ml',
  'bịch',
  'khay',
  'cái',
  'bó',
  'quả',
  'trái',
  'dĩa',
  'ly',
  'lốc',
  'cây',
  'phần',
  'suất',
  'miếng',
  'hũ',
  'bình',
  'cuộn',
  'thanh',
  'viên',
  'tờ',
  'tệp',
];

/**
 * Mapping dictionary between common ERP / iPOS Unit Codes and standard Vietnamese Unit Names
 */
export const UNIT_CODE_TO_NAME: Record<string, string> = {
  BAP: 'Bắp',
  KG: 'kg',
  KILOGRAM: 'kg',
  KILO: 'kg',
  G: 'g',
  GRAM: 'g',
  GR: 'g',
  GOI: 'Gói',
  BICH: 'Bịch',
  TUI: 'Túi',
  CAI: 'Cái',
  CHIEC: 'Chiếc',
  CAN: 'Can',
  LON: 'Lon',
  THUNG: 'Thùng',
  KIEN: 'Kiện',
  MIENG: 'Miếng',
  LAT: 'Lát',
  VI: 'Vỉ',
  QUA: 'Quả',
  TRAI: 'Trái',
  CHAI: 'Chai',
  HOP: 'Hộp',
  BAO: 'Bao',
  LIT: 'Lít',
  L: 'Lít',
  ML: 'ml',
  KHAY: 'Khay',
  DIA: 'Dĩa',
  DI: 'Dĩa',
  LY: 'Ly',
  COC: 'Cốc',
  LOC: 'Lốc',
  CAY: 'Cây',
  PHAN: 'Phần',
  SUAT: 'Suất',
  HU: 'Hũ',
  LO: 'Lọ',
  BINH: 'Bình',
  CUON: 'Cuộn',
  THANH: 'Thanh',
  VIEN: 'Viên',
  TO: 'Tờ',
  TEP: 'Tệp',
  BO: 'Bó',
  CON: 'Con',
  DOI: 'Đôi',
  BOP: 'Bóp',
  THANG: 'Tháng',
  NGAY: 'Ngày',
  GIO: 'Giờ',
  SET: 'Set',
  COMBO: 'Combo',
};

/**
 * Common Vietnamese UOM synonyms mapping directly to official uppercase iPOS Unit Codes
 */
export const UNIT_SYNONYMS_TO_CODE: Record<string, string> = {
  bap: 'BAP',
  ky: 'KG',
  ki: 'KG',
  kg: 'KG',
  kilo: 'KG',
  kilogram: 'KG',
  k: 'KG',
  kgm: 'KG',
  g: 'GR',
  gr: 'GR',
  gram: 'GR',
  gam: 'GR',
  goi: 'GOI',
  bich: 'BICH',
  tui: 'TUI',
  cai: 'CAI',
  chiec: 'CAI',
  pc: 'CAI',
  pcs: 'CAI',
  can: 'CAN',
  lon: 'LON',
  tin: 'LON',
  thung: 'THUNG',
  carton: 'THUNG',
  ctn: 'THUNG',
  kien: 'THUNG',
  thg: 'THUNG',
  mieng: 'MIENG',
  lat: 'MIENG',
  vi: 'VI',
  qua: 'QUA',
  trai: 'QUA',
  q: 'QUA',
  chai: 'CHAI',
  bot: 'CHAI',
  bottle: 'CHAI',
  ch: 'CHAI',
  hop: 'HOP',
  box: 'HOP',
  bao: 'BAO',
  lit: 'LIT',
  l: 'LIT',
  ltr: 'LIT',
  litter: 'LIT',
  ml: 'ML',
  khay: 'KHAY',
  tray: 'KHAY',
  dia: 'DIA',
  di: 'DIA',
  plate: 'DIA',
  ly: 'LY',
  coc: 'COC',
  cup: 'LY',
  loc: 'LOC',
  block: 'LOC',
  cay: 'CAY',
  phan: 'PHAN',
  suat: 'PHAN',
  hu: 'HU',
  lo: 'HU',
  binh: 'BINH',
  cuon: 'CUON',
  roll: 'CUON',
  thanh: 'THANH',
  vien: 'VIEN',
  to: 'TO',
  tep: 'TEP',
  bo: 'BO',
  chum: 'BO',
  con: 'CON',
  doi: 'DOI',
  pair: 'DOI',
  bop: 'BOP',
  set: 'SET',
  combo: 'COMBO',
};

/**
 * Resolve unit name from code or name
 */
export function resolveStandardUnitName(unitNameOrCode?: string | null): string {
  if (!unitNameOrCode || !unitNameOrCode.trim()) return '';
  const trimmed = unitNameOrCode.trim();
  const upperNoAccent = normalizeWithoutAccents(trimmed).toUpperCase();

  if (UNIT_CODE_TO_NAME[upperNoAccent]) {
    return UNIT_CODE_TO_NAME[upperNoAccent];
  }
  return trimmed;
}

/**
 * Resolve unit code from name or code (ALWAYS returns uppercase iPOS unit code)
 */
export function resolveStandardUnitCode(unitNameOrCode?: string | null): string {
  if (!unitNameOrCode || !unitNameOrCode.trim()) return '';
  const trimmed = unitNameOrCode.trim();
  const upperNoAccent = normalizeWithoutAccents(trimmed).toUpperCase();
  const lowerNoAccent = normalizeWithoutAccents(trimmed).toLowerCase();

  // 1. Direct code match (e.g. "BAP", "KG", "CAI", "QUA", "VI", "LON")
  if (UNIT_CODE_TO_NAME[upperNoAccent]) {
    return upperNoAccent;
  }

  // 2. Direct synonym dictionary match (e.g. "bắp" -> "BAP", "ký" -> "KG", "quả" -> "QUA")
  if (UNIT_SYNONYMS_TO_CODE[lowerNoAccent]) {
    return UNIT_SYNONYMS_TO_CODE[lowerNoAccent];
  }

  // 3. Match against localized names in UNIT_CODE_TO_NAME
  for (const [code, name] of Object.entries(UNIT_CODE_TO_NAME)) {
    if (normalizeWithoutAccents(name).toUpperCase() === upperNoAccent) {
      return code;
    }
  }

  return upperNoAccent.replace(/[^A-Z0-9]/g, '_') || 'KG';
}

/**
 * Accurately check if two unit strings are the same or equivalent
 * (handles case differences, accents like 'bắp' vs 'BAP', 'cái' vs 'CAI', 'kg' vs 'KG', 'quả' vs 'QUA')
 */
export function isSameOrEquivalentUnit(
  unitA: string | null | undefined,
  unitB: string | null | undefined
): boolean {
  if (!unitA && !unitB) return true;
  if (!unitA || !unitB) return false;
  const trimA = unitA.trim();
  const trimB = unitB.trim();
  if (!trimA && !trimB) return true;
  if (!trimA || !trimB) return false;
  if (trimA.toLowerCase() === trimB.toLowerCase()) return true;
  if (normalizeWithoutAccents(trimA) === normalizeWithoutAccents(trimB)) return true;
  const codeA = resolveStandardUnitCode(trimA);
  const codeB = resolveStandardUnitCode(trimB);
  if (codeA && codeB && codeA === codeB) return true;
  return false;
}

/**
 * Get all available unique Units of Measure in the system
 */
export function getAvailableSystemUnits(
  masterData?: any | null,
  extraUnits: (string | null | undefined)[] = []
): string[] {
  const set = new Set<string>();

  const isNumericOrInvalid = (str?: string | null): boolean => {
    if (!str || typeof str !== 'string') return true;
    const trimmed = str.trim();
    if (!trimmed) return true;
    // Check if it's purely numeric (e.g. 0.5, 1.3, 10, 100, 1000) or pure punctuation
    if (/^[\d.,\s\+\-\*\/%]+$/.test(trimmed)) return true;
    const norm = normalizeWithoutAccents(trimmed).toLowerCase();
    if (norm.includes('tong cong') || norm.includes('ti le')) return true;
    return false;
  };

  // 1. Prioritize master data units (the official DVT catalog)
  if (masterData?.units && Array.isArray(masterData.units) && masterData.units.length > 0) {
    for (const u of masterData.units) {
      if (u.unitName && !isNumericOrInvalid(u.unitName)) {
        set.add(u.unitName.trim());
      }
      if (u.unitId && !isNumericOrInvalid(u.unitId)) {
        set.add(u.unitId.trim());
      }
    }
  }

  // 2. Add master data item units
  if (masterData?.items && Array.isArray(masterData.items)) {
    for (const it of masterData.items) {
      if (it.unitName && !isNumericOrInvalid(it.unitName)) {
        set.add(it.unitName.trim());
      }
      if (it.unitId && !isNumericOrInvalid(it.unitId)) {
        set.add(it.unitId.trim());
      }
    }
  }

  // 3. Add conversions units
  if (masterData?.unitConversions && Array.isArray(masterData.unitConversions)) {
    for (const c of masterData.unitConversions) {
      if (c.sourceUnitName && !isNumericOrInvalid(c.sourceUnitName)) {
        set.add(c.sourceUnitName.trim());
      }
      if (c.targetUnitName && !isNumericOrInvalid(c.targetUnitName)) {
        set.add(c.targetUnitName.trim());
      }
    }
  }

  // 4. Add extra units from current rows
  for (const eu of extraUnits) {
    if (eu && typeof eu === 'string' && !isNumericOrInvalid(eu)) {
      set.add(eu.trim());
    }
  }

  // 5. Fallback standard units if list is empty
  if (set.size === 0) {
    for (const u of SYSTEM_STANDARD_UNITS) {
      if (u && !isNumericOrInvalid(u)) set.add(u.trim());
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Common F&B Food & Beverage noise words / stop-words
 * (Origins, Brands, Packaging forms, Temperature states, Size qualifiers)
 */
const FOOD_NOISE_WORDS = new Set([
  // Origins (keep specific ones, avoid 'can' which is packaging unit)
  'my', 'mỹ', 'usa', 'us', 'brazil', 'uc', 'úc', 'aus', 'australia', 'canada',
  'nhat', 'nhật', 'japan', 'han', 'hàn', 'korea', 'dan mach', 'đan mạch', 'ba lan', 'balan',
  'nga', 'russia', 'an do', 'ấn độ', 'india', 'phap', 'pháp', 'france', 'tay ban nha', 'tây ban nha', 'spain',
  'viet nam', 'việt nam', 'vn', 'nhap khau', 'nhập khẩu', 'xuat khau', 'xuất khẩu',
  
  // Brands
  'swift', 'aviko', 'grain valley', 'grainvalley', 'excel', 'cargill', 'tyson', 'miratorg',
  'kilcoy', 'teys', 'st helens', 'st. helens', 'c.p.', 'vissan', 'san ha', 'san hà',
  'dabaco', 'ba huan', 'ba huân', 'cj', 'meaty', 'sunjin', 'japfa', 'nutreco', 'greenfeed',

  // Temperature / Processing states (retain 'kho', 'tuoi', 'cay' to avoid confusing fresh vs dried and items like sa cay)
  'dong lanh', 'đông lạnh', 'nong', 'nóng', 'mat', 'mát',
  'chin', 'chín', 'song', 'sống', 'say', 'sấy',

  // Grades / Qualifiers
  'loai 1', 'loại 1', 'loai 2', 'loại 2', 'loai a', 'loại a', 'loai b', 'loại b',
  'cong ty', 'công ty', 'hang', 'hàng', 'cao cap', 'cao cấp', 'dac biet', 'đặc biệt',
  'dong goi', 'đóng gói', 'nguyen mieng', 'nguyên miếng', 'cat san', 'cắt sẵn',

  // English Cut / Spec words often appended by importers
  'straight cut', 'straightcut', 'shoestring', 'wedges', 'crinkle cut',
  'shin/shank', 'shin shank', 'shank', 'shin', 'short plate', 'shortplate', 'plate',
  'ribeye', 'striploin', 'tenderloin', 'brisket', 'chuck eye roll', 'chuck eye', 'chuck',
  'flank', 'oxtail', 'top blade', 'chuck tender', 'short ribs', 'back ribs',
  'pork belly', 'pork collar', 'salmon', 'fillet', 'steak', 'cube', 'dice', 'slice',
]);

/**
 * Common culinary synonyms in Vietnamese F&B Inventory
 */
export const FOOD_SYNONYMS: Record<string, string[]> = {
  'baroi heo': ['ba chi heo', 'thit ba chi heo', 'ba roi heo', 'ba chi'],
  'ba roi heo': ['ba chi heo', 'thit ba chi heo', 'ba roi heo', 'ba chi', 'baroi heo'],
  'ba chi heo': ['thit ba chi heo', 'ba roi heo', 'thit ba chi', 'ba chi rut suon', 'baroi heo'],
  'ngo ri': ['mui ta', 'rau mui', 'ngo ri', 'mui ta rau mui', 'rau ngo ri'],
  'mui ta': ['ngo ri', 'rau mui', 'mui ta', 'rau ngo ri'],
  'rau mui': ['ngo ri', 'mui ta', 'rau mui', 'rau ngo ri'],
  'ngo tay': ['mui tay da lat ngo tay', 'mui tay', 'ngo tay', 'mui tay da lat', 'ngò tây'],
  'mui tay': ['mui tay da lat ngo tay', 'ngo tay', 'mui tay', 'mui tay da lat'],
  'ngo xuan': ['rau ngo xuan', 'ngo xuan', 'rau ngó xuân'],
  'rau ngo xuan': ['ngo xuan', 'rau ngo xuan'],
  'la dua': ['la nep', 'la dứa', 'lá nếp', 'la nep tuoi'],
  'la nep': ['la dua', 'lá dứa', 'la nep', 'la dua tuoi'],
  'dau hu trang': ['dau phu', 'dau hu', 'dau phu trang', 'dau hu trang'],
  'dau hu': ['dau phu', 'dau hu', 'dau hu trang', 'dau phu trang'],
  'dau phu': ['dau hu', 'dau hu trang', 'dau phu', 'dau phu trang'],
  'dua leo baby': ['dua chuot', 'dua leo', 'dua chuot baby', 'dua leo baby'],
  'dua leo': ['dua chuot', 'dua leo baby', 'dua chuot baby'],
  'dua chuot': ['dua leo', 'dua leo baby', 'dua chuot'],
  'sa cay': ['sa tuoi', 'sa', 'xa cay', 'xa tuoi'],
  'sa tuoi': ['sa cay', 'sa', 'sa tuoi'],
  'sa': ['sa tuoi', 'sa cay'],
  'toi cu': ['toi ta', 'toi', 'toi kho', 'toi cu'],
  'toi ta': ['toi cu', 'toi', 'toi ta'],
  'tui zip bac': ['tui zip bac 25x35', 'tui zip', 'tui zip bac'],
  'tui zip bac 25x35': ['tui zip bac', 'tui zip'],
  'ngo gai': ['rau ngo gai', 'mui tau', 'rau ngo gai mui tau'],
  'mui tau': ['ngo gai', 'rau ngo gai', 'mui tau'],
  'hanh hoa': ['hanh la', 'hanh hoa'],
  'hanh la': ['hanh hoa', 'hanh la'],
  'khoai tay cong': ['khoai tay', 'khoai tay soi', 'khoai tay chien', 'khoai tay 9', 'khoai tay 7', 'khoai tay cat'],
  'khoai tay': ['khoai tay cong', 'khoai tay soi', 'khoai tay chien'],
  'bap bo': ['thit bap bo', 'bap hoa', 'bap bo hoa', 'bap bo tuoi', 'bap bo 60s', 'bap hoa bo'],
  'thit bap bo': ['bap bo', 'bap hoa', 'bap bo hoa', 'bap bo tuoi', 'bap bo 60s'],
  'ba chi bo': ['thit ba chi bo', 'ba roi bo', 'ba chi bo my', 'ba chi bo uc', 'ba chi bo cuon'],
  'thit ba chi bo': ['ba chi bo', 'ba roi bo', 'ba chi bo my'],
  'suon bo': ['thit suon bo', 'suon non bo', 'suon bo rut xuong', 'suon bo my'],
  'suon heo': ['thit suon heo', 'suon non', 'suon non heo', 'suon cay heo'],
  'uc ga': ['thit uc ga', 'phi le ga', 'uc ga phi le', 'uc ga tuoi'],
  'dui ga': ['thit dui ga', 'toi ga', 'dui ga goc tu', 'dui ga toi'],
  'than bo': ['thit than bo', 'than noi bo', 'than ngoai bo', 'dau than bo', 'than bo uc', 'than bo my'],
  'ga ta': ['thit ga ta', 'ga ta tha vuon', 'ga ta nguyen con'],
  'tom the': ['tom the chan trang', 'tom su', 'tom tuoi'],
  'muc ong': ['muc ong tuoi', 'muc la', 'muc trung'],
};

/**
 * Clean raw invoice food item name:
 * 1. Remove SKU bracket codes (e.g. "[P000131]", "(P000384)", "P000131 -", "#123:")
 * 2. Strip importer English cut specifications and model numbers (e.g. "55215-SHORT PLATE", "-Straight Cut")
 * 3. Extract core ingredient keywords (e.g. "Khoai tây cọng", "Bắp bò")
 */
export function cleanFoodItemName(rawStr: string | null | undefined): {
  rawCleaned: string;
  coreKeywords: string;
  tokens: string[];
} {
  if (!rawStr) return { rawCleaned: '', coreKeywords: '', tokens: [] };

  let str = rawStr.trim();

  // 1. Remove SKU prefixes like [P000131], (P000384), [0012], P000131 -
  str = str.replace(/^\[[^\]]+\]\s*/g, '');
  str = str.replace(/^\([^\)]+\)\s*/g, '');
  str = str.replace(/^[A-Za-z0-9\-_]{2,15}\s*[-–:]\s*/g, '');
  str = str.replace(/^#?[A-Za-z0-9\-_]{3,15}\s+/g, '');

  // 2. Remove supplier product numbers / codes embedded inside (e.g. 55215, 60S)
  const withoutCodes = str
    .replace(/[-–/]\s*[A-Za-z0-9\s/]+$/g, (match) => {
      return ' ' + match.replace(/[-–/]/g, ' ');
    })
    .replace(/\b\d{4,6}[A-Za-z0-9\-]*\b/g, ' ')
    .replace(/\b(size|sz)\s*[smlx0-9/]+\b/gi, ' ')
    .replace(/\b\d+mm\b/gi, ' ');

  const rawCleaned = normalizeWithoutAccents(withoutCodes);

  // 3. Extract core keywords by filtering out known noise words
  const rawWords = rawCleaned.split(/\s+/).filter(Boolean);
  const coreWords: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const w1 = rawWords[i];
    const w2 = i + 1 < rawWords.length ? `${w1} ${rawWords[i + 1]}` : '';
    const w3 = i + 2 < rawWords.length ? `${w1} ${rawWords[i + 1]} ${rawWords[i + 2]}` : '';

    if (FOOD_NOISE_WORDS.has(w3)) {
      i += 2;
      continue;
    }
    if (FOOD_NOISE_WORDS.has(w2)) {
      i += 1;
      continue;
    }
    if (FOOD_NOISE_WORDS.has(w1)) {
      continue;
    }
    // Skip standalone single digits (e.g. 9 in khoai tay cong 9)
    if (/^\d+$/.test(w1) && w1.length <= 2) {
      continue;
    }

    coreWords.push(w1);
  }

  const coreKeywords = coreWords.join(' ');
  const tokens = coreWords.length > 0 ? coreWords : rawWords;

  return {
    rawCleaned,
    coreKeywords: coreKeywords || rawCleaned,
    tokens,
  };
}

/**
 * Fast Levenshtein distance computation
 */
export function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Compute token overlap metrics (precision, recall, Dice coefficient)
 */
export function computeTokenOverlap(
  tokensA: string[],
  tokensB: string[]
): { precision: number; recall: number; dice: number; sharedCount: number } {
  if (!tokensA.length || !tokensB.length) {
    return { precision: 0, recall: 0, dice: 0, sharedCount: 0 };
  }

  const setB = new Set(tokensB);
  let shared = 0;
  for (const t of tokensA) {
    if (setB.has(t)) shared++;
  }

  const precision = shared / tokensA.length;
  const recall = shared / tokensB.length;
  const dice = (2 * shared) / (tokensA.length + tokensB.length);

  return { precision, recall, dice, sharedCount: shared };
}

