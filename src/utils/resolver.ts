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
  resolveStandardUnitCode,
  isSameOrEquivalentUnit,
  cleanFoodItemName,
  computeLevenshteinDistance,
  computeTokenOverlap,
  FOOD_SYNONYMS,
} from './vietnamese';

interface IndexedSearchItem {
  item: IposItem;
  normName: string;
  normNoAccent: string;
  normCode: string;
  normCategory: string;
  normUnit: string;
  normUnitId: string;
  tokens: string[];
  cleanData: {
    rawCleaned: string;
    coreKeywords: string;
    tokens: string[];
  };
}

/**
 * Determine if an iPOS catalog item is Raw Material (NVL, Loại 0, CPxxx)
 */
export function isRawMaterialItem(item: IposItem): boolean {
  if (item.itemType === 0 || item.itemType === '0') return true;
  const idUpper = (item.itemId || '').trim().toUpperCase();
  if (idUpper.startsWith('CP') || idUpper.startsWith('NVL')) return true;
  const typeStr = String(item.itemType || '').toLowerCase();
  if (typeStr.includes('nguyen vat lieu') || typeStr.includes('nvl') || typeStr.includes('nguyên vật liệu')) return true;
  return false;
}

/**
 * Mandatory culinary synonyms & mapping rules for Vietnamese F&B Inventory
 */
const MANDATORY_CULINARY_RULES: Array<{
  triggers: string[];
  targetCodeKeywords: string[];
}> = [
  { triggers: ['baroi heo', 'ba roi heo', 'thit ba roi heo'], targetCodeKeywords: ['CP07', 'ba chi heo', 'thit ba chi heo'] },
  { triggers: ['ngo ri', 'rau ngo ri'], targetCodeKeywords: ['CP117', 'mui ta', 'rau mui'] },
  { triggers: ['ngo tay', 'rau ngo tay'], targetCodeKeywords: ['CP181', 'mui tay da lat', 'ngò tây', 'mui tay'] },
  { triggers: ['ngo xuan', 'rau ngo xuan'], targetCodeKeywords: ['CP30', 'rau ngo xuan', 'ngo xuan'] },
  { triggers: ['la dua', 'la dua tuoi'], targetCodeKeywords: ['3HT6YXUMFJAG', 'la nep', 'lá nếp'] },
  { triggers: ['dau hu trang', 'dau hu'], targetCodeKeywords: ['CP169', 'dau phu', 'dau hu trang'] },
  { triggers: ['dua leo baby', 'dua leo'], targetCodeKeywords: ['CP302', 'dua chuot', 'dua leo baby'] },
  { triggers: ['sa cay', 'sa tuoi'], targetCodeKeywords: ['CP170', 'sa tuoi', 'sa cay'] },
  { triggers: ['toi cu', 'toi ta'], targetCodeKeywords: ['CP20', 'toi ta', 'toi cu'] },
  { triggers: ['tui zip bac', 'tui zip'], targetCodeKeywords: ['CP237', 'tui zip bac 25x35'] },
];

export class CatalogResolver {
  private masterData: IposMasterData;
  private fuse: Fuse<IndexedSearchItem> | null = null;
  private searchItems: IndexedSearchItem[] = [];
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

      const cleanData = cleanFoodItemName(item.itemName);
      const tokens = normNoAccent.split(/\s+/).filter(Boolean);

      this.searchItems.push({
        item,
        normName,
        normNoAccent,
        normCode,
        normCategory: normCat,
        normUnit,
        normUnitId,
        tokens,
        cleanData,
      });
    }

    // Initialize Fuse for fuzzy search fallback
    this.fuse = new Fuse(this.searchItems, {
      keys: [
        { name: 'normCode', weight: 0.3 },
        { name: 'normName', weight: 0.4 },
        { name: 'normNoAccent', weight: 0.2 },
        { name: 'cleanData.coreKeywords', weight: 0.1 },
      ],
      includeScore: true,
      threshold: 0.6,
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
    // RULE 1: If unit on receipt is missing or empty -> MANDATORY fallback to primary unit in DB
    if (!rawUnit || !rawUnit.trim()) {
      const defaultUnit = itemUnitId || itemUnit || '';
      return {
        isCompatible: true,
        matchedUnit: defaultUnit,
        note: `ĐVT trên phiếu để trống - Tự động lấy ĐVT chính iPOS '${defaultUnit}'`,
      };
    }

    const normRawUnit = normalizeText(rawUnit);
    const normRawUnitNoAccent = normalizeWithoutAccents(rawUnit);
    const normItemUnit = normalizeText(itemUnit || '');
    const normItemUnitNoAccent = normalizeWithoutAccents(itemUnit || '');
    const normItemUnitId = normalizeText(itemUnitId || '');
    const normItemUnitIdNoAccent = normalizeWithoutAccents(itemUnitId || '');

    if (!normItemUnit && !normItemUnitId) {
      return { isCompatible: true, matchedUnit: rawUnit, note: 'ĐVT theo phiếu / chỉ định' };
    }

    const standardRaw = resolveStandardUnitName(rawUnit);
    const standardItem = resolveStandardUnitName(itemUnit || itemUnitId);
    const normStandardRawNoAccent = normalizeWithoutAccents(standardRaw);
    const normStandardItemNoAccent = normalizeWithoutAccents(standardItem);

    // Direct equivalence check (e.g. "Bắp" vs "BAP", "kg" vs "KG", "Cái" vs "CAI")
    if (
      isSameOrEquivalentUnit(rawUnit, itemUnit) ||
      isSameOrEquivalentUnit(rawUnit, itemUnitId) ||
      normRawUnit === normItemUnit ||
      normRawUnitNoAccent === normItemUnitNoAccent ||
      (normItemUnitId && (normRawUnit === normItemUnitId || normRawUnitNoAccent === normItemUnitIdNoAccent)) ||
      (standardRaw && standardItem && normStandardRawNoAccent === normStandardItemNoAccent) ||
      (standardItem && (normRawUnitNoAccent === normStandardItemNoAccent || normRawUnit === normalizeText(standardItem)))
    ) {
      return { isCompatible: true, matchedUnit: itemUnitId || itemUnit || standardItem || rawUnit };
    }

    // Check learned unit alias
    const learnedUnit = this.learnedUnitAliases.find(
      (u) => u.normalized_raw_unit === normRawUnit || u.normalized_raw_unit === normRawUnitNoAccent
    );
    if (learnedUnit) {
      const learnedTargetNorm = normalizeText(learnedUnit.target_unit_name);
      const learnedTargetNoAccent = normalizeWithoutAccents(learnedUnit.target_unit_name);
      if (
        isSameOrEquivalentUnit(learnedUnit.target_unit_name, itemUnit) ||
        isSameOrEquivalentUnit(learnedUnit.target_unit_name, itemUnitId) ||
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
      bap: ['bap', 'bắp', 'trai', 'qua', 'bắp ngô'],
      kg: ['ky', 'ki', 'kilogram', 'kilo', 'k', 'kg', 'kgm'],
      g: ['gram', 'gr', 'g', 'gam'],
      hop: ['h', 'hop', 'box', 'pk'],
      chai: ['ch', 'chai', 'bot', 'bottle'],
      lon: ['l', 'lon', 'can', 'tin'],
      thung: ['th', 'thung', 'kien', 'ctn', 'carton', 'case', 'thg'],
      goi: ['g', 'goi', 'bich', 'tui', 'pack', 'pkg', 'bao'],
      qua: ['trai', 'cai', 'chiec', 'qua', 'q', 'bap'],
      lit: ['l', 'lit', 'litter', 'ltr'],
      cai: ['chiec', 'c', 'cai', 'pc', 'pcs', 'qua', 'trai'],
      can: ['can', 'binh', 'gal'],
      dia: ['dia', 'di', 'plate'],
      ly: ['ly', 'coc', 'cup'],
      loc: ['loc', 'block'],
      khay: ['khay', 'tray'],
      bo: ['bo', 'chum', 'bunch'],
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
        return { isCompatible: true, matchedUnit: itemUnitId || itemUnit || standardItem || rawUnit, note: 'Tương đương ĐVT' };
      }
    }

    // RULE 2: Check unit conversions table
    const conv = this.conversions.find((c) => {
      const itemMatch = !c.itemId || c.itemId === itemId;
      if (!itemMatch) return false;

      const isSrcMatch =
        isSameOrEquivalentUnit(c.sourceUnitName, rawUnit) ||
        normalizeWithoutAccents(c.sourceUnitName) === normRawUnitNoAccent;
      const isTgtMatch =
        isSameOrEquivalentUnit(c.targetUnitName, rawUnit) ||
        normalizeWithoutAccents(c.targetUnitName) === normRawUnitNoAccent;

      if (isSrcMatch || isTgtMatch) {
        if (c.itemId && c.itemId === itemId) return true;
        if (
          (isSrcMatch &&
            (isSameOrEquivalentUnit(c.targetUnitName, itemUnit) ||
              isSameOrEquivalentUnit(c.targetUnitName, itemUnitId))) ||
          (isTgtMatch &&
            (isSameOrEquivalentUnit(c.sourceUnitName, itemUnit) ||
              isSameOrEquivalentUnit(c.sourceUnitName, itemUnitId)))
        ) {
          return true;
        }
      }

      return false;
    });

    if (conv) {
      return {
        isCompatible: true,
        matchedUnit: rawUnit || conv.sourceUnitName || conv.targetUnitName,
        note: `Quy đổi ${conv.sourceUnitName} ⇄ ${conv.targetUnitName} (tỉ lệ ${conv.conversionRate})`,
      };
    }

    // RULE 2 FALLBACK: If NO conversion exists in DB between rawUnit and primary unit ->
    // MANDATORY fallback to primary unit in DB to prevent invalid iPOS import!
    const fallbackUnit = itemUnitId || itemUnit || standardItem || rawUnit || '';
    return {
      isCompatible: false,
      matchedUnit: fallbackUnit,
      note: `Không có quy đổi giữa '${rawUnit}' và ĐVT chính '${fallbackUnit}'. Hệ thống tự động dùng ĐVT chính iPOS '${fallbackUnit}'.`,
    };
  }

  /**
   * Frontier F&B Catalog Matching Algorithm:
   * Finds the closest matching iPOS items for any raw supplier item text.
   */
  public resolveCandidates(
    rawItemName: string,
    rawUnit: string | null,
    supplierId?: string
  ): CandidateMatch[] {
    const candidates: CandidateMatch[] = [];
    const seenIds = new Set<string>();

    if (!rawItemName || !rawItemName.trim()) return [];

    const normRaw = normalizeText(rawItemName);
    const normRawNoAccent = normalizeWithoutAccents(rawItemName);

    // 1. Clean raw string: strip SKU brackets, English cuts, model numbers, noise words
    const cleanInfo = cleanFoodItemName(rawItemName);
    const rawCleaned = cleanInfo.rawCleaned;
    const coreKeywords = cleanInfo.coreKeywords;
    const rawTokens = cleanInfo.tokens;

    // A. Learned supplier-specific / global aliases (Highest Priority: 99%)
    const matchedAliases: LearnedItemAlias[] = [];
    const partialMatchedAliases: LearnedItemAlias[] = [];

    for (const a of this.learnedAliases) {
      const supplierMatch = !supplierId || a.supplier_id === supplierId || a.supplier_id === '*';
      if (!supplierMatch) continue;

      const aNorm = a.normalized_raw_item_name || normalizeText(a.raw_item_sample);
      const aNormNoAccent = normalizeWithoutAccents(aNorm);
      const aSampleNoAccent = normalizeWithoutAccents(a.raw_item_sample);

      // Direct exact match
      const isExactMatch =
        aNorm === normRaw ||
        aNormNoAccent === normRawNoAccent ||
        aNorm === rawCleaned ||
        aNorm === coreKeywords ||
        aSampleNoAccent === normRawNoAccent ||
        normRawNoAccent.replace(/\s+/g, '') === aNormNoAccent.replace(/\s+/g, '');

      if (isExactMatch) {
        matchedAliases.push(a);
      } else {
        // High token overlap or substring match for slight variants across invoices
        const tokensRaw = normRawNoAccent.split(/\s+/).filter(Boolean);
        const tokensAlias = aNormNoAccent.split(/\s+/).filter(Boolean);
        const overlap = computeTokenOverlap(tokensRaw, tokensAlias);

        if (
          overlap.dice >= 0.75 ||
          overlap.recall >= 0.8 ||
          (aNormNoAccent.length >= 8 &&
            (normRawNoAccent.includes(aNormNoAccent) || aNormNoAccent.includes(normRawNoAccent)))
        ) {
          partialMatchedAliases.push(a);
        }
      }
    }

    // Sort exact matches: supplier-specific first, then most used
    matchedAliases.sort((a, b) => {
      if (supplierId && a.supplier_id === supplierId && b.supplier_id !== supplierId) return -1;
      if (supplierId && b.supplier_id === supplierId && a.supplier_id !== supplierId) return 1;
      return (b.timesUsed || 0) - (a.timesUsed || 0);
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

    // Add partial alias matches if exact match didn't yield items
    if (candidates.length === 0 && partialMatchedAliases.length > 0) {
      partialMatchedAliases.sort((a, b) => {
        if (supplierId && a.supplier_id === supplierId && b.supplier_id !== supplierId) return -1;
        if (supplierId && b.supplier_id === supplierId && a.supplier_id !== supplierId) return 1;
        return (b.timesUsed || 0) - (a.timesUsed || 0);
      });

      for (const alias of partialMatchedAliases) {
        const item = this.itemMapById.get(alias.selected_item_id);
        if (item && !seenIds.has(item.itemId)) {
          const unitComp = this.checkUnitCompatibility(rawUnit, item.unitName, item.itemId, item.unitId);
          candidates.push({
            item,
            score: 0.05,
            confidencePercent: 95,
            matchType: 'learned_alias',
            unitMatch: unitComp.isCompatible,
          });
          seenIds.add(item.itemId);
        }
      }
    }

    // B. Exact Code Match (Priority: 98%)
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

    // C. Mandatory F&B Culinary Synonyms Match (Priority: 97%)
    for (const rule of MANDATORY_CULINARY_RULES) {
      const matchTrigger = rule.triggers.some(
        (t) =>
          normRawNoAccent === t ||
          rawCleaned === t ||
          coreKeywords === t ||
          normRawNoAccent.includes(t) ||
          rawCleaned.includes(t)
      );

      if (matchTrigger) {
        // Search items matching targetCodeKeywords
        for (const kw of rule.targetCodeKeywords) {
          const kwUpper = kw.toUpperCase().trim();
          const kwNorm = normalizeWithoutAccents(kw);

          for (const item of this.masterData.items || []) {
            if (seenIds.has(item.itemId)) continue;
            const itemIdUpper = item.itemId.toUpperCase().trim();
            const itemNameNorm = normalizeWithoutAccents(item.itemName);

            if (
              itemIdUpper === kwUpper ||
              itemNameNorm === kwNorm ||
              itemNameNorm.includes(kwNorm) ||
              kwNorm.includes(itemNameNorm)
            ) {
              const unitComp = this.checkUnitCompatibility(rawUnit, item.unitName, item.itemId, item.unitId);
              candidates.push({
                item,
                score: 0.03,
                confidencePercent: 97,
                matchType: 'learned_alias',
                unitMatch: unitComp.isCompatible,
              });
              seenIds.add(item.itemId);
              break;
            }
          }
        }
      }
    }

    // D. Multi-Factor Semantic & Substring & Token Scoring against ALL items in master catalog
    const scoredList: {
      indexed: IndexedSearchItem;
      score: number; // 0.0 to 1.0 (higher = better)
      confidence: number;
      matchType: CandidateMatch['matchType'];
      unitMatch: boolean;
      isRawMaterial: boolean;
    }[] = [];

    // Expanded synonyms for query
    const querySynonyms = FOOD_SYNONYMS[coreKeywords] || FOOD_SYNONYMS[rawCleaned] || [];

    for (const indexed of this.searchItems) {
      if (seenIds.has(indexed.item.itemId)) continue;

      const itemNormNoAccent = indexed.normNoAccent;
      const itemCoreKeywords = indexed.cleanData.coreKeywords;
      const itemTokens = indexed.tokens;
      const isRawMat = isRawMaterialItem(indexed.item);

      let score = 0;
      let matchType: CandidateMatch['matchType'] = 'fuzzy';

      // 1. Direct match on core keywords or exact normalized name
      if (normRawNoAccent === itemNormNoAccent || rawCleaned === itemNormNoAccent) {
        score = 0.96;
        matchType = 'exact_name';
      } else if (coreKeywords && (coreKeywords === itemNormNoAccent || coreKeywords === itemCoreKeywords)) {
        score = 0.94;
        matchType = 'exact_name';
      } else {
        // 2. Direct Substring Inclusion Check
        // E.g. "khoai tay cong" is in "[p000131] khoai tay cong 9 dong lanh aviko straight cut"
        const dbInRaw = rawCleaned.includes(itemNormNoAccent) || normRawNoAccent.includes(itemNormNoAccent);
        const dbCoreInRaw = itemCoreKeywords && (rawCleaned.includes(itemCoreKeywords) || normRawNoAccent.includes(itemCoreKeywords));
        const rawInDb = itemNormNoAccent.includes(coreKeywords) || itemNormNoAccent.includes(rawCleaned);

        if (dbInRaw || dbCoreInRaw) {
          const lenRatio = itemNormNoAccent.length / Math.max(rawCleaned.length, 1);
          score = Math.max(score, 0.88 + Math.min(lenRatio * 0.08, 0.08));
          matchType = 'exact_name';
        } else if (rawInDb && coreKeywords.length >= 4) {
          const lenRatio = coreKeywords.length / Math.max(itemNormNoAccent.length, 1);
          score = Math.max(score, 0.84 + Math.min(lenRatio * 0.10, 0.10));
          matchType = 'exact_name';
        }

        // 3. Token Overlap & Jaccard / Dice Coverage
        const overlap = computeTokenOverlap(rawTokens, itemTokens);
        if (overlap.precision >= 0.99 && rawTokens.length > 0) {
          // All tokens from raw query are in this item (e.g. 'ot' in 'ot cay', 'toi' in 'toi cu', 'ca chua' in 'ca chua bi')
          const tokenScore = 0.85 + Math.min(overlap.dice * 0.10, 0.10);
          if (tokenScore > score) {
            score = tokenScore;
            matchType = 'exact_name';
          }
        } else if (overlap.recall >= 0.99 && itemTokens.length >= 2) {
          const tokenScore = 0.86 + Math.min(overlap.dice * 0.08, 0.08);
          if (tokenScore > score) {
            score = tokenScore;
            matchType = 'fuzzy';
          }
        } else if (overlap.sharedCount >= 2) {
          const tokenScore = 0.65 + overlap.dice * 0.25;
          if (tokenScore > score) {
            score = tokenScore;
            matchType = 'fuzzy';
          }
        } else if (overlap.sharedCount === 1 && itemTokens.length === 1 && rawTokens.length <= 3) {
          const tokenScore = 0.60 + overlap.dice * 0.2;
          if (tokenScore > score) {
            score = tokenScore;
            matchType = 'fuzzy';
          }
        }

        // 4. Synonym Expansion Check
        for (const syn of querySynonyms) {
          if (itemNormNoAccent.includes(syn) || syn.includes(itemNormNoAccent)) {
            const synScore = 0.88;
            if (synScore > score) {
              score = synScore;
              matchType = 'fuzzy';
            }
          }
        }

        // 5. Levenshtein edit distance on core keywords
        if (coreKeywords && itemCoreKeywords) {
          const dist = computeLevenshteinDistance(coreKeywords, itemCoreKeywords);
          const maxLen = Math.max(coreKeywords.length, itemCoreKeywords.length);
          if (maxLen > 0) {
            const levRatio = 1 - dist / maxLen;
            if (levRatio > 0.75) {
              const levScore = 0.70 + levRatio * 0.22;
              if (levScore > score) {
                score = levScore;
                matchType = 'fuzzy';
              }
            }
          }
        }
      }

      // Unit Compatibility Check & Bonus
      const unitComp = this.checkUnitCompatibility(
        rawUnit,
        indexed.item.unitName,
        indexed.item.itemId,
        indexed.item.unitId
      );

      if (score >= 0.35) {
        // Priority bonus for Raw Material (NVL, Loại 0, CPxxx) over Finished Products
        if (isRawMat) {
          score = Math.min(1.0, score + 0.05);
        }

        if (unitComp.isCompatible) {
          score = Math.min(1.0, score + 0.03); // +3% bonus for compatible unit
        }

        const confidence = Math.min(99, Math.max(10, Math.round(score * 100)));
        scoredList.push({
          indexed,
          score,
          confidence,
          matchType,
          unitMatch: unitComp.isCompatible,
          isRawMaterial: isRawMat,
        });
      }
    }

    // Sort scored items descending by score with Raw Material preference
    scoredList.sort((a, b) => {
      // Prioritize Raw Material (NVL / CPxxx) when scores are close
      if (Math.abs(b.score - a.score) < 0.08 && a.isRawMaterial !== b.isRawMaterial) {
        return a.isRawMaterial ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      if (a.isRawMaterial !== b.isRawMaterial) return a.isRawMaterial ? -1 : 1;
      if (a.unitMatch !== b.unitMatch) return a.unitMatch ? -1 : 1;
      return a.indexed.normNoAccent.length - b.indexed.normNoAccent.length; // shorter name preferred
    });

    // Add top scoring candidates
    for (const entry of scoredList.slice(0, 8)) {
      if (!seenIds.has(entry.indexed.item.itemId)) {
        candidates.push({
          item: entry.indexed.item,
          score: 1 - entry.score,
          confidencePercent: entry.confidence,
          matchType: entry.matchType,
          unitMatch: entry.unitMatch,
        });
        seenIds.add(entry.indexed.item.itemId);
      }
    }

    // D. Fuse.js fallback search if still few candidates
    if (candidates.length < 3 && this.fuse) {
      const fuzzyResults = this.fuse.search(coreKeywords || normRawNoAccent, { limit: 5 });
      for (const res of fuzzyResults) {
        const item = res.item.item;
        if (!seenIds.has(item.itemId)) {
          // Avoid spurious substring matches for short words (e.g. 'ot' inside 'cocopot')
          const itemTokens = normalizeWithoutAccents(item.itemName).toLowerCase().split(/\s+/);
          const hasTokenOverlap = rawTokens.some(
            (t) => itemTokens.includes(t) || (t.length >= 4 && itemTokens.some((it) => it.includes(t)))
          );
          if (!hasTokenOverlap && rawTokens.length <= 2) {
            continue;
          }

          const fuseScore = res.score ?? 0.6;
          const confidence = Math.max(10, Math.round((1 - fuseScore) * 100));
          if (confidence >= 35) {
            const unitComp = this.checkUnitCompatibility(rawUnit, item.unitName, item.itemId, item.unitId);
            candidates.push({
              item,
              score: fuseScore,
              confidencePercent: confidence,
              matchType: 'fuzzy',
              unitMatch: unitComp.isCompatible,
            });
            seenIds.add(item.itemId);
          }
        }
      }
    }

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

    // Check quantity
    if (raw.quantity === null || raw.quantity === undefined || isNaN(raw.quantity) || raw.quantity <= 0) {
      warnings.push('Thiếu số lượng hợp lệ (> 0)');
      return { status: 'RED', warnings };
    }

    // If no candidate and no selected item in DB -> RED
    if (!selectedItem && candidates.length === 0) {
      warnings.push('Mặt hàng chưa có trong danh mục iPOS - Vui lòng gán mã hoặc tạo mới (Vẫn cho phép xuất Excel)');
      return { status: 'RED', warnings };
    }

    const currentItem = selectedItem || (candidates.length > 0 ? candidates[0].item : null);

    if (!currentItem) {
      warnings.push('Chưa gán mã hàng iPOS (Vẫn cho phép xuất Excel)');
      return { status: 'RED', warnings };
    }

    // Check Unit Compatibility
    const unitComp = this.checkUnitCompatibility(
      raw.raw_unit,
      currentItem.unitName,
      currentItem.itemId,
      currentItem.unitId
    );
    if (!unitComp.isCompatible) {
      warnings.push(unitComp.note || 'Đơn vị tính khác với ĐVT mặc định iPOS');
    } else if (unitComp.note && unitComp.note.includes('để trống')) {
      warnings.push('ĐVT trên phiếu để trống, tự động gán ĐVT iPOS');
    }

    // If manually confirmed by user, promote to GREEN (as long as quantity is valid)
    if (manualConfirmation) {
      return { status: 'GREEN', warnings };
    }

    const topCandidate = candidates[0];
    const secondCandidate = candidates.length > 1 ? candidates[1] : null;

    // Check candidate quality
    if (topCandidate) {
      // If top candidate has high confidence (>= 75%) and unit is compatible
      if (topCandidate.confidencePercent >= 75) {
        if (unitComp.isCompatible) {
          return { status: 'GREEN', warnings: [] };
        } else {
          return { status: 'YELLOW', warnings };
        }
      }

      // Medium confidence (40% - 74%): Mark YELLOW for user review
      if (topCandidate.confidencePercent >= 40) {
        warnings.push(`Đã tự động chọn mặt hàng sát nghĩa nhất (${topCandidate.confidencePercent}%) - Vui lòng kiểm tra lại nếu cần`);
        return { status: 'YELLOW', warnings };
      }
    }

    // Low confidence (< 40%): Item is practically not in DB
    if (!selectedItem) {
      warnings.push('Mặt hàng chưa có trong danh mục iPOS - Vui lòng gán mã hoặc tạo mới');
      return { status: 'RED', warnings };
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
      
      // Auto-fill top candidate if confidence >= 40%
      const topCandidateMatch = candidates.length > 0 && candidates[0].confidencePercent >= 40 ? candidates[0] : null;
      const topCandidate = topCandidateMatch ? topCandidateMatch.item : null;
      const isLearnedAlias = topCandidateMatch?.matchType === 'learned_alias';

      const classification = this.classifyRow(raw, candidates, topCandidate, false);
      const unitComp = topCandidate
        ? this.checkUnitCompatibility(raw.raw_unit, topCandidate.unitName, topCandidate.itemId, topCandidate.unitId)
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
        unit: unitComp.matchedUnit || topCandidate?.unitId || topCandidate?.unitName || raw.raw_unit || '',
        quantity: raw.quantity,
        price: raw.price,
        discount: 0,
        discount_amount: 0,
        vat: 0,
        amount_vat: 0,
        sub_total: subTotal || null,
        total_amount: subTotal || null,
        note: raw.review_reason || '',

        isManuallyConfirmed: classification.status === 'GREEN',
        learnedAliasApplied: isLearnedAlias,
      };
    });
  }
}

