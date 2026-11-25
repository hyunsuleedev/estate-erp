import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterPrivateSiteDto } from './dto/register-private-site.dto';
import { createPrivateSiteRecord } from '../sites/private-site';

@Injectable()
export class OfficeSitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.officeSite.findMany({
      where: { officeId },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
            _count: {
              select: {
                // placeholder Dong(단일동 건물의 가짜 동)은 동 수에서 제외 — UI 규칙과 일치
                dongs: { where: { isPlaceholder: false } },
                units: true,
                properties: { where: { officeId } },
              },
            },
          },
        },
      },
      orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const officeSite = await this.prisma.officeSite.findFirst({
      where: { id, officeId },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
            _count: { select: { dongs: true, units: true, properties: { where: { officeId } } } },
          },
        },
      },
    });

    if (!officeSite) {
      throw new NotFoundException('관리단지를 찾을 수 없습니다. 이미 목록에서 뺐을 수 있습니다.');
    }

    return officeSite;
  }

  async add(
    officeId: string,
    dto: { siteId: string; memo?: string; isFavorite?: boolean },
  ) {
    await this.findAccessibleSite(dto.siteId, officeId);

    return this.prisma.officeSite.upsert({
      where: {
        officeId_siteId: {
          officeId,
          siteId: dto.siteId,
        },
      },
      update: {
        memo: dto.memo,
        isFavorite: dto.isFavorite,
      },
      // 받는 칸만 골라 넣는다. 본문을 펼치면 본문의 officeId가 앞의 값을 덮어
      // 다른 사무소의 관리단지 목록에 줄이 생겼다(2026-11-22 검토)
      create: {
        officeId,
        siteId: dto.siteId,
        memo: dto.memo,
        isFavorite: dto.isFavorite,
      },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * 검색되지 않는 단지를 사무소가 직접 등록하고 관리단지에 바로 추가한다.
   *
   * 직접 등록한 단지는 항상 등록한 사무소만 보는 비공개 단지다. 공개 여부는 입력받지 않고
   * 여기서 고정하며, DB도 사무소 소유 단지의 공개를 CHECK 제약으로 막는다.
   */
  async registerPrivateSite(officeId: string, dto: RegisterPrivateSiteDto) {
    const ward = await this.prisma.ward.findUnique({
      where: { code: dto.wardCode },
      select: { code: true },
    });
    if (!ward) {
      throw new BadRequestException('주소의 법정동을 찾지 못했습니다. 다른 주소를 선택해주세요');
    }

    return this.prisma.$transaction(async (tx) => {
      // 동시에 들어온 같은 등록이 서로의 중복 확인을 지나치지 않도록 사무소·동네·이름 단위로 줄을 세운다.
      // 기존 데이터에 중복이 있을 수 있어 유니크 인덱스 대신 잠금을 쓴다 (부팅 시 마이그레이션 실패 방지)
      const lockKey = `office-site-register:${officeId}:${dto.wardCode}:${dto.name}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;

      const duplicate = await tx.site.findFirst({
        where: {
          name: dto.name,
          wardCode: dto.wardCode,
          OR: [{ isPublic: true }, { officeId }],
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          '같은 동네에 같은 이름의 단지가 이미 있습니다. 검색에서 찾아 추가해주세요',
        );
      }

      // 단지 + 동 구분 없는 동(필요할 때) — POST /sites와 같은 함수로 만든다
      const site = await createPrivateSiteRecord(tx, officeId, {
        type: dto.type,
        name: dto.name,
        wardCode: dto.wardCode,
        roadAddress: dto.roadAddress,
        jibunAddress: dto.jibunAddress,
        zipCode: dto.zipCode,
        builtYear: dto.builtYear,
        totalUnits: dto.totalUnits,
        totalDongs: dto.totalDongs,
      });

      return tx.officeSite.create({
        data: { officeId, siteId: site.id },
        include: {
          site: {
            include: {
              ward: {
                include: {
                  district: {
                    include: {
                      province: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: { memo?: string | null; isFavorite?: boolean },
  ) {
    const officeSite = await this.findOne(id, officeId);

    return this.prisma.officeSite.update({
      where: { id: officeSite.id },
      // 메모·고정만 바꾼다. 본문을 그대로 넣으면 officeId·siteId까지 바꿀 수 있었다
      data: { memo: dto.memo, isFavorite: dto.isFavorite },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async remove(id: string, officeId: string) {
    const officeSite = await this.findOne(id, officeId);

    return this.prisma.officeSite.delete({ where: { id: officeSite.id } });
  }

  async searchCentralSites(query: string, officeId: string) {
    // "고덕 그라시움", "강동구 고덕동"처럼 띄어 써도 찾도록 모든 단어가 어딘가에 맞는 단지를 찾는다
    const searchTerms = query.trim().split(/\s+/).filter(Boolean);

    if (searchTerms.length === 0) {
      throw new BadRequestException('검색어를 입력해 주세요.');
    }

    return this.prisma.site.findMany({
      where: {
        // 공공 단지와 우리 사무소의 비공개 단지만 — 다른 사무소의 비공개 단지는 보이지 않는다
        OR: [{ isPublic: true }, { officeId }],
        AND: searchTerms.map((searchTerm) => ({
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' as const } },
            { roadAddress: { contains: searchTerm, mode: 'insensitive' as const } },
            { jibunAddress: { contains: searchTerm, mode: 'insensitive' as const } },
            { ward: { name: { contains: searchTerm, mode: 'insensitive' as const } } },
            {
              ward: {
                district: {
                  name: { contains: searchTerm, mode: 'insensitive' as const },
                },
              },
            },
          ],
        })),
      },
      include: {
        ward: {
          include: {
            district: {
              include: {
                province: true,
              },
            },
          },
        },
        _count: { select: { dongs: true, units: true } },
      },
      take: 20,
      orderBy: { name: 'asc' },
    });
  }

  private async findAccessibleSite(id: string, officeId: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        id,
        OR: [{ officeId }, { isPublic: true }],
      },
    });

    if (!site) {
      throw new NotFoundException('단지를 찾을 수 없습니다.');
    }

    return site;
  }
}
