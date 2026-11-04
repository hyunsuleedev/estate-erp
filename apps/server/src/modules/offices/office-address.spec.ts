import { ValidationPipe } from '@nestjs/common';
import type { Office } from '@prisma/client';
import { prepareOfficeAddress } from './office-address';
import { CreateOfficeDto, UpdateOfficeDto } from './offices.dto';
import { OfficeGeocodingService } from './office-geocoding.service';

const postal = {
  roadAddress: '경기 성남시 분당구 판교역로 166',
  jibunAddress: null,
  detailAddress: ' 2층 ',
  zipCode: '13529',
  buildingCode: '4113511000106810000000001',
};
const current = {
  ...postal,
  address: `${postal.roadAddress} 2층`,
  addressVersion: 'old-version',
  lat: 37.4,
  lng: 127.1,
  geocodingStatus: 'ready',
} as unknown as Office;

describe('office address semantics', () => {
  it('leaves an omitted optional address untouched', () => {
    expect(prepareOfficeAddress({ name: '사무소' }, current)).toEqual({
      data: { name: '사무소' },
      resetLocation: false,
      geocode: false,
    });
  });
  it('clears every address and location field explicitly', () => {
    expect(
      prepareOfficeAddress({ postalAddress: null }, current),
    ).toMatchObject({
      data: {
        address: null,
        roadAddress: null,
        jibunAddress: null,
        detailAddress: null,
        zipCode: null,
        buildingCode: null,
        addressVersion: null,
        lat: null,
        lng: null,
        geocodingStatus: null,
      },
      resetLocation: true,
      geocode: false,
    });
  });
  it('keeps location and version for detail-only edits', () => {
    const result = prepareOfficeAddress(
      { postalAddress: { ...postal, detailAddress: ' 3층 ' } },
      current,
    );
    expect(result).toMatchObject({
      data: { address: `${postal.roadAddress} 3층`, detailAddress: '3층' },
      resetLocation: false,
      geocode: false,
    });
    expect(result.data).not.toHaveProperty('addressVersion');
    expect(result.data).not.toHaveProperty('lat');
  });
  it('invalidates the old location when the building changes', () => {
    const result = prepareOfficeAddress(
      {
        postalAddress: {
          ...postal,
          roadAddress: '서울특별시 중구 세종대로 110',
        },
      },
      current,
    );
    expect(result).toMatchObject({
      resetLocation: true,
      geocode: true,
      data: { lat: null, lng: null, geocodingStatus: 'pending' },
    });
    expect(result.data).toHaveProperty(
      'addressVersion',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });
  it('supports a jibun-only address without inventing a road address', () => {
    expect(
      prepareOfficeAddress({
        postalAddress: { jibunAddress: '서울특별시 중구 태평로1가 31' },
      }).data,
    ).toMatchObject({
      roadAddress: null,
      address: '서울특별시 중구 태평로1가 31',
    });
  });
  it('preserves structured fields when an old client echoes the display address', () => {
    expect(
      prepareOfficeAddress({ address: current.address }, current),
    ).toMatchObject({ data: {}, resetLocation: false });
  });
  it('clears structured fields when an old client changes its free-text address', () => {
    expect(
      prepareOfficeAddress({ address: '이전 클라이언트 주소' }, current),
    ).toMatchObject({
      data: { address: '이전 클라이언트 주소', roadAddress: null, lat: null },
      resetLocation: true,
      geocode: false,
    });
  });
  it('rejects missing base addresses and conflicting representations', () => {
    expect(() =>
      prepareOfficeAddress({ postalAddress: { detailAddress: '2층' } }),
    ).toThrow();
    expect(() =>
      prepareOfficeAddress({ postalAddress: postal, address: 'other' }),
    ).toThrow();
  });
});

describe('office DTO validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown, metatype = CreateOfficeDto) =>
    pipe.transform(value, { type: 'body', metatype });
  it('allows creation without an address but requires a nonempty name', async () => {
    await expect(validate({ name: ' 사무소 ' })).resolves.toMatchObject({
      name: '사무소',
    });
    for (const name of [undefined, null, '   '])
      await expect(validate({ name })).rejects.toThrow();
  });
  it('validates nested postal codes and disallows client-supplied coordinates', async () => {
    await expect(
      validate({ name: '사무소', postalAddress: postal }),
    ).resolves.toBeDefined();
    for (const data of [
      { zipCode: '123' },
      { buildingCode: '123' },
      { lat: 37.4 },
    ]) {
      await expect(
        validate({ name: '사무소', postalAddress: { ...postal, ...data } }),
      ).rejects.toThrow();
    }
    await expect(
      pipe.transform(
        { postalAddress: null },
        { type: 'body', metatype: UpdateOfficeDto },
      ),
    ).resolves.toMatchObject({ postalAddress: null });
  });
});

describe('office server geocoding', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  function setup(configured = true) {
    const prisma = {
      office: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...current, id: 'office-id' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const service = new OfficeGeocodingService(
      prisma as never,
      { get: () => (configured ? 'test-only' : undefined) } as never,
    );
    return { prisma, fetchMock, service };
  }
  const result = {
    roadAddress: '경기도 성남시 분당구 판교역로 166',
    x: '127.1101',
    y: '37.3957',
  };
  it('saves an exact match with longitude first, the correct SRIDs, and a stale-response guard', async () => {
    const { prisma, fetchMock, service } = setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'OK', addresses: [result] }),
    });
    await service.refresh('office-id');
    expect(fetchMock.mock.calls[0][0].searchParams.get('query')).toBe(
      postal.roadAddress,
    );
    const [sql, ...parameters] = prisma.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toContain(
      'ST_Transform(ST_SetSRID(ST_MakePoint(?, ?), 4326), 5179)',
    );
    expect(parameters).toEqual([
      37.3957,
      127.1101,
      127.1101,
      37.3957,
      'office-id',
      'old-version',
    ]);
    expect(sql.join('?')).toContain('address_version = ?::uuid');
  });
  it('keeps the saved address when credentials are absent', async () => {
    const { prisma, fetchMock, service } = setup(false);
    await service.refresh('office-id');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.office.updateMany).toHaveBeenCalledWith({
      where: { id: 'office-id', addressVersion: 'old-version' },
      data: {
        geocodingStatus: 'unconfigured',
        geocodingError: 'missing_credentials',
      },
    });
  });
  it.each([
    ['ambiguous', [result, result]],
    ['unmatched', [{ ...result, roadAddress: '다른 주소' }]],
    ['invalid coordinates', [{ ...result, x: '0' }]],
  ])('does not guess coordinates for %s results', async (_, addresses) => {
    const { prisma, fetchMock, service } = setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'OK', addresses }),
    });
    await service.refresh('office-id');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.office.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ geocodingStatus: 'failed' }),
      }),
    );
  });
  it('handles a network timeout without failing address saving', async () => {
    const { prisma, fetchMock, service } = setup();
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(service.tryRefresh('office-id')).resolves.toBeUndefined();
    expect(prisma.office.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          geocodingStatus: 'failed',
          geocodingError: 'provider_unavailable',
        },
      }),
    );
  });
});
