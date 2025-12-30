const NRW_LINE_PREFIX = /^de:nrw\.de:/i;

export const normalizeLineKey = (value: string): string => {
  if (!value) {
    return '';
  }

  return value.trim().replace(NRW_LINE_PREFIX, '').replace(/\s+/g, '').toLowerCase();
};

export const formatLineLabel = (value: string): string => {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  const stripped = trimmed.replace(NRW_LINE_PREFIX, '').trim();
  return stripped.toUpperCase();
};
