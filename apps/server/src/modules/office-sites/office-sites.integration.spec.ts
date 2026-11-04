import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { DongsService } from '../dongs/dongs.service';
import { SitesService } from '../sites/sites.service';
import { UnitsService } from '../units/units.service';
import { OfficeSitesController } from './office-sites.controller';
import { OfficeSitesService } from './office-sites.service';

// Run only against an explicitly supplied disposable local database with migrations applied.
const url = process.env.OFFICE_SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('private site registration PostgreSQL integration', () => {
  const WARD = '9999999999';
  let db: PrismaClient;
  let service: OfficeSitesService;
  let app: INestApplication;
  let baseUrl: string;
  let officeA: string;
  let officeB: string;

  const post = (officeId: string, body: unknown) =>
    fetch(`${baseUrl}/office-sites/private-sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-office': officeId },
      body: JSON.stringify(body),
    });
  const search = async (officeId: string, q: string) => {
    const response = await fetch(`${baseUrl}/office-sites/search?q=${encodeURIComponent(q)}`, {
      headers: { 'x-test-office': officeId },
    });
    return (await response.json()) as Array<{ name: string }>;
  };

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      !parsed.pathname.includes('estate_site_qa')
    ) {
      throw new Error('Use a disposable local estate_site_qa database');
    }
    db = new PrismaClient({ datasourceUrl: url });
    service = new OfficeSitesService(db as PrismaService);

    officeA = (await db.office.create({ data: { name: 'QA 사무소 A' } })).id;
    officeB = (await db.office.create({ data: { name: 'QA 사무소 B' } })).id;
    await db.province.create({ data: { code: '99', name: 'QA' } });
    await db.district.create({ data: { code: '99999', provinceCode: '99', name: 'QA구' } });
    await db.ward.create({ data: { code: WARD, districtCode: '99999', name: 'QA동' } });

    const module = await Test.createTestingModule({
      controllers: [OfficeSitesController],
      providers: [{ provide: OfficeSitesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest();
          request.user = { userId: 'qa', officeId: request.headers['x-test-office'], role: 'agent' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  it('stores a registered site as private, subscribed, with a placeholder dong', async () => {
    const response = await post(officeA, { name: 'QA빌라', type: 'villa', wardCode: WARD });
    expect(response.status).toBe(201);
    const officeSite = (await response.json()) as { siteId: string; officeId: string };
    expect(officeSite.officeId).toBe(officeA);

    const site = await db.site.findUniqueOrThrow({
      where: { id: officeSite.siteId },
      include: { dongs: true },
    });
    expect(site).toMatchObject({ officeId: officeA, isPublic: false, isLocked: false });
    expect(site.dongs).toEqual([
      expect.objectContaining({ name: '-', isPlaceholder: true, officeId: officeA }),
    ]);
  });

  it('rejects isPublic over HTTP without writing anything', async () => {
    const before = await db.site.count();

    const response = await post(officeA, {
      name: 'QA공개시도',
      type: 'villa',
      wardCode: WARD,
      isPublic: true,
    });

    expect(response.status).toBe(400);
    expect(await db.site.count()).toBe(before);
  });

  it('keeps the site private even if the service is handed isPublic directly', async () => {
    const officeSite = await service.registerPrivateSite(officeA, {
      name: 'QA우회시도',
      type: 'villa',
      wardCode: WARD,
      isPublic: true,
      officeId: officeB,
    } as never);

    expect(officeSite.site).toMatchObject({ officeId: officeA, isPublic: false });
    expect(officeSite.officeId).toBe(officeA);
  });

  it('lets the database refuse an office-owned public site', async () => {
    await expect(
      db.site.create({
        data: { officeId: officeA, isPublic: true, type: 'villa', name: 'QA제약', wardCode: WARD },
      }),
    ).rejects.toThrow(/sites_office_owned_never_public/);

    const owned = await db.site.create({
      data: { officeId: officeA, type: 'villa', name: 'QA제약전환', wardCode: WARD },
    });
    await expect(
      db.site.update({ where: { id: owned.id }, data: { isPublic: true } }),
    ).rejects.toThrow(/sites_office_owned_never_public/);

    // 공공데이터(소유 사무소 없음)는 계속 공개할 수 있어야 한다
    await expect(
      db.site.create({
        data: { officeId: null, isPublic: true, type: 'apartment', name: 'QA공공단지', wardCode: WARD },
      }),
    ).resolves.toMatchObject({ isPublic: true });
  });

  it('hides a private site from other offices', async () => {
    await post(officeA, { name: 'QA전용단지', type: 'officetel', wardCode: WARD });

    expect((await search(officeA, 'QA전용단지')).map((site) => site.name)).toEqual(['QA전용단지']);
    expect(await search(officeB, 'QA전용단지')).toEqual([]);

    const privateSite = await db.site.findFirstOrThrow({ where: { name: 'QA전용단지' } });
    await expect(service.add(officeB, { siteId: privateSite.id })).rejects.toThrow('Site not found');
  });

  it('refuses duplicates per office and against public sites only', async () => {
    const body = { name: 'QA중복', type: 'villa', wardCode: WARD };
    expect((await post(officeA, body)).status).toBe(201);
    expect((await post(officeA, body)).status).toBe(409);
    // 다른 사무소의 비공개 단지는 보이지 않으므로 같은 이름을 등록할 수 있다
    expect((await post(officeB, body)).status).toBe(201);
    // 공공 단지는 모두에게 보이므로 같은 이름을 다시 만들지 않는다
    expect(
      (await post(officeB, { name: 'QA공공단지', type: 'apartment', wardCode: WARD })).status,
    ).toBe(409);
  });

  it('lets only one of several simultaneous identical registrations through', async () => {
    const body = { name: 'QA동시등록', type: 'villa', wardCode: WARD };

    const responses = await Promise.all(Array.from({ length: 6 }, () => post(officeA, body)));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    const sites = await db.site.findMany({
      where: { name: 'QA동시등록', officeId: officeA },
      include: { dongs: true, officeSites: true },
    });
    expect(sites).toHaveLength(1);
    expect(sites[0].dongs).toHaveLength(1);
    expect(sites[0].officeSites).toHaveLength(1);
  });

  it('does not make different offices wait on or block each other for the same name', async () => {
    const body = { name: 'QA동시다른사무소', type: 'villa', wardCode: WARD };

    const responses = await Promise.all([post(officeA, body), post(officeB, body)]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
  });

  it('supports the next steps on a private site and keeps them inside the office', async () => {
    const response = await post(officeA, { name: 'QA다음단계', type: 'villa', wardCode: WARD });
    const { siteId } = (await response.json()) as { siteId: string };
    const sites = new SitesService(db as PrismaService);
    const units = new UnitsService(db as PrismaService);

    const overview = await sites.overview(siteId, officeA);
    expect(overview._count.units).toBe(0);
    expect(overview.defaultDongId).toBeTruthy();

    const unit = await units.create(officeA, {
      siteId,
      dongId: overview.defaultDongId!,
      name: '101호',
    });
    expect(unit).toMatchObject({ officeId: officeA, siteId, name: '101호' });

    await expect(sites.overview(siteId, officeB)).rejects.toThrow('Site not found');
    await expect(
      units.create(officeB, { siteId, dongId: overview.defaultDongId!, name: '102호' }),
    ).rejects.toThrow();
    expect(await db.unit.count({ where: { siteId } })).toBe(1);
  });

  it('refuses structure changes on a public site from any office', async () => {
    const site = await db.site.create({
      data: { officeId: null, isPublic: true, isLocked: true, type: 'apartment', name: 'QA공공구조', wardCode: WARD },
    });
    const dong = await db.dong.create({ data: { officeId: null, siteId: site.id, name: '101' } });
    const unit = await db.unit.create({
      data: { officeId: null, siteId: site.id, dongId: dong.id, name: '101호' },
    });
    const dongs = new DongsService(db as PrismaService);
    const units = new UnitsService(db as PrismaService);

    await expect(dongs.create(officeA, { siteId: site.id, name: '102' })).rejects.toThrow('Site not found');
    await expect(dongs.update(dong.id, officeA, { name: '변경' })).rejects.toThrow('Dong not found');
    await expect(dongs.remove(dong.id, officeA)).rejects.toThrow('Dong not found');
    await expect(
      units.create(officeA, { siteId: site.id, dongId: dong.id, name: '102호' }),
    ).rejects.toThrow('Site not found');
    await expect(units.update(unit.id, officeA, { name: '변경' })).rejects.toThrow('Unit not found');
    await expect(units.remove(unit.id, officeA)).rejects.toThrow('Unit not found');

    expect(await db.dong.findMany({ where: { siteId: site.id } })).toEqual([
      expect.objectContaining({ id: dong.id, name: '101' }),
    ]);
    expect(await db.unit.findMany({ where: { siteId: site.id } })).toEqual([
      expect.objectContaining({ id: unit.id, name: '101호' }),
    ]);
  });

  it('rejects an unknown ward', async () => {
    const response = await post(officeA, { name: 'QA없는동', type: 'villa', wardCode: '0000000000' });

    expect(response.status).toBe(400);
  });
});
