import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('DealsService property context', () => {
  it('거래 목록의 호실에 동 정보를 함께 조회한다', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new DealsService({
      deal: { findMany },
    } as unknown as PrismaService);

    await service.findAll('office-1');

    // 목록 줄은 집을 가볍게 싣는다: 단지는 이름 · 주소, 호는 표기에 쓰는 칸과 동
    const { include } = findMany.mock.calls[0][0];
    const property = include.listing.select.property.select;
    expect(property.site.select).toEqual(expect.objectContaining({ name: true, roadAddress: true }));
    expect(property.unit.select.dong.select).toEqual({ id: true, name: true, isPlaceholder: true });
    expect(include.listing.select).not.toHaveProperty('intake');
  });
});
