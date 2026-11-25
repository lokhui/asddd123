import type { ConditionLevel, HistoricalPriceRecord, ProductCategory } from './types.ts';

export interface PricingSuggestion {
  source: 'historical' | 'ai_fallback';
  sampleCount: number;
  p25: number;
  p75: number;
  minSuggested: number;
  maxSuggested: number;
  medianPrice: number;
  matchedSamples: Array<{ title: string; soldPrice: number; soldAt: string }>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sorted[lo]);
  const weight = idx - lo;
  return Math.round(sorted[lo] * (1 - weight) + sorted[hi] * weight);
}

export function computeSuggestedPricing(
  records: HistoricalPriceRecord[],
  category: ProductCategory,
  conditionLevel: ConditionLevel,
  keywords: string[],
  title: string,
  estimatedNewPriceTwd: number
): PricingSuggestion {
  const normalizedTerms = [...keywords, title]
    .join(' ')
    .toLowerCase()
    .split(/[\s,、，。/()（）-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  // Filter Completed records by category + condition + keyword similarity
  const sameCategoryAndCondition = records.filter(
    (r) => r.category === category && r.conditionLevel === conditionLevel
  );

  const keywordMatched = sameCategoryAndCondition.filter((r) => {
    if (normalizedTerms.length === 0) return true;
    const haystack = `${r.title} ${r.keywords.join(' ')}`.toLowerCase();
    return normalizedTerms.some((term) => haystack.includes(term));
  });

  // Use keyword-matched subset if >= 3; otherwise check category+condition if >= 3
  const pool =
    keywordMatched.length >= 3
      ? keywordMatched
      : sameCategoryAndCondition.length >= 3
        ? sameCategoryAndCondition
        : [];

  if (pool.length >= 3) {
    const prices = pool.map((r) => r.soldPrice).sort((a, b) => a - b);
    const p25 = percentile(prices, 0.25);
    const p75 = percentile(prices, 0.75);
    const medianPrice = percentile(prices, 0.5);

    return {
      source: 'historical',
      sampleCount: pool.length,
      p25,
      p75: Math.max(p75, p25 + 10),
      minSuggested: p25,
      maxSuggested: Math.max(p75, p25 + 10),
      medianPrice,
      matchedSamples: pool.slice(-5).map((r) => ({
        title: r.title,
        soldPrice: r.soldPrice,
        soldAt: r.soldAt,
      })),
    };
  }

  // Fallback: 40% ~ 60% of AI estimated new retail price
  const safeRetail = Math.max(100, Math.round(estimatedNewPriceTwd || 800));
  const minSuggested = Math.round((safeRetail * 0.4) / 10) * 10;
  const maxSuggested = Math.round((safeRetail * 0.6) / 10) * 10;

  return {
    source: 'ai_fallback',
    sampleCount: keywordMatched.length,
    p25: minSuggested,
    p75: Math.max(maxSuggested, minSuggested + 50),
    minSuggested,
    maxSuggested: Math.max(maxSuggested, minSuggested + 50),
    medianPrice: Math.round((minSuggested + maxSuggested) / 2),
    matchedSamples: keywordMatched.map((r) => ({
      title: r.title,
      soldPrice: r.soldPrice,
      soldAt: r.soldAt,
    })),
  };
}
