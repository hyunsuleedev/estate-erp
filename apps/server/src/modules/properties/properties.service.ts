import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PropertySearchQuery {
  // 거래 유형
  transactionType?: string; // sale, jeonse, monthly
  // 사이트 유형
  siteType?: string; // apartment, officetel, villa, ...
  // 확인 상태
  checkStatus?: string; // unverified, verified, in_contract, hold, done
  // 가격 범위 (만원)
  priceMin?: number;
  priceMax?: number;
  // 보증금 범위 (만원)
  depositMin?: number;
  depositMax?: number;
  // 월세 범위 (만원)
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  // 면적 범위 (m²) - unit의 exclusiveAreaM2 기준
  areaMin?: number;
  areaMax?: number;
  // 지역 필터
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
  // 사이트 ID 필터
  siteId?: string;
  // 텍스트 검색 (사이트명, 메모)
  search?: string;
  // 숨김 포함 여부
  includeHidden?: boolean;
  // 정렬
  sortBy?: 'price' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  // 페이지네이션
  page?: number;
  limit?: number;
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: PropertySearchQuery = {}) {
    const where: Prisma.PropertyWhereInput = { officeId };

    // 숨김 필터
    if (!query.includeHidden) {
      where.isHidden = false;
    }

    // 거래 유형
    if (query.transactionType) {
      where.transactionType = query.transactionType;
    }

    // 확인 상태
    if (query.checkStatus) {
      where.checkStatus = query.checkStatus;
    }

    // 가격 범위
    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      where.price = {};
      if (query.priceMin !== undefined) where.price.gte = query.priceMin;
      if (query.priceMax !== undefined) where.price.lte = query.priceMax;
    }

    // 보증금 범위
    if (query.depositMin !== undefined || query.depositMax !== undefined) {
      where.deposit = {};
      if (query.depositMin !== undefined) where.deposit.gte = query.depositMin;
      if (query.depositMax !== undefined) where.deposit.lte = query.depositMax;
    }

    // 월세 범위
    if (query.monthlyRentMin !== undefined || query.monthlyRentMax !== undefined) {
      where.monthlyRent = {};
      if (query.monthlyRentMin !== undefined) where.monthlyRent.gte = query.monthlyRentMin;
      if (query.monthlyRentMax !== undefined) where.monthlyRent.lte = query.monthlyRentMax;
    }

    // 사이트 관련 필터 (유형, 지역, 사이트ID, 텍스트 검색)
    const siteFilter: Prisma.SiteWhereInput = {};
    let hasSiteFilter = false;

    if (query.siteType) {
      siteFilter.type = query.siteType;
      hasSiteFilter = true;
    }
    if (query.sido) {
      siteFilter.sido = query.sido;
      hasSiteFilter = true;
    }
    if (query.sigungu) {
      siteFilter.sigungu = query.sigungu;
      hasSiteFilter = true;
    }
    if (query.eupmyeondong) {
      siteFilter.eupmyeondong = query.eupmyeondong;
      hasSiteFilter = true;
    }
    if (query.siteId) {
      where.siteId = query.siteId;
    }
    if (query.search) {
      siteFilter.name = { contains: query.search, mode: 'insensitive' };
      hasSiteFilter = true;
      // 메모도 검색 (OR 조건)
      where.OR = [
        { site: { name: { contains: query.search, mode: 'insensitive' } } },
        { memo: { contains: query.search, mode: 'insensitive' } },
      ];
      hasSiteFilter = false; // OR에서 site 필터 처리
    }

    if (hasSiteFilter) {
      where.site = siteFilter;
    }

    // 면적 범위 - unit의 exclusiveAreaM2 기준
    if (query.areaMin !== undefined || query.areaMax !== undefined) {
      const unitFilter: Prisma.UnitWhereInput = { exclusiveAreaM2: {} };
      if (query.areaMin !== undefined) {
        (unitFilter.exclusiveAreaM2 as Prisma.DecimalNullableFilter).gte = query.areaMin;
      }
      if (query.areaMax !== undefined) {
        (unitFilter.exclusiveAreaM2 as Prisma.DecimalNullableFilter).lte = query.areaMax;
      }
      where.unit = unitFilter;
    }

    // 정렬
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const orderBy: Prisma.PropertyOrderByWithRelationInput = { [sortBy]: sortOrder };

    // 페이지네이션
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        include: {
          site: true,
          unit: true,
          propertyContacts: { include: { contact: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      items,
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
        site: true,
        unit: true,
        propertyContacts: { include: { contact: true } },
        matches: true,
        deals: true,
      },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async create(
    officeId: string,
    dto: {
      siteId: string;
      unitId?: string;
      transactionType: string;
      price?: number;
      deposit?: number;
      monthlyRent?: number;
      memo?: string;
      // 소유자 빠른등록 (옵션)
      ownerName?: string;
      ownerPhone?: string;
    },
  ) {
    const { ownerName, ownerPhone, ...propertyData } = dto;

    // 소유자 정보가 있으면 Contact + Ownership을 트랜잭션으로 함께 생성
    if (ownerName) {
      return this.prisma.$transaction(async (tx) => {
        const property = await tx.property.create({
          data: { officeId, ...propertyData },
        });

        // 기존 Contact 검색 (같은 사무소 내 동일 전화번호)
        let contact = ownerPhone
          ? await tx.contact.findFirst({ where: { officeId, phone: ownerPhone } })
          : null;

        if (!contact) {
          contact = await tx.contact.create({
            data: { officeId, name: ownerName, phone: ownerPhone },
          });
        }

        await tx.propertyContact.create({
          data: { officeId, contactId: contact.id, propertyId: property.id, role: 'owner', isPrimary: true },
        });

        return tx.property.findUnique({
          where: { id: property.id },
          include: { site: true, unit: true, propertyContacts: { include: { contact: true } } },
        });
      });
    }

    return this.prisma.property.create({
      data: { officeId, ...propertyData },
      include: { site: true, unit: true },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      transactionType?: string;
      price?: number;
      deposit?: number;
      monthlyRent?: number;
      checkStatus?: string;
      isHidden?: boolean;
      memo?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.property.update({
      where: { id },
      data: dto,
      include: { site: true, unit: true },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.property.delete({ where: { id } });
  }
}
