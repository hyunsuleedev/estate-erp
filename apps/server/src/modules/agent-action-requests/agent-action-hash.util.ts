import { createHash } from 'node:crypto';

export function canonicalizeJson(value: unknown): string {
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? 'null' : canonicalizeJson(item)))
      .join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeJson(item)}`)
      .join(',')}}`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('JSON numbers must be finite');
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Value is not JSON serializable');
  }
  return serialized;
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}

export function toJsonValue<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}
