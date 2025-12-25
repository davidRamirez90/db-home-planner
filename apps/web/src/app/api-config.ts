type AppConfig = {
  workerApiBaseUrl?: string;
};

const fallbackWorkerApiBaseUrl = 'https://db-home-planner-api.<your-account>.workers.dev';

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

export const workerApiBaseUrl = resolvedWorkerApiBaseUrl || fallbackWorkerApiBaseUrl;
