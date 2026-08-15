import Fuse from 'fuse.js';
import {
  CandidateMatch,
  IposItem,
  IposMasterData,
  IposUnitConversion,
  LearnedItemAlias,
  LearnedUnitAlias,
  MatchedInvoiceRow,
  RawInvoiceRow,
  RowStatus,
} from '../types';
import {
  normalizeText,
  normalizeWithoutAccents,
  resolveStandardUnitName,
  UNIT_CODE_TO_NAME,
} from './vietnamese';

interface FuseSearchItem {
  item: IposItem;
  normName: string;
  normNoAccent: string;
  normCode: string;
  normCategory: string;
  normUnit: string;
  normUnitId: string;
}

export class CatalogResolver {
  private masterData: IposMasterData;
  private fuse: Fuse<FuseSearchItem> | null = null;
  private searchItems: FuseSearchItem[] = [];
  private itemMapById: Map<string, IposItem> = new Map();
  private itemMapByNormName: Map<string, IposItem> = new Map();
  private itemMapByNormNoAccent: Map<string, IposItem> = new Map();
  private conversions: IposUnitConversion[] = [];
  private learnedAliases: LearnedItemAlias[] = [];
  private learnedUnitAliases: LearnedUnitAlias[] = [];

  constructor(
    masterData: IposMasterData,
    learnedAliases: LearnedItemAlias[] = [],
    learnedUnitAliases: LearnedUnitAlias[] = []
  ) {
    this.masterData = masterData;
    this.learnedAliases = learnedAliases;
    this.learnedUnitAliases = learnedUnitAliases;
    this.conversions = masterData.unitConversions || [];
    this.initSearchIndex();
  }

  public updateAliases(aliases: LearnedItemAlias[], unitAliases: LearnedUnitAlias[]) {
    this.learnedAliases = aliases;
    this.learnedUnitAliases = unitAliases;
  }

  private initSearchIndex() {
    this.searchItems = [];
    this.itemMapById.clear();
    this.itemMapByNormName.clear();
    this.itemMapByNormNoAccent.clear();

    for (const item of this.masterData.items || []) {
      if (!item.itemId || !item.itemName) continue;
      this.itemMapById.set(item.itemId.trim(), item);

      const normName = normalizeText(item.itemName);
      const normNoAccent = normalizeWithoutAccents(item.itemName);
      const normCode = normalizeText(item.itemId);
      const normCat = normalizeText(item.category || '');
      const normUnit = normalizeText(item.unitName || '');
      const normUnitId = normalizeText(item.unitId || '');

      if (!this.itemMapByNormName.has(normName)) {
        this.itemMapByNormName.set(normName, item);
      }
      if (!this.itemMapByNormNoAccent.has(normNoAccent)) {
        this.itemMapByNormNoAccent.set(normNoAccent, item);
      }

      this.searchItems.push({
        item,
        normName,
        normNoAccent,
        normCode,
        normCategory: normCat,
        normUnit,
        normUnitId,
      });
    }

    // Initialize Fuse with weighted fields
    this.fuse = new Fuse(this.searchItems, {
      keys: [
        { name: 'normCode', weight: 0.35 },
        { name: 'normName', weight: 0.45 },
        { name: 'normNoAccent', weight: 0.2 },
      ],
      includeScore: true,
      threshold: 0.48, // Balanced tolerance
      distance: 100,
      minMatchCharLength: 2,
      ignoreLocation: true,
    });
  }

  /**
   * Check if rawUnit is compatible with item's unit or conversion list
   */
  public checkUnitCompatibility(
    rawUnit: string | null,
    itemUnit: string | undefined,
    itemId?: string,
    itemUnitId?: string
  ): { isCompatible: boolean; matchedUnit: string; note?: string } {
    if (!rawUnit || !rawUnit.trim()) {
      // If raw unit is missing, we use item's catalog unit, but flag as unverified
      return { isCompatible: true, matchedUnit: itemUnit || itemUnitId || '', note: 'Đơn vị tính phiếu để trống' };
    }

    const normRawUnit = normalizeText(rawUnit);
    const normRawUnitNoAccent = normalizeWithoutAccents(rawUnit);
    const normItemUnit = normalizeText(itemUnit || '');
    const normItemUnitNoAccent = normalizeWithoutAccents(itemUnit || '');
    const normItemUnitId = normalizeText(itemUnitId || '');
    const normItemUnitIdNoAccent = normalizeWithoutAccents(itemUnitId || '');

    // Resolved standard names (e.g. CAI -> Cái, KG -> kg)
    const standardRaw = resolveStandardUnitName(rawUnit);
    const standardItem = resolveStandardUnitName(itemUnit || itemUnitId);
    const normStandardRawNoAccent = normalizeWithoutAccents(standardRaw);
    const normStandardItemNoAccent = normalizeWithoutAccents(standardItem);

    // Direct match against itemUnit or itemUnitId or standardized names
    if (
      normRawUnit === normItemUnit ||
      normRawUnitNoAccent === normItemUnitNoAccent ||
      (normItemUnitId && (normRawUnit === normItemUnitId || normRawUnitNoAccent === normItemUnitIdNoAccent)) ||
      (standardRaw && standardItem && normStandardRawNoAccent === normStandardItemNoAccent)
    ) {
      return { isCompatible: true, matchedUnit: itemUnit || standardItem || rawUnit };
    }

    // Check learned unit alias
    const learnedUnit = this.learnedUnitAliases.find(
      (u) => u.normalized_raw_unit === normRawUnit || u.normalized_raw_unit === normRawUnitNoAccent
    );
    if (learnedUnit) {
      const learnedTargetNorm = normalizeText(learnedUnit.target_unit_name);
      const learnedTargetNoAccent = normalizeWithoutAccents(learnedUnit.target_unit_name);
      if (
        learnedTargetNorm === normItemUnit ||
        learnedTargetNoAccent === normItemUnitNoAccent ||
        learnedTargetNorm === normItemUnitId ||
        learnedTargetNoAccent === normItemUnitIdNoAccent ||
        learnedTargetNoAccent === normStandardItemNoAccent
      ) {
        return { isCompatible: true, matchedUnit: learnedUnit.target_unit_name, note: 'Khớp quy tắc ĐVT học được' };
      }
    }

    // Check common abbreviations and synonyms in Vietnamese F&B / Retail
    const synonyms: Record<string, string[]> = {
      kg: ['ky', 'ki', 'kilogram', 'kilo', 'k', 'kg'],
      g: ['gram', 'gr', 'g'],
      hop: ['h', 'hop'],
      chai: ['ch', 'chai'],
      lon: ['l', 'lon'],
      thung: ['th', 'thung', 'kien', 'ctn'],
      goi: ['g', 'goi', 'bich', 'tui', 'pack', 'pkg'],
      qua: ['trai', 'cai', 'chiec'],
      lit: ['l', 'lit', 'litter', 'ltr'],
      cai: ['chiec', 'c', 'cai', 'pc', 'pcs'],
      can: ['can', 'binh'],
      dia: ['dia', 'di'],
      ly: ['ly', 'coc'],
      loc: ['loc', 'block'],
    };

    for (const [canonical, syns] of Object.entries(synonyms)) {
      const matchRaw =
        normRawUnitNoAccent === canonical ||
        syns.includes(normRawUnitNoAccent) ||
        normStandardRawNoAccent === canonical ||
        syns.includes(normStandardRawNoAccent);

      const matchItem =
        normItemUnitNoAccent === canonical ||
        syns.includes(normItemUnitNoAccent) ||
        normItemUnitIdNoAccent === canonical ||
        syns.includes(normItemUnitIdNoAccent) ||
        normStandardItemNoAccent === canonical ||
        syns.includes(normStandardItemNoAccent);

      if (matchRaw && matchItem) {
        return { isCompatible: true, matchedUnit: itemUnit || standardItem || rawUnit, note: 'Tương đương ĐVT' };
      }
    }

    // Check unit conversions table
    const conv = this.conversions.find((c) => {
      const srcNorm = normalizeWithoutAccents(c.sourceUnitName);
      const tgtNorm = normalizeWithoutAccents(c.targetUnitName);
      const itemMatch = !c.itemId || c.itemId === itemId;

      return (
        itemMatch &&
        ((srcNorm === normRawUnitNoAccent && (tgtNorm === normItemUnitNoAccent || tgtNorm === normItemUnitIdNoAccent || tgtNorm === normStandardItemNoAccent)) ||
          (tgtNorm === normRawUnitNoAccent && (srcNorm === normItemUnitNoAccent || srcNorm === normItemUnitIdNoAccent || srcNorm === normStandardItemNoAccent)))
      );
    });

    if (conv) {
      return {
        isCompatible: true,
        matchedUnit: itemUnit || conv.targetUnitName,
        note: `Quy đổi ${conv.sourceUnitName} ⇄ ${conv.targetUnitName} (tỉ lệ ${conv.conversionRate})`,
      };
    }

    return {
      isCompatible: false,
      matchedUnit: itemUnit || standardItem || rawUnit,
      note: `ĐVT '${rawUnit}' khác ĐVT iPOS '${itemUnit || itemUnitId || 'Chưa gán'}'`,
    };
  }

  /**
   * Find top candidates for an extracted row
   */
  public resolveCandidates(
    rawItemName: string,
    rawUnit: string | null,
    supplierId?: string
  ): CandidateMatch[] {
    const candidates: CandidateMatch[] = [];
    const seenIds = new Set<string>();

    const normRaw = normalizeText(rawItemName);
    const normRawNoAccent = normalizeWithoutAccents(rawItemName);

    if (!normRaw) return [];

    // A. Learned supplier-specific / global aliases
    const matchedAliases = this.learnedAliases.filter((a) => {
      const supplierMatch = !supplierId || a.supplier_id === supplierId || a.supplier_id === '*';
      if (!supplierMatch) return false;

      return (
        a.normalized_raw_item_name === normRaw ||
        a.normalized_raw_item_name === normRawNoAccent ||
        normalizeWithoutAccents(a.raw_item_sample) === normRawNoAccent
      );
    });

    for (const alias of matchedAliases) {
      const item = this.itemMapById.get(alias.selected_item_id);
      if (item && !seenIds.has(item.itemId)) {
        const unitComp = this.checkUnitCompatibility(rawUnit, item.unitName, item.itemId, item.unitId);
        candidates.push({
          item,
          score: 0.01,
          confidencePercent: 99,
          matchType: 'learned_alias',
          unitMatch: unitComp.isCompatible,
        });
        seenIds.add(item.itemId);
      }
    }

    // B1. Exact Code Match
    const itemByCode = this.itemMapById.get(rawItemName.trim());
    if (itemByCode && !seenIds.has(itemByCode.itemId)) {
      const unitComp = this.checkUnitCompatibility(rawUnit, itemByCode.unitName, itemByCode.itemId, itemByCode.unitId);
      candidates.push({
        item: itemByCode,
        score: 0.02,
        confidencePercent: 98,
        matchType: 'exact_code',
        unitMatch: unitComp.isCompatible,
      });
      seenIds.add(itemByCode.itemId);
    }

    // B2. Exact Normalized Name Match (Accented)
    const itemByExactName = this.itemMapByNormName.get(normRaw);
    if (itemByExactName && !seenIds.has(itemByExactName.itemId)) {
      const unitComp = this.checkUnitCompatibility(rawUnit, itemByExactName.unitName, itemByExactName.itemId, itemByExactName.unitId);
      candidates.push({
        item: itemByExactName,
        score: 0.05,
        confidencePercent: 95,
        matchType: 'exact_name',
        unitMatch: unitComp.isCompatible,
      });
      seenIds.add(itemByExactName.itemId);
    }

    // B3. Exact Normalized Name Match (Without Accents)
    const itemByNoAccent = this.itemMapByNormNoAccent.get(normRawNoAccent);
    if (itemByNoAccent && !seenIds.has(itemByNoAccent.itemId)) {
      const unitComp = this.checkUnitCompatibility(rawUnit, itemByNoAccent.unitName, itemByNoAccent.itemId, itemByNoAccent.unitId);
      candidates.push({
        item: itemByNoAccent,
        score: 0.1,
        confidencePercent: 90,
        matchType: 'exact_name',
        unitMatch: unitComp.isCompatible,
      });
      seenIds.add(itemByNoAccent.itemId);
    }

    // C. Fuse.js Fuzzy Search
    if (this.fuse) {
      // Search with accented query
      const fuzzyResults = this.fuse.search(normRaw, { limit: 10 });
      // Search with unaccented query
      const fuzzyResultsNoAccent = this.fuse.search(normRawNoAccent, { limit: 10 });

      const combinedFuzzy = [...fuzzyResults, ...fuzzyResultsNoAccent];

      for (const res of combinedFuzzy) {
        const item = res.item.item;
        if (!seenIds.has(item.itemId)) {
          const score = res.score ?? 0.5;
          const confidence = Math.max(10, Math.round((1 - score) * 100));
          const unitComp = this.checkUnitCompatibility(rawUnit, item.unitName, item.itemId, item.unitId);

          candidates.push({
            item,
            score,
            confidencePercent: confidence,
            matchType: 'fuzzy',
            unitMatch: unitComp.isCompatible,
          });
          seenIds.add(item.itemId);
        }
      }
    }

    // Sort candidates:
    // 1. Learned alias / Exact code / Exact name first
    // 2. Unit match bonus
    // 3. Higher confidence percent / Lower score
    candidates.sort((a, b) => {
      // Match type priority
      const typeRank = {
        learned_alias: 1,
        exact_code: 2,
        exact_name: 3,
        unit_matched: 4,
        fuzzy: 5,
        manual: 6,
      };
      const rankDiff = typeRank[a.matchType] - typeRank[b.matchType];
      if (rankDiff !== 0) return rankDiff;

      // Unit match preference
      if (a.unitMatch !== b.unitMatch) {
        return a.unitMatch ? -1 : 1;
      }

      return b.confidencePercent - a.confidencePercent;
    });

    // Return Top 5 Candidates
    return candidates.slice(0, 5);
  }

  /**
   * Classify a row into GREEN, YELLOW, or RED
   */
  public classifyRow(
    raw: RawInvoiceRow,
    candidates: CandidateMatch[],
    selectedItem: IposItem | null,
    manualConfirmation: boolean = false
  ): { status: RowStatus; warnings: string[] } {
    const warnings: string[] = [];

    // RED checks:
    // 1. Missing or non-positive quantity
    if (raw.quantity === null || raw.quantity === undefined || isNaN(raw.quantity) || raw.quantity <= 0) {
      warnings.push('Thiếu số lượng hợp lệ (> 0)');
      return { status: 'RED', warnings };
    }

    // 2. No selected item & no candidates
    if (!selectedItem && candidates.length === 0) {
      warnings.push('Không tìm thấy mặt hàng tương ứng trong danh mục iPOS');
      return { status: 'RED', warnings };
    }

    const currentItem = selectedItem || (candidates.length > 0 ? candidates[0].item : null);

    if (!currentItem) {
      warnings.push('Chưa chọn mã hàng iPOS');
      return { status: 'RED', warnings };
    }

    // Check Unit Compatibility
    const unitComp = this.checkUnitCompatibility(raw.raw_unit, currentItem.unitName, currentItem.itemId);
    if (!unitComp.isCompatible) {
      warnings.push(unitComp.note || 'Đơn vị tính không tương thích với iPOS');
      return { status: 'RED', warnings };
    }

    if (unitComp.note && unitComp.note.includes('để trống')) {
      warnings.push('ĐVT trên phiếu để trống, tự động gán ĐVT iPOS');
    }

    // If manually confirmed by user, promote to GREEN (as long as no RED blockers)
    if (manualConfirmation) {
      return { status: 'GREEN', warnings };
    }

    // Check candidate quality
    const topCandidate = candidates[0];
    const secondCandidate = candidates.length > 1 ? candidates[1] : null;

    // YELLOW checks:
    // 1. OCR visual certainty is medium or low
    if (raw.visual_certainty === 'low' || raw.visual_certainty === 'medium') {
      warnings.push(`Chữ viết/ảnh nhận diện độ rõ nét: ${raw.visual_certainty === 'low' ? 'Thấp' : 'Trung bình'}`);
    }

    // 2. Review flag requested by OCR
    if (raw.needs_review && raw.review_reason) {
      warnings.push(`AI chú ý: ${raw.review_reason}`);
    }

    // 3. Ambiguous multiple candidates (score margin < 10% between top 2)
    if (topCandidate && secondCandidate) {
      if (topCandidate.matchType === 'fuzzy' && secondCandidate.confidencePercent > 65) {
        const margin = topCandidate.confidencePercent - secondCandidate.confidencePercent;
        if (margin < 10) {
          warnings.push(
            `Nhiều mặt hàng tương đồng: '${topCandidate.item.itemName}' và '${secondCandidate.item.itemName}'`
          );
        }
      }
    }

    // 4. Fuzzy match with confidence below 85%
    if (topCandidate && topCandidate.matchType === 'fuzzy' && topCandidate.confidencePercent < 85) {
      warnings.push(`Độ khớp mờ ${topCandidate.confidencePercent}% - Cần người dùng xác nhận`);
    }

    // If any warning was accumulated, mark as YELLOW
    if (warnings.length > 0) {
      return { status: 'YELLOW', warnings };
    }

    // GREEN:
    // Exact alias, exact code, exact name, or high confidence fuzzy match with clear unit and high OCR certainty
    if (
      topCandidate &&
      (topCandidate.matchType === 'learned_alias' ||
        topCandidate.matchType === 'exact_code' ||
        topCandidate.matchType === 'exact_name' ||
        (topCandidate.matchType === 'fuzzy' && topCandidate.confidencePercent >= 85))
    ) {
      return { status: 'GREEN', warnings: [] };
    }

    return { status: 'YELLOW', warnings: ['Cần xác nhận lại thông tin đối chiếu'] };
  }

  /**
   * Process all raw rows into MatchedInvoiceRows
   */
  public processInvoiceRows(
    rows: RawInvoiceRow[],
    supplierId?: string
  ): MatchedInvoiceRow[] {
    return rows.map((raw, idx) => {
      const candidates = this.resolveCandidates(raw.raw_item_name, raw.raw_unit, supplierId);
      const topCandidate = candidates.length > 0 ? candidates[0].item : null;
      const isLearnedAlias = candidates.length > 0 && candidates[0].matchType === 'learned_alias';

      const classification = this.classifyRow(raw, candidates, topCandidate, false);
      const unitComp = topCandidate
        ? this.checkUnitCompatibility(raw.raw_unit, topCandidate.unitName, topCandidate.itemId)
        : { isCompatible: false, matchedUnit: raw.raw_unit || '' };

      const subTotal =
        raw.amount !== null && raw.amount !== undefined
          ? raw.amount
          : (raw.quantity || 0) * (raw.price || 0);

      return {
        id: `row_${Date.now()}_${idx}_${raw.line_no}`,
        line_no: raw.line_no || idx + 1,
        raw,
        selectedCandidate: topCandidate,
        candidates,
        status: classification.status,
        warnings: classification.warnings,

        raw_item_name: raw.raw_item_name,
        item_id: topCandidate?.itemId || '',
        item_name: topCandidate?.itemName || raw.raw_item_name,
        unit: unitComp.matchedUnit || topCandidate?.unitName || raw.raw_unit || '',
        quantity: raw.quantity,
        price: raw.price,
        discount: 0,
        discount_amount: 0,
        vat: 0,
        amount_vat: 0,
        sub_total: subTotal || null,
        note: raw.review_reason || '',

        isManuallyConfirmed: classification.status === 'GREEN',
        learnedAliasApplied: isLearnedAlias,
      };
    });
  }
}
