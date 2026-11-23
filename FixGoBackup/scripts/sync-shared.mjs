// Sao chép mã dùng chung vào từng ứng dụng (mỗi app cần đóng gói độc lập khi build trên EAS Cloud / Vercel).
//   shared/core   → fixgo-user, fixgo-mechanic, fixgo-admin  (logic thuần TypeScript)
//   shared/mobile → fixgo-user, fixgo-mechanic              (React Native: UI, auth, real-time, bản đồ, chat…)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copy = (from, to) => {
  if (!existsSync(join(root, from))) return;
  const dest = join(root, to);
  if (!existsSync(join(root, to.split('/')[0]))) return; // app chưa tồn tại
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, from), dest, { recursive: true });
};

for (const app of ['fixgo-user', 'fixgo-mechanic', 'fixgo-admin']) copy('shared/core', `${app}/src/shared/core`);
for (const app of ['fixgo-user', 'fixgo-mechanic']) copy('shared/mobile', `${app}/src/shared/mobile`);
console.log('✔ Đã đồng bộ shared → các ứng dụng');
