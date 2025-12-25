import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultWorkerApiBaseUrl = 'https://db-home-planner-api.<your-account>.workers.dev';
const workerApiBaseUrl =
  process.env.NG_APP_WORKER_API_BASE_URL?.trim() || defaultWorkerApiBaseUrl;

const envPayload = `globalThis.__APP_CONFIG__ = ${JSON.stringify(
  { workerApiBaseUrl },
  null,
  2,
)};\n`;

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptsDir, '..', 'public');

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, 'env.js'), envPayload, 'utf8');

console.log(`Wrote env.js with workerApiBaseUrl=${workerApiBaseUrl}`);
