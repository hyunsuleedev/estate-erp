import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('DealsService property context', () => {
  it('거래 목록의 호실에 동 정보를 함께 조회한다', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new DealsService({
      deal: { findMany },
    } as unknown as PrismaService);

    await service.findAll('office-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          listing: {
            include: {
              property: {
                include: {
                  site: true,
                  unit: { include: { dong: true } },
                },
              },
            },
          },
        }),
      }),
    );
  });
});
