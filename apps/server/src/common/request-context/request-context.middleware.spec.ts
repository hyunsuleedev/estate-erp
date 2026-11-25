import type { Request, Response } from 'express';
import { getRequestContext } from './request-context';
import { RequestContextMiddleware } from './request-context.middleware';

function sourceFor(originalUrl: string, headers: Record<string, string> = {}) {
  const middleware = new RequestContextMiddleware();
  let seen: { source?: string; actor?: string } | undefined;
  const request = {
    originalUrl,
    url: originalUrl,
    path: '/',
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  middleware.use(request, {} as Response, () => {
    seen = getRequestContext();
  });
  return seen;
}

describe('RequestContextMiddleware', () => {
  it('labels requests to /mcp as mcp and everything else as web', () => {
    expect(sourceFor('/mcp')).toMatchObject({ source: 'mcp', actor: 'mcp:claude' });
    expect(sourceFor('/mcp/')).toMatchObject({ source: 'mcp' });
    expect(sourceFor('/contacts?limit=5')).toMatchObject({ source: 'web', actor: 'user' });
  });

  it('keeps the app\'s own key management requests as web', () => {
    expect(sourceFor('/mcp/api-key')).toMatchObject({ source: 'web', actor: 'user' });
  });

  it('does not let the client choose the source with a header', () => {
    expect(sourceFor('/contacts', { 'x-estate-source': 'system' })).toMatchObject({ source: 'web' });
    expect(sourceFor('/contacts', { 'x-estate-source': 'mcp' })).toMatchObject({ source: 'web' });
  });
});
