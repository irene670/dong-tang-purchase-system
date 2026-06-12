export const defaultPricingSettings = {
  discount: 100, taxMode: "included", taxRate: 5,
  calculationScope: "line", roundingMode: "round", roundingDigits: 0
};

export function normalizePricingSettings(settings = {}) {
  return {
    discount: Math.min(100, Math.max(1, Number(settings.discount ?? settings.discount_percent ?? 100))),
    taxMode: ["included", "excluded"].includes(settings.taxMode ?? settings.tax_mode) ? (settings.taxMode ?? settings.tax_mode) : "included",
    taxRate: Math.min(100, Math.max(0, Number(settings.taxRate ?? settings.tax_rate ?? 5))),
    calculationScope: ["line", "document"].includes(settings.calculationScope ?? settings.calculation_scope) ? (settings.calculationScope ?? settings.calculation_scope) : "line",
    roundingMode: ["round", "floor", "ceil"].includes(settings.roundingMode ?? settings.rounding_mode) ? (settings.roundingMode ?? settings.rounding_mode) : "round",
    roundingDigits: Math.min(2, Math.max(0, Number(settings.roundingDigits ?? settings.rounding_digits ?? 0)))
  };
}

export function roundMoney(value, settings) {
  const { roundingMode, roundingDigits } = normalizePricingSettings(settings);
  const factor = 10 ** roundingDigits;
  return Math[roundingMode](Number(value) * factor + Number.EPSILON) / factor;
}

export function calculatePricing(items, rawSettings = {}) {
  const settings = normalizePricingSettings(rawSettings);
  const taxFactor = 1 + settings.taxRate / 100;
  const normalized = items.map(item => ({ ...item, price: Number(item.price ?? item.retail_price ?? 0), qty: Math.max(0, Number(item.qty ?? item.quantity ?? 0)) }));
  const retailTotal = normalized.reduce((sum, item) => sum + item.price * item.qty, 0);
  let total;
  if (settings.calculationScope === "document") {
    const discounted = retailTotal * settings.discount / 100;
    total = roundMoney(settings.taxMode === "excluded" ? discounted * taxFactor : discounted, settings);
  }
  const lines = normalized.map(item => {
    const retailLineTotal = item.price * item.qty;
    const discounted = retailLineTotal * settings.discount / 100;
    const lineTotal = settings.calculationScope === "line"
      ? roundMoney(settings.taxMode === "excluded" ? discounted * taxFactor : discounted, settings)
      : (retailTotal ? total * retailLineTotal / retailTotal : 0);
    const preTax = settings.taxMode === "excluded" ? roundMoney(discounted, settings) : roundMoney(lineTotal / taxFactor, settings);
    return { ...item, retailLineTotal, unitPrice: item.qty ? roundMoney(lineTotal / item.qty, settings) : 0, preTax, tax: roundMoney(lineTotal - preTax, settings), total: lineTotal };
  });
  if (settings.calculationScope === "line") total = roundMoney(lines.reduce((sum, line) => sum + line.total, 0), settings);
  const preTaxTotal = settings.taxMode === "excluded"
    ? roundMoney(retailTotal * settings.discount / 100, settings)
    : roundMoney(total / taxFactor, settings);
  return { settings, retailTotal, preTaxTotal, taxTotal: roundMoney(total - preTaxTotal, settings), total, lines };
}

export function pricingDescription(settings) {
  const value = normalizePricingSettings(settings);
  return `${value.taxMode === "included" ? "折後價含稅" : "未稅折扣後加稅"} · ${value.calculationScope === "line" ? "逐品項計算" : "整張單據計算"} · ${{ round: "四捨五入", floor: "無條件捨去", ceil: "無條件進位" }[value.roundingMode]}至小數 ${value.roundingDigits} 位`;
}
