import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultWorkerApiBaseUrl = 'https://db-home-planner-api.<your-account>.workers.dev';
const workerApiBaseUrl =
  process.env.NG_APP_WORKER_API_BASE_URL?.trim() || defaultWorkerApiBaseUrl;
const defaultUseSegmentDisplay = false;

const parseBooleanEnv = (value) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
};

const useSegmentDisplay = parseBooleanEnv(process.env.NG_APP_USE_SEGMENT_DISPLAY) ?? defaultUseSegmentDisplay;

const envPayload = `globalThis.__APP_CONFIG__ = ${JSON.stringify(
  { workerApiBaseUrl, useSegmentDisplay },
  null,
  2,
)};\n`;

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptsDir, '..', 'public');

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, 'env.js'), envPayload, 'utf8');
