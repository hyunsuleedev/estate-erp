import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../contacts/contact-phone.utils';
import {
  CreateServiceVendorDto,
  CreateVendorContactDto,
  ServiceVendorFilter,
  UpdateServiceVendorDto,
  UpdateVendorContactDto,
  UpsertFavoriteDto,
} from './dto/service-vendor.dto';

/**
 * 협력업체 서비스.
 *
 * 가시성 규칙:
 *  - 공용 풀 (officeId = NULL) → 모든 사무소가 조회 가능.
 *  - 사무소 개인 업체 (officeId = UUID) → 해당 사무소만 조회 가능.
 *
 * 쓰기 권한:
 *  - 공용 업체의 생성/수정/삭제: User.isPlatformAdmin = true 만.
 *  - 개인 업체의 생성/수정/삭제: 해당 사무소의 사용자 (owner/manager/agent).
 */
@Injectable()
export class ServiceVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 내부 헬퍼 ──────────────────────────────────────────

  private async assertPlatformAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    });
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('플랫폼 운영자만 공용 업체를 관리할 수 있습니다.');
    }
  }

  // ─── Vendor CRUD ──────────────────────────────────────

  async findAll(officeId: string, filter: ServiceVendorFilter = {}) {
    const scope = filter.scope ?? 'all';

    // 가시성 조건: 공용(officeId null) + 내 사무소 개인
    const visibilityClauses: Prisma.ServiceVendorWhereInput[] = [];
    if (scope === 'all' || scope === 'public') {
      visibilityClauses.push({ officeId: null });
    }
    if (scope === 'all' || scope === 'private') {
      visibilityClauses.push({ officeId });
    }

    const where: Prisma.ServiceVendorWhereInput = {
      isActive: true,
      OR: visibilityClauses,
    };

    if (filter.category) {
      where.serviceCategories = { has: filter.category };
    }
    if (filter.district) {
      where.coverageDistricts = { has: filter.district };
    }
    if (filter.search) {
      const s = filter.search.trim();
      if (s) {
        where.AND = [
          {
            OR: [
              { name: { contains: s, mode: 'insensitive' } },
              { description: { contains: s, mode: 'insensitive' } },
              { priceNote: { contains: s, mode: 'insensitive' } },
              { memo: { contains: s, mode: 'insensitive' } },
            ],
          },
        ];
      }
    }

    const vendors = await this.prisma.serviceVendor.findMany({
      where,
      include: {
        vendorContacts: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        favorites: {
          where: { officeId },
          select: { id: true, memo: true },
        },
      },
    });

    // 클라이언트 응답 구조: isFavorite + favoriteMemo 필드를 평탄화
    const enriched = vendors.map((v) => {
      const fav = v.favorites[0] ?? null;
      const { favorites, ...rest } = v;
      void favorites;
      return {
        ...rest,
        isFavorite: !!fav,
        favoriteMemo: fav?.memo ?? null,
      };
    });

    // 즐겨찾기 필터 (해석 2: 즐겨찾기만 보기)
    const filtered = filter.favoritesOnly
      ? enriched.filter((v) => v.isFavorite)
      : enriched;

    // 정렬:
    //   1. 내 사무소 개인 업체 (officeId = myOffice)
    //   2. 공용 풀 광고 tier (premium → basic → none)
    //   3. 같은 tier 내 adPriority DESC
    //   4. name
    filtered.sort((a, b) => {
      const aMine = a.officeId === officeId ? 0 : 1;
      const bMine = b.officeId === officeId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;

      const tierRank = (t: string) =>
        t === 'premium' ? 0 : t === 'basic' ? 1 : 2;
      const aTier = tierRank(a.adTier);
      const bTier = tierRank(b.adTier);
      if (aTier !== bTier) return aTier - bTier;

      if (a.adPriority !== b.adPriority) return b.adPriority - a.adPriority;

      return a.name.localeCompare(b.name, 'ko');
    });

    return filtered;
  }

  async findOne(id: string, officeId: string) {
    const vendor = await this.prisma.serviceVendor.findUnique({
      where: { id },
      include: {
        vendorContacts: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        favorites: {
          where: { officeId },
          select: { id: true, memo: true },
        },
      },
    });
    if (!vendor) throw new NotFoundException('업체를 찾을 수 없습니다.');
    // 가시성 체크
    if (vendor.officeId !== null && vendor.officeId !== officeId) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }
    const fav = vendor.favorites[0] ?? null;
    const { favorites, ...rest } = vendor;
    void favorites;
    return {
      ...rest,
      isFavorite: !!fav,
      favoriteMemo: fav?.memo ?? null,
    };
  }

  async create(
    userId: string,
    officeId: string,
    dto: CreateServiceVendorDto,
  ) {
    const isPublic = !!dto.isPublic;

    if (isPublic) {
      await this.assertPlatformAdmin(userId);
    }

    return this.prisma.serviceVendor.create({
      data: {
        officeId: isPublic ? null : officeId,
        name: dto.name,
        businessType: dto.businessType ?? null,
        serviceCategories: dto.serviceCategories,
        coverageDistricts: dto.coverageDistricts,
        priceNote: dto.priceNote ?? null,
        description: dto.description ?? null,
        memo: dto.memo ?? null,
        tags: dto.tags ?? [],
        // 공용 업체만 광고/검증 필드 의미 있음. 개인 업체는 기본값 고정.
        adTier: isPublic ? dto.adTier ?? 'none' : 'none',
        adStartDate:
          isPublic && dto.adStartDate ? new Date(dto.adStartDate) : null,
        adEndDate: isPublic && dto.adEndDate ? new Date(dto.adEndDate) : null,
        adPriority: isPublic ? dto.adPriority ?? 0 : 0,
        isVerified: isPublic ? dto.isVerified ?? false : false,
        verifiedAt:
          isPublic && dto.isVerified ? new Date() : null,
      },
      include: {
        vendorContacts: true,
      },
    });
  }

  async update(
    id: string,
    userId: string,
    officeId: string,
    dto: UpdateServiceVendorDto,
  ) {
    const existing = await this.prisma.serviceVendor.findUnique({
      where: { id },
      select: { officeId: true, isVerified: true },
    });
    if (!existing) throw new NotFoundException('업체를 찾을 수 없습니다.');

    const isPublic = existing.officeId === null;
    if (isPublic) {
      await this.assertPlatformAdmin(userId);
    } else if (existing.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 수정할 수 없습니다.');
    }

    const data: Prisma.ServiceVendorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.businessType !== undefined) data.businessType = dto.businessType;
    if (dto.serviceCategories !== undefined)
      data.serviceCategories = dto.serviceCategories;
    if (dto.coverageDistricts !== undefined)
      data.coverageDistricts = dto.coverageDistricts;
    if (dto.priceNote !== undefined) data.priceNote = dto.priceNote;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    // 공용 업체만 광고/검증 필드 허용
    if (isPublic) {
      if (dto.adTier !== undefined) data.adTier = dto.adTier;
      if (dto.adStartDate !== undefined)
        data.adStartDate = dto.adStartDate ? new Date(dto.adStartDate) : null;
      if (dto.adEndDate !== undefined)
        data.adEndDate = dto.adEndDate ? new Date(dto.adEndDate) : null;
      if (dto.adPriority !== undefined) data.adPriority = dto.adPriority;
      if (dto.isVerified !== undefined) {
        data.isVerified = dto.isVerified;
        // 검증 처음 켤 때 verifiedAt 기록
        if (dto.isVerified && !existing.isVerified) {
          data.verifiedAt = new Date();
        }
      }
    }

    return this.prisma.serviceVendor.update({
      where: { id },
      data,
      include: { vendorContacts: true },
    });
  }

  async remove(id: string, userId: string, officeId: string) {
    const existing = await this.prisma.serviceVendor.findUnique({
      where: { id },
      select: { officeId: true },
    });
    if (!existing) throw new NotFoundException('업체를 찾을 수 없습니다.');

    if (existing.officeId === null) {
      await this.assertPlatformAdmin(userId);
    } else if (existing.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 삭제할 수 없습니다.');
    }

    await this.prisma.serviceVendor.delete({ where: { id } });
    return { success: true };
  }

  // ─── VendorContact CRUD ─────────────────────────────

  /** 업체에 담당자 연락처 추가. 공용 업체는 platform admin만. */
  async createContact(
    vendorId: string,
    userId: string,
    officeId: string,
    dto: CreateVendorContactDto,
  ) {
    const vendor = await this.prisma.serviceVendor.findUnique({
      where: { id: vendorId },
      select: { officeId: true },
    });
    if (!vendor) throw new NotFoundException('업체를 찾을 수 없습니다.');

    if (vendor.officeId === null) {
      await this.assertPlatformAdmin(userId);
    } else if (vendor.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 수정할 수 없습니다.');
    }

    return this.prisma.vendorContact.create({
      data: {
        vendorId,
        name: dto.name,
        phone: dto.phone,
        normalizedPhone: normalizePhone(dto.phone),
        role: dto.role ?? null,
        memo: dto.memo ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateContact(
    id: string,
    userId: string,
    officeId: string,
    dto: UpdateVendorContactDto,
  ) {
    const contact = await this.prisma.vendorContact.findUnique({
      where: { id },
      include: { vendor: { select: { officeId: true } } },
    });
    if (!contact) throw new NotFoundException('담당자를 찾을 수 없습니다.');

    if (contact.vendor.officeId === null) {
      await this.assertPlatformAdmin(userId);
    } else if (contact.vendor.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 수정할 수 없습니다.');
    }

    const data: Prisma.VendorContactUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
      data.normalizedPhone = normalizePhone(dto.phone);
    }
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.vendorContact.update({ where: { id }, data });
  }

  async removeContact(id: string, userId: string, officeId: string) {
    const contact = await this.prisma.vendorContact.findUnique({
      where: { id },
      include: { vendor: { select: { officeId: true } } },
    });
    if (!contact) throw new NotFoundException('담당자를 찾을 수 없습니다.');

    if (contact.vendor.officeId === null) {
      await this.assertPlatformAdmin(userId);
    } else if (contact.vendor.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 수정할 수 없습니다.');
    }

    await this.prisma.vendorContact.delete({ where: { id } });
    return { success: true };
  }

  // ─── 즐겨찾기 ─────────────────────────────────────────

  /** Toggle. 이미 있으면 제거, 없으면 생성. */
  async toggleFavorite(
    vendorId: string,
    officeId: string,
    dto: UpsertFavoriteDto = {},
  ) {
    // 가시성 체크: 공용이거나 내 사무소 업체만 즐겨찾기 가능
    const vendor = await this.prisma.serviceVendor.findUnique({
      where: { id: vendorId },
      select: { officeId: true },
    });
    if (!vendor) throw new NotFoundException('업체를 찾을 수 없습니다.');
    if (vendor.officeId !== null && vendor.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 즐겨찾기할 수 없습니다.');
    }

    const existing = await this.prisma.officeVendorFavorite.findUnique({
      where: { officeId_vendorId: { officeId, vendorId } },
    });

    if (existing) {
      await this.prisma.officeVendorFavorite.delete({
        where: { id: existing.id },
      });
      return { isFavorite: false };
    }

    await this.prisma.officeVendorFavorite.create({
      data: {
        officeId,
        vendorId,
        memo: dto.memo ?? null,
      },
    });
    return { isFavorite: true };
  }

  /** 즐겨찾기 메모만 업데이트 (toggle 아닌 upsert). */
  async updateFavoriteMemo(
    vendorId: string,
    officeId: string,
    memo: string | null,
  ) {
    const vendor = await this.prisma.serviceVendor.findUnique({
      where: { id: vendorId },
      select: { officeId: true },
    });
    if (!vendor) throw new NotFoundException('업체를 찾을 수 없습니다.');
    if (vendor.officeId !== null && vendor.officeId !== officeId) {
      throw new ForbiddenException('다른 사무소의 업체는 즐겨찾기할 수 없습니다.');
    }

    return this.prisma.officeVendorFavorite.upsert({
      where: { officeId_vendorId: { officeId, vendorId } },
      create: { officeId, vendorId, memo },
      update: { memo },
    });
  }
}
