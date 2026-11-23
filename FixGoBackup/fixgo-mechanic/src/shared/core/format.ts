export function formatVND(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
}

export function formatPriceRange(min: number, max: number): string {
  return min === max ? formatVND(min) : `${formatVND(min)} – ${formatVND(max)}`;
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '–';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n));
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function shortCode(id: string): string {
  return 'FG-' + id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function formatRating(avg: number, count: number): string {
  return count > 0 ? `${Number(avg).toFixed(1)} (${count})` : 'Chưa có đánh giá';
}
