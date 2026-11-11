import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://postgres:password@127.0.0.1:5432/estate_erp',
  AUTH0_DOMAIN: 'estait.jp.auth0.com',
  AUTH0_AUDIENCE: 'https://api.estaitt.com',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  AUTH0_MGMT_CLIENT_ID: 'mgmt-client',
  AUTH0_MGMT_CLIENT_SECRET: 'mgmt-secret',
  AUTH0_STAFF_CLIENT_IDS: 'desktop-client',
};

describe('validateEnv', () => {
  it('boots without a Clerk key now that staff login is Auth0', () => {
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  it('requires the Auth0 tenant and API audience', () => {
    expect(() => validateEnv({ ...base, AUTH0_DOMAIN: undefined })).toThrow(
      'AUTH0_DOMAIN',
    );
    expect(() => validateEnv({ ...base, AUTH0_AUDIENCE: '' })).toThrow(
      'AUTH0_AUDIENCE',
    );
  });

  it('refuses to boot when MCP tokens and staff REST tokens would share an audience', () => {
    expect(() =>
      validateEnv({ ...base, MCP_RESOURCE_URL: 'https://api.estaitt.com/' }),
    ).toThrow('must be different');
    // MCP_RESOURCE_URL을 생략하면 운영 주소가 기본값이다.
    expect(() =>
      validateEnv({ ...base, AUTH0_AUDIENCE: 'https://api.estaitt.com/mcp' }),
    ).toThrow('must be different');
    expect(() =>
      validateEnv({ ...base, MCP_RESOURCE_URL: 'http://localhost:3000/mcp' }),
    ).not.toThrow();
  });

  it('in production requires the Management API credentials and an explicit staff client list', () => {
    expect(() => validateEnv({ ...production })).not.toThrow();
    for (const key of [
      'AUTH0_MGMT_CLIENT_ID',
      'AUTH0_MGMT_CLIENT_SECRET',
      'AUTH0_STAFF_CLIENT_IDS',
    ]) {
      expect(() => validateEnv({ ...production, [key]: ' ' })).toThrow(key);
    }
  });

  it('does not require the production-only settings in development', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });
});
