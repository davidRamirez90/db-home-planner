type AppConfig = {
  workerApiBaseUrl?: string;
  useSegmentDisplay?: boolean;
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

  const candidate = configValue as { workerApiBaseUrl?: unknown; useSegmentDisplay?: unknown };
  const workerApiBaseUrl =
    typeof candidate.workerApiBaseUrl === 'string' ? candidate.workerApiBaseUrl : undefined;
  const useSegmentDisplay =
    typeof candidate.useSegmentDisplay === 'boolean' ? candidate.useSegmentDisplay : undefined;

  if (!workerApiBaseUrl && typeof useSegmentDisplay === 'undefined') {
    return null;
  }

  return { workerApiBaseUrl, useSegmentDisplay };
};

const appConfig = readAppConfig();
const resolvedWorkerApiBaseUrl = appConfig?.workerApiBaseUrl?.trim();
const resolvedUseSegmentDisplay = appConfig?.useSegmentDisplay;

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

export const useSegmentDisplay = resolvedUseSegmentDisplay ?? false;
