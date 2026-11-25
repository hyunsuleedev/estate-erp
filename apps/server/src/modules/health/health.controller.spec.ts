import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let app: INestApplication;
  let baseUrl: string;
  const prismaMock = {
    $queryRaw: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 200 ok with no-store on GET /health', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns 200 on HEAD /health for wget --spider', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await fetch(`${baseUrl}/health`, { method: 'HEAD' });

    expect(res.status).toBe(200);
  });

  it('returns 503 error on GET /health when DB query fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ status: 'error' });
  });
});
