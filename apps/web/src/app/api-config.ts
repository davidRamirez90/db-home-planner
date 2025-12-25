type AppConfig = {
  workerApiBaseUrl?: string;
};

const fallbackWorkerApiBaseUrl = (() => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:8787';
})();

const readAppConfig = (): AppConfig | null => {
  const configValue = (globalThis as { __APP_CONFIG__?: unknown }).__APP_CONFIG__;

  if (!configValue || typeof configValue !== 'object') {
    return null;
  }

  if (!('workerApiBaseUrl' in configValue)) {
    return null;
  }

  const workerApiBaseUrl = (configValue as { workerApiBaseUrl?: unknown }).workerApiBaseUrl;

  if (typeof workerApiBaseUrl !== 'string') {
    return null;
  }

  return { workerApiBaseUrl };
};

const resolvedWorkerApiBaseUrl = readAppConfig()?.workerApiBaseUrl?.trim();

const isValidBaseUrl = (value: string | undefined): value is string => {
  if (!value) {
    return false;
  }

  try {
    new URL('/', value);
    return true;
  } catch {
    return false;
  }
};

export const workerApiBaseUrl = isValidBaseUrl(resolvedWorkerApiBaseUrl)
  ? resolvedWorkerApiBaseUrl
  : fallbackWorkerApiBaseUrl;
