import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntakeLifecycleStatus, SiteType } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { buildPropertySearchWhere } from './property-search';
import { DEAL_SUMMARY_SELECT, presentDealSummary } from '../deals/deal-summary';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  NON_CLOSED_INTAKE_WHERE,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import { presentPropertyLease, propertyLeaseInclude } from '../tenants/tenants.service';

const VALID_SITE_TYPES: ReadonlySet<string> = new Set(Object.values(SiteType));
// 토지는 공간을 지정할 수 없다. 단독·다가구와 상가는 통건물 또는 개별 공간을 쓴다.
const UNIT_FORBIDDEN_SITE_TYPES: ReadonlySet<string> = new Set([SiteType.LAND]);
const UNIT_REQUIRED_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.APARTMENT,
  SiteType.OFFICETEL,
  SiteType.VILLA,
  SiteType.LIVING_ACCOMMODATION,
]);
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'createdAt',
  'updatedAt',
]);
const VALID_SORT_ORDERS: ReadonlySet<string> = new Set(['asc', 'desc']);

export interface PropertySearchQuery {
  withoutUnit?: boolean;
  siteType?: string;
  wardCode?: string;
  siteId?: string;
  unitId?: string;
  search?: string;
  hasListing?: boolean;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface PropertyCreateDto {
  siteId: string;
  unitId?: string | null;
  ownerName?: string;
  ownerPhone?: string;
}

interface PropertyUpdateDto {
  siteId?: string;
  unitId?: string | null;
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: PropertySearchQuery = {}) {
    if (query.siteType) {
      this.assertValidSiteType(query.siteType);
    }

    const filters: Prisma.PropertyWhereInput[] = [{ officeId }];

    if (query.siteId) {
      filters.push({ siteId: query.siteId });
    }

    if (query.unitId) {
      filters.push({ unitId: query.unitId });
    } else if (query.withoutUnit) {
      filters.push({ unitId: null });
    }

    if (query.siteType || query.wardCode) {
      filters.push({
        site: {
          ...(query.siteType && { type: query.siteType }),
          ...(query.wardCode && { wardCode: query.wardCode }),
        },
      });
    }

    if (query.hasListing) {
      filters.push({ listings: { some: {} } });
    }

    if (query.search) {
      const searchWhere = buildPropertySearchWhere(query.search);
      if (searchWhere) filters.push(searchWhere);
    }

    const where =
      filters.length === 1
        ? filters[0]
        : ({ AND: filters } as Prisma.PropertyWhereInput);
    const sortBy = this.resolveSortField(query.sortBy);
    const sortOrder = this.resolveSortOrder(query.sortOrder);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
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
          unit: {
            include: {
              dong: true,
              siteUnitType: true,
            },
          },
          propertyContacts: {
            include: {
              contact: { include: { phones: contactPhonesIncludeOrdered } },
            },
          },
          leases: {
            include: propertyLeaseInclude,
            orderBy: { createdAt: 'desc' },
          },
          listings: {
            where: { intake: NON_CLOSED_INTAKE_WHERE },
            orderBy: { createdAt: 'desc' },
            include: {
              intake: {
                select: {
                  ...LISTING_INTAKE_STATE_SELECT,
                  isJointBrokerageRequired: true,
                  jointBrokeragePartner: {
                    select: { id: true, name: true, phone: true },
                  },
                },
              },
              deals: OCCUPYING_DEALS_SELECT,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      items: items.map((property) => this.withContactPhones(property)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, officeId: string) {
    const property = await this.prisma.property.findFirst({
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
          },
        },
        unit: {
          include: {
            dong: true,
            siteUnitType: true,
          },
        },
        propertyContacts: {
          include: {
            contact: { include: { phones: contactPhonesIncludeOrdered } },
          },
        },
        leases: {
          include: propertyLeaseInclude,
          orderBy: { createdAt: 'desc' },
        },
        listings: {
          where: { intake: NON_CLOSED_INTAKE_WHERE },
          orderBy: { createdAt: 'desc' },
          include: {
            intake: {
              select: {
                ...LISTING_INTAKE_STATE_SELECT,
                isJointBrokerageRequired: true,
                jointBrokeragePartner: {
                  select: { id: true, name: true, phone: true },
                },
              },
            },
            deals: OCCUPYING_DEALS_SELECT,
            advertisements: {
              orderBy: { createdAt: 'desc' },
            },
            priceHistories: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        consultations: {
          include: {
            contact: { include: { phones: contactPhonesIncludeOrdered } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('매물을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    }

    // 끝난 의뢰의 거래 조건. 위 listings는 진행 중 의뢰의 것만 담아, 의뢰를 끝내면
    // 가격 변경·광고 기록이 상세의 기록에서 사라지고 아직 게재 중인 광고도 보이지 않았다.
    const pastListings = await this.prisma.listing.findMany({
      where: { propertyId: id, officeId, intake: { lifecycleStatus: IntakeLifecycleStatus.CLOSED } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        intake: {
          select: { id: true, lifecycleStatus: true, closedReason: true, lifecycleChangedAt: true },
        },
        advertisements: {
          orderBy: { createdAt: 'desc' },
        },
        priceHistories: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    // 이 집의 거래(지난 의뢰의 거래 조건에 걸렸던 것까지, 완료 · 취소 포함). 화면이 거래를 따로 요청하지 않게 싣는다.
    const deals = await this.prisma.deal.findMany({
      where: { officeId, listing: { propertyId: id } },
      select: DEAL_SUMMARY_SELECT,
      orderBy: { updatedAt: 'desc' },
    });

    return {
      ...this.withContactPhones(property),
      pastListings,
      deals: deals.map(presentDealSummary),
    };
  }

  /**
   * 그 자리(대지 + 공간)의 관리매물을 돌려주고, 없으면 만든다.
   * 광고를 넣는 agent가 쓴다: 광고를 낸 호실은 정의상 우리가 다루는 호실이므로 묻지 않고 만든다.
   * 의뢰나 가격 같은 업무 내용은 만들지 않는다 (매물 등록은 사용자에게 물은 뒤 따로 한다).
   */
  async ensure(officeId: string, dto: { siteId: string; unitId?: string | null }) {
    if (!dto.siteId) {
      throw new BadRequestException('단지를 골라 주세요.');
    }
    const lookup = () => this.prisma.property.findFirst({
      where: { officeId, siteId: dto.siteId, unitId: dto.unitId ?? null },
      select: { id: true, siteId: true, unitId: true },
    });
    const existing = await lookup();
    if (existing) return { ...existing, created: false };

    let property;
    try {
      property = await this.create(officeId, dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await lookup();
        if (concurrent) return { ...concurrent, created: false };
      }
      throw error;
    }
    if (!property) {
      throw new NotFoundException('매물을 만들지 못했습니다. 다시 시도해 주세요.');
    }
    return {
      id: property.id,
      siteId: property.siteId,
      unitId: property.unitId,
      created: true,
    };
  }

  async create(officeId: string, dto: PropertyCreateDto) {
    const site = await this.findAccessibleSite(dto.siteId, officeId);
    const unit = await this.resolveUnit(site.id, officeId, dto.unitId ?? null);

    this.assertValidSiteUnitChain(site.type, unit);

    const { ownerName, ownerPhone: rawOwnerPhone } = dto;
    const ownerPhone = rawOwnerPhone
      ? normalizePhone(rawOwnerPhone)
      : undefined;

    if (ownerName?.trim()) {
      return this.prisma.$transaction(async (tx) => {
        const property = await tx.property.create({
          data: {
            officeId,
            siteId: site.id,
            unitId: unit?.id ?? null,
          },
        });

        let contact = ownerPhone
          ? await tx.contact.findFirst({
              where: {
                officeId,
                phones: {
                  some: { phone: ownerPhone },
                },
              },
            })
          : null;

        if (!contact) {
          contact = await tx.contact.create({
            data: {
              officeId,
              name: ownerName.trim(),
              phones:
                ownerPhone && rawOwnerPhone
                  ? {
                      create: [
                        {
                          phone: ownerPhone,
                          label: 'mobile',
                          isPrimary: true,
                          office: { connect: { id: officeId } },
                        },
                      ],
                    }
                  : undefined,
            },
          });
        }

        await tx.propertyContact.create({
          data: {
            officeId,
            contactId: contact.id,
            propertyId: property.id,
            role: 'owner',
            isPrimary: true,
          },
        });

        return tx.property
          .findUnique({
            where: { id: property.id },
            include: {
              site: true,
              unit: {
                include: {
                  dong: true,
                  siteUnitType: true,
                },
              },
              propertyContacts: {
                include: {
                  contact: { include: { phones: contactPhonesIncludeOrdered } },
                },
              },
            },
          })
          .then((created) =>
            created ? this.withContactPhones(created) : created,
          );
      });
    }

    return this.prisma.property.create({
      data: {
        officeId,
        siteId: site.id,
        unitId: unit?.id ?? null,
      },
      include: {
        site: true,
        unit: {
          include: {
            dong: true,
            siteUnitType: true,
          },
        },
      },
    });
  }

  async update(id: string, officeId: string, dto: PropertyUpdateDto) {
    const existingProperty = await this.prisma.property.findFirst({
      where: { id, officeId },
      include: {
        site: true,
        unit: true,
      },
    });

    if (!existingProperty) {
      throw new NotFoundException('매물을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    }

    const nextSite = dto.siteId
      ? await this.findAccessibleSite(dto.siteId, officeId)
      : existingProperty.site;
    const nextUnitId =
      dto.unitId === undefined ? existingProperty.unitId : dto.unitId;
    const nextUnit = await this.resolveUnit(nextSite.id, officeId, nextUnitId);

    this.assertValidSiteUnitChain(nextSite.type, nextUnit);

    return this.prisma.property.update({
      where: { id },
      data: {
        siteId: nextSite.id,
        unitId: nextUnit?.id ?? null,
      },
      include: {
        site: true,
        unit: {
          include: {
            dong: true,
            siteUnitType: true,
          },
        },
      },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);

    return this.prisma.property.delete({ where: { id } });
  }

  private resolveSortField(sortBy?: string) {
    return VALID_SORT_FIELDS.has(sortBy || '') ? sortBy! : 'createdAt';
  }

  private resolveSortOrder(sortOrder?: string) {
    return VALID_SORT_ORDERS.has(sortOrder || '')
      ? (sortOrder as 'asc' | 'desc')
      : 'desc';
  }

  private withContactPhones<T>(property: T): T {
    const draft = property as Record<string, unknown>;
    const propertyContacts = draft.propertyContacts as
      | Array<{ contact?: { phones?: [] } | null }>
      | undefined;
    if (propertyContacts) {
      draft.propertyContacts = propertyContacts.map((propertyContact) => ({
        ...propertyContact,
        contact: propertyContact.contact
          ? withPrimaryPhone(propertyContact.contact)
          : propertyContact.contact,
      }));
    }
    const leases = draft.leases as Parameters<typeof presentPropertyLease>[0][] | undefined;
    if (leases) {
      const presented = leases.map((lease) => presentPropertyLease(lease));
      draft.leases = presented;
      draft.tenants = presented;
    }
    const consultations = draft.consultations as
      | Array<{ contact?: { phones?: [] } | null }>
      | undefined;
    if (consultations) {
      draft.consultations = consultations.map((consultation) => ({
        ...consultation,
        contact: consultation.contact
          ? withPrimaryPhone(consultation.contact)
          : consultation.contact,
      }));
    }
    return property;
  }

  private assertValidSiteType(siteType: string) {
    if (!VALID_SITE_TYPES.has(siteType as SiteType)) {
      throw new BadRequestException('알 수 없는 건물 유형입니다.');
    }
  }

  private assertValidSiteUnitChain(
    siteType: string,
    unit: { id: string } | null,
  ) {
    if (UNIT_REQUIRED_SITE_TYPES.has(siteType) && !unit) {
      throw new BadRequestException(
        '이 건물(아파트·오피스텔·빌라·생활숙박)은 호수를 골라야 합니다.',
      );
    }

    if (UNIT_FORBIDDEN_SITE_TYPES.has(siteType) && unit) {
      throw new BadRequestException(
        '토지에는 호수를 붙일 수 없습니다.',
      );
    }
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

  private async resolveUnit(
    siteId: string,
    officeId: string,
    unitId?: string | null,
  ) {
    if (!unitId) {
      return null;
    }

    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        siteId,
        OR: [{ officeId }, { officeId: null }],
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      select: {
        id: true,
      },
    });

    if (!unit) {
      throw new BadRequestException(
        '고른 호수가 이 단지의 호수가 아닙니다.',
      );
    }

    return unit;
  }
}
