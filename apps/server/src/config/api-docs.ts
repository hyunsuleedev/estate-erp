export function shouldEnableApiDocs(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const explicit = env.ENABLE_API_DOCS?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return env.NODE_ENV !== 'production';
}
