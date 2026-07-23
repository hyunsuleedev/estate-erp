import { toGovernmentAddressParams } from './public-document-address.util';
import type { DocumentAddress } from './public-document.types';

function address(overrides: Partial<DocumentAddress> = {}): DocumentAddress {
  return {
    siteId: 'site-id',
    siteName: '테스트',
    wardCode: '1168010100',
    roadAddress: null,
    jibunAddress: '서울특별시 강남구 역삼동 123-45',
    jibunMain: '123',
    jibunSub: '45',
    lat: '37.5',
    lng: '127.0',
    dongName: null,
    unitName: null,
    ...overrides,
  };
}

describe('toGovernmentAddressParams', () => {
  it('일반 지번을 건축물대장 파라미터와 PNU로 변환한다', () => {
    expect(toGovernmentAddressParams(address())).toEqual({
      sigunguCd: '11680',
      bjdongCd: '10100',
      platGbCd: '0',
      bun: '0123',
      ji: '0045',
      pnu: '1168010100101230045',
    });
  });

  it('산 지번에는 산 코드가 적용된다', () => {
    expect(
      toGovernmentAddressParams(
        address({ jibunAddress: '강남구 역삼동 산 7', jibunMain: '산 7' }),
      ),
    ).toMatchObject({ platGbCd: '1', pnu: '1168010100200070045' });
  });
});
