import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

const provinceNames: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  강원도: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전라북도: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
  제주도: '제주특별자치도',
};
function comparableAddress(value: string) {
  const words = value.trim().split(/\s+/);
  words[0] = provinceNames[words[0]] ?? words[0];
  return words.join('').replace(/,/g, '');
}
type GeocodingResponse = {
  status?: string;
  addresses?: Array<{
    roadAddress?: string;
    jibunAddress?: string;
    x?: string;
    y?: string;
  }>;
};

@Injectable()
export class OfficeGeocodingService {
  private readonly logger = new Logger(OfficeGeocodingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Runs after the address transaction commits. Failure never rolls back the saved address. */
  async refresh(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
    });
    if (!office?.addressVersion || !(office.roadAddress || office.jibunAddress))
      return;
    const version = office.addressVersion;
    const keyId = this.config.get<string>('NAVER_MAPS_CLIENT_ID');
    const key = this.config.get<string>('NAVER_MAPS_CLIENT_SECRET');
    const where = { id: officeId, addressVersion: version };
    if (!keyId || !key) {
      await this.prisma.office.updateMany({
        where,
        data: {
          geocodingStatus: 'unconfigured',
          geocodingError: 'missing_credentials',
        },
      });
      return;
    }

    try {
      await this.prisma.office.updateMany({
        where,
        data: { geocodingStatus: 'pending', geocodingError: null },
      });
      const base = office.roadAddress || office.jibunAddress!;
      const url = new URL(
        'https://maps.apigw.ntruss.com/map-geocode/v2/geocode',
      );
      url.searchParams.set('query', base);
      const response = await fetch(url, {
        headers: {
          'x-ncp-apigw-api-key-id': keyId,
          'x-ncp-apigw-api-key': key,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('provider_unavailable');
      const body = (await response.json()) as GeocodingResponse;
      if (body.status !== 'OK' || !Array.isArray(body.addresses))
        throw new Error('provider_unavailable');
      // Do not silently assign the first fuzzy result or an ambiguous building.
      const matching = body.addresses.filter((result) =>
        [result.roadAddress, result.jibunAddress].some(
          (value) =>
            value && comparableAddress(value) === comparableAddress(base),
        ),
      );
      if (matching.length !== 1) throw new Error('address_not_resolved');
      const { x, y } = matching[0];
      const lng = Number(x),
        lat = Number(y);
      if (
        !x ||
        !y ||
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < 124 ||
        lng > 132 ||
        lat < 33 ||
        lat > 39
      ) {
        throw new Error('invalid_coordinates');
      }
      // Version predicate prevents an earlier request overwriting a newer address or cleared location.
      await this.prisma.$executeRaw`
        UPDATE offices SET lat = ${lat}, lng = ${lng},
          location = ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5179),
          geocoding_status = 'ready', geocoding_error = NULL, geocoded_at = NOW()
        WHERE id = ${officeId}::uuid AND address_version = ${version}::uuid
      `;
    } catch (error) {
      const reason =
        error instanceof Error &&
        ['address_not_resolved', 'invalid_coordinates'].includes(error.message)
          ? error.message
          : 'provider_unavailable';
      await this.prisma.office.updateMany({
        where,
        data: { geocodingStatus: 'failed', geocodingError: reason },
      });
    }
  }

  async tryRefresh(officeId: string) {
    try {
      await this.refresh(officeId);
    } catch {
      this.logger.warn(
        'Office coordinate update failed; saved address was preserved.',
      );
    }
  }
}
