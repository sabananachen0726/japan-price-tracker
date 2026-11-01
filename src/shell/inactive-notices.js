export function inactiveNotices(catalog, appData, people, reads, uid) {
  return Object.entries(catalog?.items || {}).flatMap(([code, item]) => Object.values(item.inactiveNotices || {}).map(notice => ({
    ...notice, code, name: item.name || appData.products?.[appData.itemToBarcode?.[code]]?.name || code,
    operator: people?.[notice.uid]?.name || notice.by || '同事', read: !!reads?.[uid]?.[notice.id]
  }))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
export function noticeExportRows(entries) {
  return [['Item Code', '商品名稱', '停用人員', '停用時間（Brisbane）', '通知狀態'], ...entries.map(n => [
    n.code, n.name, n.operator,
    n.at && Number.isFinite(Date.parse(n.at)) ? new Date(n.at).toLocaleString('zh-TW', {timeZone: 'Australia/Brisbane'}) : n.at || '',
    n.read ? '已讀' : '未讀'
  ])];
}
