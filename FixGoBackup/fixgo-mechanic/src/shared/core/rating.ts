// BR-17: trung bình cộng số sao (1–5) các lượt đã gửi; làm tròn 2 chữ số như cột numeric(3,2) trong DB.
export function averageRating(stars: number[]): { avg: number; count: number } {
  if (stars.length === 0) return { avg: 0, count: 0 };
  const sum = stars.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / stars.length) * 100) / 100, count: stars.length };
}
