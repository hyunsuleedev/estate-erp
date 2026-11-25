import { shouldEnableApiDocs } from './api-docs';

describe('shouldEnableApiDocs', () => {
  it('disables API docs in production by default', () => {
    expect(shouldEnableApiDocs({ NODE_ENV: 'production' })).toBe(false);
  });

  it('enables API docs in development and when NODE_ENV is unset', () => {
    expect(shouldEnableApiDocs({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldEnableApiDocs({})).toBe(true);
  });

  it('respects explicit ENABLE_API_DOCS override', () => {
    expect(
      shouldEnableApiDocs({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' }),
    ).toBe(true);
    expect(
      shouldEnableApiDocs({ NODE_ENV: 'development', ENABLE_API_DOCS: 'false' }),
    ).toBe(false);
  });
});
