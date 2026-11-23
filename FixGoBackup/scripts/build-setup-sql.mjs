// Gộp các migration thành supabase/setup_all.sql để dán vào SQL Editor của Supabase (không cần cài CLI).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const out = files.map((f) => `-- ======== ${f} ========\n${readFileSync(join(root, 'migrations', f), 'utf8')}`).join('\n\n');
writeFileSync(join(root, 'setup_all.sql'), out);
console.log(`✔ Đã tạo supabase/setup_all.sql từ ${files.length} migration`);
