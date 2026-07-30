import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 수집 대상(ExternalListingSource) 관리.
 *
 * 관리단지(OfficeSite)와 별개 축이다. 관리단지는 즐겨찾기일 뿐이고, 어떤 단지를
 * 외부 플랫폼에서 수집할지는 여기서 독립적으로 정한다. 관리단지가 아닌 단지도
 * 수집할 수 있고, 관리단지라고 자동으로 수집 대상이 되지도 않는다 — 연결은
 * importFromOfficeSites() 일괄 가져오기로만 이뤄진다.
 *
 * Site.naverComplexCode는 가져오기의 기본값 제안으로만 쓰고, 등록 이후에는 이
 * 테이블이 단독 소유한다. import가 Site 컬럼을 갱신해도 기존 행은 건드리지 않는다.
 */

const VALID_PROVIDERS = new Set(['naver']);

const VALID_SITE_TYPES = new Set([
  'apartment',
  'officetel',
  'villa',
  'house',
  'commercial',
  'land',
  'living_accommodation',
]);

const DEFAULT_PROVIDER = 'naver';

export interface CreateSourceDto {
  siteId: string;
  provider?: string;
  externalCode: string;
  /** 생략 시 Site.type을 복사한다. */
  type?: string;
  isEnabled?: boolean;
}

export interface UpdateSourceDto {
  externalCode?: string;
  type?: string;
  isEnabled?: boolean;
}

export interface FindSourcesQuery {
  provider?: string;
  isEnabled?: boolean;
}

export interface ImportFromOfficeSitesDto {
  provider?: string;
  /** 생략 시 관리단지 전체를 대상으로 한다. */
  siteIds?: string[];
}

/** 코드가 없어 등록하지 못한 관리단지 — UI에서 "코드 없음" 배지로 노출된다. */
export interface ImportSkippedSite {
  siteId: string;
  siteName: string;
  reason: 'no_external_code';
}

export interface ImportResult {
  imported: number;
  alreadyRegistered: number;
  skipped: ImportSkippedSite[];
}

const siteInclude = {
  site: {
    select: {
      id: true,
      name: true,
      type: true,
      roadAddress: true,
      jibunAddress: true,
      naverComplexCode: true,
    },
  },
} as const;

@Injectable()
export class ExternalListingSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: FindSourcesQuery = {}) {
    return this.prisma.externalListingSource.findMany({
      where: {
        officeId,
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.isEnabled === undefined
          ? {}
          : { isEnabled: query.isEnabled }),
      },
      include: siteInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const source = await this.prisma.externalListingSource.findFirst({
      where: { id, officeId },
      include: siteInclude,
    });

    if (!source) {
      throw new NotFoundException('ExternalListingSource not found');
    }

    return source;
  }

  async create(officeId: string, dto: CreateSourceDto) {
    const provider = this.normalizeProvider(dto.provider);
    const externalCode = this.normalizeExternalCode(dto.externalCode);
    const site = await this.findAccessibleSite(dto.siteId, officeId);
    const type = this.normalizeType(dto.type ?? site.type);

    // 사전 조회 후 create는 동시 요청에서 unique 제약을 그대로 터뜨린다.
    // P2002를 잡아 도메인 예외로 변환한다 (cti/listings와 동일 패턴).
    try {
      return await this.prisma.externalListingSource.create({
        data: {
          officeId,
          siteId: dto.siteId,
          provider,
          externalCode,
          type,
          isEnabled: dto.isEnabled ?? true,
        },
        include: siteInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          '이미 이 단지의 수집 대상이 등록되어 있습니다.',
        );
      }
      throw error;
    }
  }

  async update(id: string, officeId: string, dto: UpdateSourceDto) {
    const source = await this.findOne(id, officeId);

    return this.prisma.externalListingSource.update({
      where: { id: source.id },
      data: {
        ...(dto.externalCode === undefined
          ? {}
          : { externalCode: this.normalizeExternalCode(dto.externalCode) }),
        ...(dto.type === undefined
          ? {}
          : { type: this.normalizeType(dto.type) }),
        ...(dto.isEnabled === undefined ? {} : { isEnabled: dto.isEnabled }),
      },
      include: siteInclude,
    });
  }

  async remove(id: string, officeId: string) {
    const source = await this.findOne(id, officeId);

    await this.prisma.externalListingSource.delete({
      where: { id: source.id },
    });

    return { id: source.id };
  }

  /**
   * 관리단지 → 수집 대상 일괄 가져오기.
   *
   * Site.naverComplexCode가 있으면 사람 확인 없이 자동 등록하고, 없으면 등록하지
   * 않고 skipped로 리포트한다. 코드 없는 단지는 개별 resolve(네이버 검색 →
   * complexNo 확정)를 거쳐야 하므로 여기서 추측하지 않는다.
   *
   * 이미 등록된 단지는 건드리지 않는다 — 사무소가 직접 고친 externalCode를
   * Site 컬럼 값으로 되돌리면 안 되기 때문이다.
   */
  async importFromOfficeSites(
    officeId: string,
    dto: ImportFromOfficeSitesDto = {},
  ): Promise<ImportResult> {
    const provider = this.normalizeProvider(dto.provider);

    if (dto.siteIds && dto.siteIds.length === 0) {
      throw new BadRequestException('siteIds가 비어 있습니다.');
    }

    // 조회 → 필터 → 생성을 한 트랜잭션으로 묶는다. 나눠 실행하면 동시 import 사이에
    // alreadyRegistered가 낡아 createMany가 조용히 중복을 건너뛰고, 그 결과 리포트가
    // 실제 쓰기와 어긋난다.
    return this.prisma.$transaction(async (tx) => {
      const officeSites = await tx.officeSite.findMany({
        where: {
          officeId,
          ...(dto.siteIds ? { siteId: { in: dto.siteIds } } : {}),
        },
        include: {
          site: {
            select: {
              id: true,
              name: true,
              type: true,
              naverComplexCode: true,
            },
          },
        },
      });

      if (dto.siteIds && officeSites.length !== dto.siteIds.length) {
        const found = new Set(officeSites.map((os) => os.siteId));
        const missing = dto.siteIds.filter((id) => !found.has(id));
        throw new NotFoundException(
          `관리단지에 없는 단지입니다: ${missing.join(', ')}`,
        );
      }

      const existing = await tx.externalListingSource.findMany({
        where: {
          officeId,
          provider,
          siteId: { in: officeSites.map((os) => os.siteId) },
        },
        select: { siteId: true },
      });
      const alreadyRegistered = new Set(existing.map((s) => s.siteId));

      const skipped: ImportSkippedSite[] = [];
      const toCreate: {
        officeId: string;
        siteId: string;
        provider: string;
        externalCode: string;
        type: string;
      }[] = [];

      for (const officeSite of officeSites) {
        const { site } = officeSite;
        if (alreadyRegistered.has(site.id)) continue;

        const externalCode = this.resolveExternalCodeFromSite(provider, site);
        if (!externalCode) {
          skipped.push({
            siteId: site.id,
            siteName: site.name,
            reason: 'no_external_code',
          });
          continue;
        }

        toCreate.push({
          officeId,
          siteId: site.id,
          provider,
          externalCode,
          type: this.normalizeType(site.type),
        });
      }

      // skipDuplicates가 삼킨 행까지 imported로 세지 않도록 실제 생성 건수를 쓴다.
      let imported = 0;
      if (toCreate.length > 0) {
        const created = await tx.externalListingSource.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        imported = created.count;
      }

      // 동시 import가 먼저 커밋하면 skipDuplicates가 일부를 삼킨다. 그 행은 이미
      // 등록된 것이므로 alreadyRegistered로 옮겨, imported + alreadyRegistered +
      // skipped가 항상 입력 단지 수와 일치하게 한다. (호출자가 "보고되지 않은 단지"를
      // 미등록으로 오해하지 않도록.)
      const raced = toCreate.length - imported;

      return {
        imported,
        alreadyRegistered: alreadyRegistered.size + raced,
        skipped,
      };
    });
  }

  /** 수집기가 스냅샷을 시작하기 직전 호출. 성공한 수집만 기록한다. */
  async markCollected(id: string, officeId: string) {
    const source = await this.findOne(id, officeId);

    return this.prisma.externalListingSource.update({
      where: { id: source.id },
      data: { lastCollectedAt: new Date() },
      include: siteInclude,
    });
  }

  private resolveExternalCodeFromSite(
    provider: string,
    site: { naverComplexCode: string | null },
  ): string | null {
    if (provider === 'naver') {
      return site.naverComplexCode?.trim() || null;
    }
    return null;
  }

  private normalizeProvider(provider?: string): string {
    const value = (provider ?? DEFAULT_PROVIDER).trim();
    if (!VALID_PROVIDERS.has(value)) {
      throw new BadRequestException(`지원하지 않는 provider입니다: ${value}`);
    }
    return value;
  }

  private normalizeExternalCode(externalCode: string): string {
    const value = externalCode?.trim();
    if (!value) {
      throw new BadRequestException('externalCode는 필수입니다.');
    }
    return value;
  }

  private normalizeType(type: string): string {
    const value = type?.trim();
    if (!value || !VALID_SITE_TYPES.has(value)) {
      throw new BadRequestException(`지원하지 않는 단지 타입입니다: ${type}`);
    }
    return value;
  }

  private async findAccessibleSite(id: string, officeId: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        id,
        OR: [{ officeId }, { isPublic: true }],
      },
    });

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    return site;
  }
}
