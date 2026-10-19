export function parseMYOBFactor(custom) {
  const x = String(custom ?? '').trim();
  if (/^CTN$/i.test(x)) return 1;
  const match = x.match(/^(\d+(?:\.\d+)?)\s*Unit\s*\/\s*CTN$/i) || x.match(/^(\d+(?:\.\d+)?)\s*箱\s*\/\s*捆$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
