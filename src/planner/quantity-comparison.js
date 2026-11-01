export function quantityComparison(current, remote, code) {
  if (!remote?.updatedAt) return null;
  const now = Number(current), previous = Number(remote.rows?.[code] ?? 0);
  if (!Number.isInteger(now) || now < 0 || !Number.isFinite(previous) || now === previous) return null;
  const delta = now - previous;
  return {previous, delta, text: '已提交 ' + previous.toLocaleString('en-AU') + ' · ' + (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-AU')};
}
