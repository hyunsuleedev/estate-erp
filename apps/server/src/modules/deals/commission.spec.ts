import {
  calculateCommissionAmount,
  calculateCommissionBase,
  getLegalMaxRate,
  siteTypeToCommissionKind,
} from '@estate-erp/shared';

describe('법정 중개보수 (commission)', () => {
  describe('siteTypeToCommissionKind', () => {
    it('주택 계열은 housing', () => {
      expect(siteTypeToCommissionKind('apartment')).toBe('housing');
      expect(siteTypeToCommissionKind('villa')).toBe('housing');
      expect(siteTypeToCommissionKind('house')).toBe('housing');
      expect(siteTypeToCommissionKind('living_accommodation')).toBe('housing');
    });

    it('오피스텔은 officetel', () => {
      expect(siteTypeToCommissionKind('officetel')).toBe('officetel');
    });

    it('상가/토지는 non_housing', () => {
      expect(siteTypeToCommissionKind('commercial')).toBe('non_housing');
      expect(siteTypeToCommissionKind('land')).toBe('non_housing');
    });

    it('알 수 없는 타입은 housing 기본값', () => {
      expect(siteTypeToCommissionKind('unknown_type')).toBe('housing');
    });
  });

  describe('housing (주택) — 기존 구간표 유지', () => {
    it('9억 미만 매매는 0.4% (구간 상한 없음)', () => {
      // 8.5억 매매
      expect(getLegalMaxRate('sale', 85000)).toEqual({ rate: 0.4, cap: null });
      expect(calculateCommissionAmount('sale', 85000)).toEqual({
        rate: 0.4,
        amount: 340, // 85000 × 0.4% = 340만
      });
    });

    it('9억 이상 12억 미만 매매는 0.5%', () => {
      expect(getLegalMaxRate('sale', 90000)).toEqual({ rate: 0.5, cap: null });
    });

    it('propertyKind 생략 시 housing 으로 동작 (하위호환)', () => {
      expect(getLegalMaxRate('jeonse', 30000)).toEqual(
        getLegalMaxRate('jeonse', 30000, 'housing'),
      );
    });
  });

  describe('officetel (주거용 오피스텔)', () => {
    it('매매는 0.5%, 구간/상한액 없음', () => {
      expect(getLegalMaxRate('sale', 30000, 'officetel')).toEqual({
        rate: 0.5,
        cap: null,
      });
      expect(calculateCommissionAmount('sale', 30000, 'officetel')).toEqual({
        rate: 0.5,
        amount: 150,
      });
    });

    it('임대차(전세/월세)는 0.4%', () => {
      // 주택이라면 3억 전세는 0.3% 구간 — 오피스텔은 0.4% 단일 요율
      expect(getLegalMaxRate('jeonse', 30000, 'officetel')).toEqual({
        rate: 0.4,
        cap: null,
      });
      expect(calculateCommissionAmount('jeonse', 30000, 'officetel')).toEqual({
        rate: 0.4,
        amount: 120, // 3억 × 0.4% = 120만
      });
      expect(getLegalMaxRate('monthly', 4000, 'officetel')).toEqual({
        rate: 0.4,
        cap: null, // 주택의 저가 구간 상한액(cap) 미적용
      });
    });
  });

  describe('non_housing (토지·상가 등 주택 외)', () => {
    it('모든 거래 0.9% 이내 협의', () => {
      expect(getLegalMaxRate('sale', 100000, 'non_housing')).toEqual({
        rate: 0.9,
        cap: null,
      });
      expect(getLegalMaxRate('jeonse', 3000, 'non_housing')).toEqual({
        rate: 0.9,
        cap: null,
      });
    });

    it('상가 월세 환산 4억 임대 → 0.9% = 360만', () => {
      // 보증금 1억 + 월세 300만 → 10000 + 300×100 = 40000 (4억)
      const base = calculateCommissionBase('monthly', {
        agreedDeposit: 10000,
        agreedMonthlyRent: 300,
      });
      expect(base).toBe(40000);
      expect(calculateCommissionAmount('monthly', base, 'non_housing')).toEqual(
        { rate: 0.9, amount: 360 },
      );
    });
  });

  describe('monthly (월세) 환산', () => {
    it('환산 = 보증금 + 월세 × 100 (5천만 미만은 ×70)', () => {
      // 보증금 1000만 + 월세 50만 → 1000 + 5000 = 6000 ≥ 5000
      expect(
        calculateCommissionBase('monthly', {
          agreedDeposit: 1000,
          agreedMonthlyRent: 50,
        }),
      ).toBe(6000);
      // 보증금 500만 + 월세 30만 → 500 + 3000 = 3500 < 5000 → 500 + 30×70 = 2600
      expect(
        calculateCommissionBase('monthly', {
          agreedDeposit: 500,
          agreedMonthlyRent: 30,
        }),
      ).toBe(2600);
    });
  });
});
