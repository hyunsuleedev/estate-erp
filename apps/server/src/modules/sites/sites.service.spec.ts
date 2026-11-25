import { OfficeSitesService } from '../office-sites/office-sites.service';
import { needsPlaceholderDong } from './private-site';
import { SitesService } from './sites.service';

/**
 * 단지를 만드는 두 길(POST /sites, 관리단지 화면의 직접 등록)이 같은 결과를 내는지.
 * 2026-11-22 검토: POST /sites로 만든 단독·다가구에는 동 구분 없는 동이 없어 호를 등록할 수 없었다.
 */
describe('SitesService.create', () => {
  function createPrisma() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      site: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'site-1', ...data }),
        ),
      },
      dong: { create: jest.fn().mockResolvedValue({ id: 'dong-1' }) },
      officeSite: { create: jest.fn().mockResolvedValue({ id: 'office-site-1' }) },
    };
    const prisma = {
      ward: { findUnique: jest.fn().mockResolvedValue({ code: '1174010200' }) },
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    return { prisma, tx };
  }

  const base = { name: '고덕동 다가구', wardCode: '1174010200' };

  it('creates the placeholder dong for a house, like the managed-site registration does', async () => {
    const viaSites = createPrisma();
    await new SitesService(viaSites.prisma as never).create('office-1', { ...base, type: 'house' });

    const viaOfficeSites = createPrisma();
    await new OfficeSitesService(viaOfficeSites.prisma as never).registerPrivateSite('office-1', {
      ...base,
      type: 'house',
    } as never);

    const placeholder = { officeId: 'office-1', siteId: 'site-1', name: '-', isPlaceholder: true };
    expect(viaSites.tx.dong.create).toHaveBeenCalledWith({ data: placeholder });
    expect(viaOfficeSites.tx.dong.create).toHaveBeenCalledWith({ data: placeholder });
  });

  it('does not create a dong for land or for an apartment whose dong count is unknown', async () => {
    for (const type of ['land', 'apartment']) {
      const { prisma, tx } = createPrisma();
      await new SitesService(prisma as never).create('office-1', { ...base, type });
      expect(tx.dong.create).not.toHaveBeenCalled();
    }
  });

  it('keeps the site private to the requesting office whatever the body says', async () => {
    const { prisma, tx } = createPrisma();

    await new SitesService(prisma as never).create('office-1', {
      ...base,
      type: 'villa',
      officeId: 'another-office',
      isPublic: true,
      isLocked: true,
    } as never);

    const { data } = tx.site.create.mock.calls[0][0];
    expect(data).toMatchObject({ officeId: 'office-1', isPublic: false, isLocked: false });
    expect(tx.dong.create).toHaveBeenCalledWith({
      data: { officeId: 'office-1', siteId: 'site-1', name: '-', isPlaceholder: true },
    });
  });
});

describe('needsPlaceholderDong', () => {
  it.each([
    ['house', undefined, true],
    ['house', null, true],
    ['house', 2, false],
    ['villa', undefined, true],
    ['commercial', undefined, true],
    ['apartment', undefined, false],
    ['apartment', 1, true],
    ['land', 1, false],
  ] as const)('%s with totalDongs=%s: %s', (type, totalDongs, expected) => {
    expect(needsPlaceholderDong(type, totalDongs)).toBe(expected);
  });
});
