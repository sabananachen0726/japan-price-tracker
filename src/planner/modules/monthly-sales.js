// planner: monthly-sales. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "monthly-sales",
  "owns": [{
    "name": "monthlyInfo",
    "kind": "function"
  }],
  "imports": ["factor", "salesError", "salesLoading", "salesSummary", "state"],
  "writes": ["monthlyInfo"]
};
export function register(context) {
  context.monthlyInfo = function monthlyInfo(item) {
    const o = context.state.overrides?.[item.code] || {},
      manual = typeof o.monthly === 'number';
    const row = context.salesSummary?.rows?.[item.code],
      f = context.factor(item);
    const auto = !context.salesLoading && !context.salesError && context.salesSummary && row?.count && f ? row.raw / f : null;
    if (manual) return {
      value: o.monthly,
      auto,
      source: '手動',
      manual: true,
      row,
      f
    };
    // Old embedded Excel monthly values are reference values until sales have been imported.
    if (!context.state.salesV1 && !context.salesLoading && !Object.hasOwn(o, 'monthly') && typeof item.monthly === 'number') return {
      value: item.monthly,
      auto: null,
      source: '舊月銷（未自動計算）',
      manual: false,
      row,
      f
    };
    const source = context.salesLoading ? '銷售載入中' : context.salesError ? '銷售讀取失敗' : !context.salesSummary ? '尚未匯入銷售' : !row?.count ? '無銷售資料' : !f ? '換算待確認' : row.raw < 0 ? '淨銷量為負，請確認' : !context.salesSummary.complete ? '自動・資料不足六個月' : '自動';
    return {
      value: auto,
      auto,
      source,
      manual: false,
      row,
      f
    };
  };
}
export function initialize(context) {}
