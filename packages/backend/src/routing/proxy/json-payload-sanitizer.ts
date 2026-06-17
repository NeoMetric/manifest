export function replaceLoneSurrogates(value: string): string {
  let result = '';

  for (let i = 0; i < value.length; i += 1) {
    const codeUnit = value.charCodeAt(i);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        result += value[i] + value[i + 1];
        i += 1;
      } else {
        result += '\ufffd';
      }
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      result += '\ufffd';
      continue;
    }

    result += value[i];
  }

  return result;
}

export function sanitizeJsonPayload<T>(value: T): T {
  if (typeof value === 'string') {
    return replaceLoneSurrogates(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonPayload(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sanitizeJsonPayload(nestedValue),
      ]),
    ) as T;
  }

  return value;
}
