import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealsService } from './deals.service';

const OFFICE_ID = 'office-1';

/** resolveBuyerIntakeId와 setBuyerIntake만 본다. 나머지 의존성은 쓰이지 않는다. */
function setup(rows: {
  match?: { buyerRequirement: { buyerIntakeId: string } } | null;
  intake?: { id: string } | null;
  deal?: { id: string; matchId: string | null } | null;
}) {
  const prisma = {
    match: { findFirst: jest.fn(async () => rows.match ?? null) },
    buyerIntake: { findFirst: jest.fn(async () => rows.intake ?? null) },
    deal: {
      findFirst: jest.fn(async () => rows.deal ?? null),
      update: jest.fn(async () => ({})),
    },
  };
  const service = new DealsService(prisma as never);
  const resolve = (dto: { matchId?: string; buyerIntakeId?: string }) =>
    (
      service as unknown as {
        resolveBuyerIntakeId: (
          tx: unknown,
          officeId: string,
          dto: unknown,
        ) => Promise<string | null>;
      }
    ).resolveBuyerIntakeId(prisma, OFFICE_ID, dto);
  return { service, prisma, resolve };
}

describe('DealsService 거래의 구매 의뢰', () => {
  it('매칭에서 전환한 거래는 그 매칭의 희망조건이 속한 구매 의뢰를 쓴다', async () => {
    const { resolve, prisma } = setup({
      match: { buyerRequirement: { buyerIntakeId: 'intake-from-match' } },
    });
    // 화면이 다른 의뢰를 보내도 매칭이 정한 의뢰가 우선한다.
    await expect(
      resolve({ matchId: 'match-1', buyerIntakeId: 'intake-other' }),
    ).resolves.toBe('intake-from-match');
    expect(prisma.match.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'match-1', officeId: OFFICE_ID } }),
    );
    expect(prisma.buyerIntake.findFirst).not.toHaveBeenCalled();
  });

  it('매칭 없이 만든 거래는 사용자가 고른 같은 사무소의 구매 의뢰를 쓴다', async () => {
    const { resolve, prisma } = setup({ intake: { id: 'intake-1' } });
    await expect(resolve({ buyerIntakeId: 'intake-1' })).resolves.toBe('intake-1');
    expect(prisma.buyerIntake.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'intake-1', officeId: OFFICE_ID } }),
    );
  });

  it('구매 의뢰 없이 바로 계약한 거래는 비워 두고, 없는 의뢰는 거절한다', async () => {
    await expect(setup({}).resolve({})).resolves.toBeNull();
    await expect(
      setup({ intake: null }).resolve({ buyerIntakeId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('매칭에서 전환한 거래의 구매 의뢰는 나중에 바꾸지 못한다', async () => {
    const { service, prisma } = setup({
      deal: { id: 'deal-1', matchId: 'match-1' },
      intake: { id: 'intake-1' },
    });
    await expect(
      service.setBuyerIntake('deal-1', OFFICE_ID, { buyerIntakeId: 'intake-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deal.update).not.toHaveBeenCalled();
  });
});
