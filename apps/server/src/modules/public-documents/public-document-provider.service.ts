import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toGovernmentAddressParams } from './public-document-address.util';
import {
  DOCUMENT_TITLES,
  type DocumentAddress,
  type DocumentQuoteItem,
  type ProviderExecutionResult,
  type ProviderOption,
  type PublicDocumentRequestMode,
  type PublicDocumentType,
} from './public-document.types';

const BUILDING_HUB_URL =
  'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';
const VWORLD_LAND_URL = 'https://api.vworld.kr/ned/data/ladfrlList';
const VWORLD_LAND_USE_URL =
  'https://api.vworld.kr/ned/data/getLandUseAttr';
const VWORLD_DATA_URL = 'https://api.vworld.kr/req/data';

@Injectable()
export class PublicDocumentProviderService {
  constructor(private readonly config: ConfigService) {}

  getProviders(): ProviderOption[] {
    const publicDataConfigured = Boolean(
      this.config.get<string>('PUBLIC_DATA_SERVICE_KEY'),
    );
    const vworldConfigured = Boolean(this.config.get<string>('VWORLD_API_KEY'));
    const selectedRegistry = this.registryProvider;

    return [
      {
        id: 'building_hub',
        label: '국토교통부 건축물대장정보 서비스',
        kind: 'public_api',
        configured: publicDataConfigured,
        supportedTypes: ['building_ledger'],
        description: '공공데이터포털의 건축물대장 표제부 구조화 데이터',
        homepage: 'https://www.data.go.kr/data/15134735/openapi.do',
      },
      {
        id: 'vworld',
        label: 'VWorld 국가공간정보',
        kind: 'public_api',
        configured: vworldConfigured,
        supportedTypes: ['land_ledger', 'cadastral_map', 'land_use_plan'],
        description: 'PNU 기반 토지특성·토지이용·연속지적도 구조화 데이터',
        homepage: 'https://www.vworld.kr/dev/v4dv_2ddataguide2_s001.do',
      },
      ...[
        ['tilko', '틸코'],
        ['hyphen', '하이픈'],
        ['codef', 'CODEF'],
        ['coocon', '쿠콘'],
      ].map(([id, label]) => ({
        id,
        label,
        kind: 'registry_vendor' as const,
        configured: selectedRegistry === id,
        supportedTypes: ['registry'] as PublicDocumentType[],
        description:
          selectedRegistry === id
            ? '선택된 등기 공급자입니다. 계약 후 공급자 전용 커넥터를 활성화해야 합니다.'
            : '등기사항증명서 열람·발급 공급자 후보',
      })),
      {
        id: 'manual_upload',
        label: '수동 문서 연결',
        kind: 'manual',
        configured: true,
        supportedTypes: ['registry', 'land_register'],
        description: '인터넷등기소 등에서 발급한 파일의 보관 URL을 연결',
      },
    ];
  }

  quote(
    types: PublicDocumentType[],
    registryMode: 'view' | 'certificate' = 'view',
  ): DocumentQuoteItem[] {
    const publicDataConfigured = Boolean(
      this.config.get<string>('PUBLIC_DATA_SERVICE_KEY'),
    );
    const vworldConfigured = Boolean(this.config.get<string>('VWORLD_API_KEY'));

    return types.map((type) => {
      if (type === 'registry') {
        return {
          type,
          title: DOCUMENT_TITLES[type],
          requestMode: registryMode,
          provider: 'manual_upload',
          providerLabel: '수동 문서 연결',
          cost: registryMode === 'certificate' ? 1_000 : 700,
          available: true,
          reason:
            this.registryProvider === 'manual'
              ? '자동 발급 공급자 계약 전에는 발급 파일을 직접 연결합니다.'
              : `${this.registryProvider.toUpperCase()} 커넥터 활성화 전까지 수동 연결로 처리합니다.`,
          output: 'manual_upload',
        };
      }

      if (type === 'building_ledger') {
        return this.publicApiQuote(
          type,
          'building_hub',
          '국토교통부 건축물대장정보',
          publicDataConfigured,
          'PUBLIC_DATA_SERVICE_KEY를 서버에 설정해야 합니다.',
        );
      }

      if (
        type === 'land_ledger' ||
        type === 'cadastral_map' ||
        type === 'land_use_plan'
      ) {
        return this.publicApiQuote(
          type,
          'vworld',
          'VWorld 국가공간정보',
          vworldConfigured,
          'VWORLD_API_KEY를 서버에 설정해야 합니다.',
        );
      }

      return {
        type,
        title: DOCUMENT_TITLES[type],
        requestMode: 'upload',
        provider: 'manual_upload',
        providerLabel: '수동 문서 연결',
        cost: 0,
        available: true,
        reason: '현재 공개 API가 없어 발급 파일을 직접 연결합니다.',
        output: 'manual_upload',
      };
    });
  }

  async execute(
    type: PublicDocumentType,
    requestMode: PublicDocumentRequestMode,
    address: DocumentAddress,
  ): Promise<ProviderExecutionResult> {
    if (type === 'registry' || type === 'land_register') {
      return {
        status: 'awaiting_upload',
        provider: 'manual_upload',
        metadata: {
          output: 'manual_upload',
          requestMode,
          address: this.publicAddress(address),
          selectedRegistryProvider: this.registryProvider,
        },
      };
    }

    const params = toGovernmentAddressParams(address);

    if (type === 'building_ledger') {
      const serviceKey = this.requiredKey('PUBLIC_DATA_SERVICE_KEY');
      const data = await this.fetchJson(
        BUILDING_HUB_URL,
        {
          serviceKey: this.decodeKey(serviceKey),
          sigunguCd: params.sigunguCd,
          bjdongCd: params.bjdongCd,
          platGbCd: params.platGbCd,
          bun: params.bun,
          ji: params.ji,
          numOfRows: '100',
          pageNo: '1',
          _type: 'json',
        },
        '건축물대장 조회에 실패했습니다.',
      );
      return this.completed('building_hub', address, params.pnu, data);
    }

    const vworldKey = this.requiredKey('VWORLD_API_KEY');
    const domain =
      this.config.get<string>('VWORLD_API_DOMAIN') ?? 'http://localhost:5173';

    if (type === 'land_ledger') {
      const data = await this.fetchJson(
        VWORLD_LAND_URL,
        { key: vworldKey, domain, pnu: params.pnu, format: 'json' },
        '토지·임야대장 조회에 실패했습니다.',
      );
      return this.completed('vworld', address, params.pnu, data);
    }

    if (type === 'land_use_plan') {
      const data = await this.fetchJson(
        VWORLD_LAND_USE_URL,
        {
          key: vworldKey,
          domain,
          pnu: params.pnu,
          format: 'json',
          numOfRows: '1000',
          pageNo: '1',
        },
        '토지이용계획 조회에 실패했습니다.',
      );
      return this.completed('vworld', address, params.pnu, data);
    }

    const data = await this.fetchJson(
      VWORLD_DATA_URL,
      {
        service: 'data',
        version: '2.0',
        request: 'GetFeature',
        key: vworldKey,
        domain,
        format: 'json',
        size: '10',
        page: '1',
        geometry: 'true',
        attribute: 'true',
        crs: 'EPSG:4326',
        data: 'LP_PA_CBND_BUBUN',
        attrFilter: `pnu:=:${params.pnu}`,
      },
      '연속지적도 조회에 실패했습니다.',
    );
    return this.completed('vworld', address, params.pnu, data);
  }

  private publicApiQuote(
    type: PublicDocumentType,
    provider: string,
    providerLabel: string,
    configured: boolean,
    reason: string,
  ): DocumentQuoteItem {
    return {
      type,
      title: DOCUMENT_TITLES[type],
      requestMode: 'data',
      provider,
      providerLabel,
      cost: 0,
      available: configured,
      reason: configured ? undefined : reason,
      output: 'structured_data',
    };
  }

  private completed(
    provider: string,
    address: DocumentAddress,
    pnu: string,
    data: unknown,
  ): ProviderExecutionResult {
    return {
      status: 'completed',
      provider,
      mimeType: 'application/json',
      metadata: {
        output: 'structured_data',
        pnu,
        address: this.publicAddress(address),
        fetchedAt: new Date().toISOString(),
        data,
      },
    };
  }

  private async fetchJson(
    endpoint: string,
    params: Record<string, string>,
    failureMessage: string,
  ): Promise<unknown> {
    const url = new URL(endpoint);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok || text.trim().startsWith('<')) {
        throw new Error('provider response was not JSON');
      }
      const result: unknown = JSON.parse(text);
      if (this.hasProviderError(result)) {
        throw new Error('provider returned an error');
      }
      return result;
    } catch {
      // URL에는 인증키가 포함되므로 원본 오류/URL을 로그나 API 응답으로 노출하지 않는다.
      throw new BadGatewayException(failureMessage);
    }
  }

  private hasProviderError(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const serialized = JSON.stringify(value).toLowerCase();
    return (
      serialized.includes('service key is not registered') ||
      serialized.includes('invalid_request') ||
      serialized.includes('authentication failed')
    );
  }

  private requiredKey(name: 'PUBLIC_DATA_SERVICE_KEY' | 'VWORLD_API_KEY') {
    const key = this.config.get<string>(name);
    if (!key) {
      throw new BadGatewayException(`${name}가 설정되지 않았습니다.`);
    }
    return key;
  }

  private decodeKey(key: string) {
    try {
      return decodeURIComponent(key);
    } catch {
      return key;
    }
  }

  private publicAddress(address: DocumentAddress) {
    return {
      siteId: address.siteId,
      siteName: address.siteName,
      roadAddress: address.roadAddress,
      jibunAddress: address.jibunAddress,
      dongName: address.dongName,
      unitName: address.unitName,
    };
  }

  private get registryProvider() {
    return (
      this.config.get<string>('REGISTRY_PROVIDER')?.toLowerCase() ?? 'manual'
    );
  }
}
