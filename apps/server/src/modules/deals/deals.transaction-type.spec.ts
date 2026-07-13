import { BadRequestException } from '@nestjs/common';
import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * 거래유형 검증 회귀 테스트 — 폐기된 yearly_rent(연세) 등 3종 외 유형은
 * Deal 생성 진입점에서 즉시 거부된다 (수수료 생성 skip 으로 조용히 저장되는 구멍 방지).
 */
describe('DealsService 거래유형 검증', () => {
  // 검증은 prisma 접근 전에 수행되므로 mock 은 비어 있어도 된다
  const service = new DealsService({} as unknown as PrismaService);

  it.each(['yearly_rent', 'exchange', 'weekly', ''])(
    '지원하지 않는 거래유형 %p 은 BadRequestException',
    async (transactionType) => {
      await expect(
        service.create('office-1', { transactionType }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('3종(sale/jeonse/monthly)은 유형 검증을 통과한다 (이후 단계에서 prisma 접근)', async () => {
    for (const transactionType of ['sale', 'jeonse', 'monthly']) {
      // 유형 검증을 통과하면 mock prisma($transaction 없음) 접근에서 TypeError 로 실패해야 하며,
      // BadRequestException 이 아니어야 한다.
      await expect(
        service.create('office-1', { transactionType }),
      ).rejects.not.toBeInstanceOf(BadRequestException);
    }
  });
});
