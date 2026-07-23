import { BadRequestException } from '@nestjs/common';
import type { DocumentAddress } from './public-document.types';

export interface GovernmentAddressParams {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: '0' | '1';
  bun: string;
  ji: string;
  pnu: string;
}

function digits(value: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

export function toGovernmentAddressParams(
  address: DocumentAddress,
): GovernmentAddressParams {
  if (!/^\d{10}$/.test(address.wardCode)) {
    throw new BadRequestException('법정동 코드(10자리)가 필요합니다.');
  }

  const main = digits(address.jibunMain);
  const sub = digits(address.jibunSub) || '0';
  if (!main) {
    throw new BadRequestException(
      '지번 본번이 없어 공적장부를 자동 조회할 수 없습니다.',
    );
  }
  if (main.length > 4 || sub.length > 4) {
    throw new BadRequestException('지번 형식이 올바르지 않습니다.');
  }

  const isMountain =
    address.jibunMain?.includes('산') ||
    address.jibunAddress?.includes(' 산') ||
    address.jibunAddress?.trim().startsWith('산');
  const bun = main.padStart(4, '0');
  const ji = sub.padStart(4, '0');
  const landCode = isMountain ? '2' : '1';

  return {
    sigunguCd: address.wardCode.slice(0, 5),
    bjdongCd: address.wardCode.slice(5),
    platGbCd: isMountain ? '1' : '0',
    bun,
    ji,
    pnu: `${address.wardCode}${landCode}${bun}${ji}`,
  };
}
