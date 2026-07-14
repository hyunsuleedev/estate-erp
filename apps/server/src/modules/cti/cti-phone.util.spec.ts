import { formatKoreanPhone, normalizeCtiPhone } from './cti-phone.util';

describe('normalizeCtiPhone (레거시 m_MyCallRecv 규칙)', () => {
  it('숫자 외 문자를 제거한다', () => {
    expect(normalizeCtiPhone('010-1234-5678')).toEqual({
      phoneNumber: '01012345678',
      isPrivate: false,
    });
  });

  it('82 국가번호를 0으로 변환한다', () => {
    expect(normalizeCtiPhone('821012345678')).toEqual({
      phoneNumber: '01012345678',
      isPrivate: false,
    });
  });

  it('3자리 미만은 발신표시제한으로 분류한다', () => {
    expect(normalizeCtiPhone('12')).toEqual({ phoneNumber: '', isPrivate: true });
    expect(normalizeCtiPhone('Private')).toEqual({
      phoneNumber: '',
      isPrivate: true,
    });
    expect(normalizeCtiPhone(undefined)).toEqual({
      phoneNumber: '',
      isPrivate: true,
    });
  });

  it('짧은 82x 번호는 국가번호 변환하지 않는다', () => {
    expect(normalizeCtiPhone('821234')).toEqual({
      phoneNumber: '821234',
      isPrivate: false,
    });
  });
});

describe('formatKoreanPhone', () => {
  it('휴대폰 번호에 대시를 붙인다', () => {
    expect(formatKoreanPhone('01012345678')).toBe('010-1234-5678');
  });

  it('서울 유선(02) 번호를 포맷한다', () => {
    expect(formatKoreanPhone('0212345678')).toBe('02-1234-5678');
    expect(formatKoreanPhone('021234567')).toBe('02-123-4567');
  });

  it('지역 유선 번호를 포맷한다', () => {
    expect(formatKoreanPhone('0311234567')).toBe('031-123-4567');
    expect(formatKoreanPhone('03112345678')).toBe('031-1234-5678');
  });

  it('규칙에 안 맞으면 원본을 반환한다', () => {
    expect(formatKoreanPhone('12345')).toBe('12345');
  });
});
