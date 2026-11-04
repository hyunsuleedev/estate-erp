import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OfficeSitesController } from './office-sites.controller';
import { OfficeSitesService } from './office-sites.service';

describe('OfficeSitesController', () => {
  const registerPrivateSite = jest.fn().mockResolvedValue({ id: 'office-site-1' });
  const searchCentralSites = jest.fn().mockResolvedValue([]);
  let app: INestApplication;
  let baseUrl: string;

  const validBody = { name: '고덕빌라', type: 'villa', wardCode: '1174010200' };
  const register = (body: unknown) =>
    fetch(`${baseUrl}/office-sites/private-sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OfficeSitesController],
      providers: [
        { provide: OfficeSitesService, useValue: { registerPrivateSite, searchCentralSites } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { userId: 'user-1', officeId: 'office-1', role: 'agent' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    // main.ts와 같은 설정 — 이 설정이 있어야 허용되지 않은 필드가 거부된다
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    registerPrivateSite.mockClear();
    searchCentralSites.mockClear();
  });

  it('registers a private site under the office from the token', async () => {
    const response = await register({ ...validBody, name: '  고덕빌라  ' });

    expect(response.status).toBe(201);
    expect(registerPrivateSite).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({ name: '고덕빌라', type: 'villa', wardCode: '1174010200' }),
    );
  });

  it.each([
    ['isPublic', { isPublic: true }],
    ['isLocked', { isLocked: true }],
    ['officeId', { officeId: 'another-office' }],
  ])('rejects a request that tries to set %s', async (_field, extra) => {
    const response = await register({ ...validBody, ...extra });

    expect(response.status).toBe(400);
    expect(registerPrivateSite).not.toHaveBeenCalled();
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['an unknown type', { type: 'castle' }],
    ['a malformed ward code', { wardCode: '11740' }],
    ['an out-of-range build year', { builtYear: 1200 }],
    ['a zero dong count', { totalDongs: 0 }],
  ])('rejects %s', async (_case, overrides) => {
    const response = await register({ ...validBody, ...overrides });

    expect(response.status).toBe(400);
    expect(registerPrivateSite).not.toHaveBeenCalled();
  });

  it('searches within the office from the token', async () => {
    await fetch(`${baseUrl}/office-sites/search?q=${encodeURIComponent('고덕')}`);

    expect(searchCentralSites).toHaveBeenCalledWith('고덕', 'office-1');
  });
});
