import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Office } from '@prisma/client';
import type { UpdateOfficeDto } from './offices.dto';

const emptyAddress = {
  roadAddress: null,
  jibunAddress: null,
  detailAddress: null,
  zipCode: null,
  buildingCode: null,
};

/** undefined = preserve; null = explicitly clear; object = replace the full postal address. */
export function prepareOfficeAddress(dto: UpdateOfficeDto, current?: Office) {
  const { postalAddress, address, ...profile } = dto;
  if (postalAddress !== undefined && address !== undefined) {
    throw new BadRequestException(
      '주소는 postalAddress 또는 address 중 하나로 전달하세요.',
    );
  }
  if (
    postalAddress === undefined &&
    (address === undefined || address === current?.address)
  ) {
    return { data: profile, resetLocation: false, geocode: false };
  }

  const normalized = postalAddress
    ? {
        roadAddress: postalAddress.roadAddress?.trim() || null,
        jibunAddress: postalAddress.jibunAddress?.trim() || null,
        detailAddress: postalAddress.detailAddress?.trim() || null,
        zipCode: postalAddress.zipCode?.trim() || null,
        buildingCode: postalAddress.buildingCode?.trim() || null,
      }
    : emptyAddress;
  if (postalAddress && !normalized.roadAddress && !normalized.jibunAddress) {
    throw new BadRequestException('주소 검색에서 기본주소를 선택해 주세요.');
  }
  const hasPostalAddress = Boolean(
    normalized.roadAddress || normalized.jibunAddress,
  );
  const displayAddress = hasPostalAddress
    ? [
        normalized.roadAddress || normalized.jibunAddress,
        normalized.detailAddress,
      ]
        .filter(Boolean)
        .join(' ')
    : address?.trim() || null;
  const baseChanged =
    !current ||
    ['roadAddress', 'jibunAddress', 'zipCode', 'buildingCode'].some(
      (key) =>
        normalized[key as keyof typeof normalized] !==
        current[key as keyof typeof normalized],
    );
  const resetLocation = baseChanged || !hasPostalAddress;

  return {
    data: {
      ...profile,
      ...normalized,
      address: displayAddress,
      ...(resetLocation
        ? {
            addressVersion: hasPostalAddress ? randomUUID() : null,
            geocodingStatus: hasPostalAddress ? 'pending' : null,
            geocodingError: null,
            geocodedAt: null,
            lat: null,
            lng: null,
          }
        : {}),
    },
    resetLocation,
    geocode: resetLocation && hasPostalAddress,
  };
}
