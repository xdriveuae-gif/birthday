import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;

const app = createApp({ isProduction });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
