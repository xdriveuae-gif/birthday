import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, seedAdminIfEmpty } from './db/index.js';
import { hashPassword } from './lib/password.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const repoRoot = path.resolve(__dirname, '../..');
const dbPath = path.resolve(repoRoot, process.env.SQLITE_PATH || 'server/data/app.db');
const uploadsDir = path.resolve(repoRoot, process.env.UPLOADS_DIR || 'server/data/uploads');
const clientDistDir = path.join(repoRoot, 'client/dist');
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  console.error('SESSION_SECRET is not set. Copy .env.example to .env at the repo root and configure it.');
  process.exit(1);
}

const db = initDb(dbPath);

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminUsername && adminPassword) {
  const created = seedAdminIfEmpty(db, adminUsername, hashPassword(adminPassword));
  if (created) console.log(`Admin account "${adminUsername}" created.`);
} else {
  console.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set in .env — skipping admin seed.');
}

const app = createApp({ db, uploadsDir, sessionSecret, clientDistDir, isProduction });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
