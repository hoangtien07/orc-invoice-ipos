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
  CAI: 'Cái',
  CHIEC: 'Chiếc',
  HOP: 'Hộp',
  LON: 'Lon',
  THUNG: 'Thùng',
  KIEN: 'Kiện',
  KG: 'kg',
  KILOGRAM: 'kg',
  KILO: 'kg',
  G: 'g',
  GRAM: 'g',
  GR: 'g',
  GOI: 'Gói',
  BICH: 'Bịch',
  TUI: 'Túi',
  CHAI: 'Chai',
  CAN: 'Can',
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
  MIENG: 'Miếng',
  LAT: 'Lát',
  HU: 'Hũ',
  LO: 'Lọ',
  BINH: 'Bình',
  CUON: 'Cuộn',
  THANH: 'Thanh',
  VIEN: 'Viên',
  TO: 'Tờ',
  TEP: 'Tệp',
  BO: 'Bó',
  QUA: 'Quả',
  TRAI: 'Trái',
  BAO: 'Bao',
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
 * Resolve unit code from name or code
 */
export function resolveStandardUnitCode(unitNameOrCode?: string | null): string {
  if (!unitNameOrCode || !unitNameOrCode.trim()) return '';
  const trimmed = unitNameOrCode.trim();
  const upperNoAccent = normalizeWithoutAccents(trimmed).toUpperCase();

  if (UNIT_CODE_TO_NAME[upperNoAccent]) {
    return upperNoAccent;
  }

  for (const [code, name] of Object.entries(UNIT_CODE_TO_NAME)) {
    if (normalizeWithoutAccents(name).toUpperCase() === upperNoAccent) {
      return code;
    }
  }

  return upperNoAccent.replace(/[^A-Z0-9]/g, '_') || 'UNIT';
}

/**
 * Get all available unique Units of Measure in the system
 */
export function getAvailableSystemUnits(
  masterData?: any | null,
  extraUnits: (string | null | undefined)[] = []
): string[] {
  const set = new Set<string>();

  // Add system standard units
  for (const u of SYSTEM_STANDARD_UNITS) {
    if (u) set.add(u.trim());
  }

  // Add master data item units
  if (masterData?.items) {
    for (const it of masterData.items) {
      if (it.unitName && it.unitName.trim()) {
        set.add(it.unitName.trim());
      }
    }
  }

  // Add conversions units
  if (masterData?.unitConversions) {
    for (const c of masterData.unitConversions) {
      if (c.sourceUnitName && c.sourceUnitName.trim()) {
        set.add(c.sourceUnitName.trim());
      }
      if (c.targetUnitName && c.targetUnitName.trim()) {
        set.add(c.targetUnitName.trim());
      }
    }
  }

  // Add extra units
  for (const eu of extraUnits) {
    if (eu && typeof eu === 'string' && eu.trim()) {
      set.add(eu.trim());
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

