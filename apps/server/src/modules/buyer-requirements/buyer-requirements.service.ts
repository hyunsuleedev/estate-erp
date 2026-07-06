import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryContactPhone,
} from '../contacts/contact-phone.utils';

export interface BuyerRequirementSearchQuery {
  // Multi-value filters (comma-separated or arrays). Single string is treated
  // as a single-value legacy filter.
  status?: string | string[];
  urgency?: string | string[];
  transactionType?: string | string[];
  siteTypes?: string | string[];
  contactId?: string;
  assignedToId?: string | string[];
  // Preferred Site filter: list of site UUIDs. Matches buyers with any of them.
  preferredSiteIds?: string | string[];
  // Region filters at any of the three legal-dong levels. Each is CSV of codes.
  // Matching semantics (OR across buyer rows):
  //   - provinceCodes: buyer region with matching province_code
  //   - districtCodes: buyer district_code == x OR ward_code startsWith x
  //   - wardCodes: buyer ward_code == x
  provinceCodes?: string | string[];
  districtCodes?: string | string[];
  wardCodes?: string | string[];
  // Range filters. BuyerRequirement stores a range (min..max) per money/area
  // field; a filter is considered a match when the two ranges overlap.
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  // Date ranges (ISO strings)
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  // Free-text search over contact name/phone, memo
  search?: string;
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value)
    ? value
    : value.split(',').map((v) => v.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

@Injectable()
export class BuyerRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: BuyerRequirementSearchQuery = {}) {
    const where: Prisma.BuyerRequirementWhereInput = { officeId };
    const AND: Prisma.BuyerRequirementWhereInput[] = [];

    // ── Multi-value filters ─────────────────────────────────────
    const statusList = toArray(query.status);
    if (statusList) where.status = { in: statusList };

    const urgencyList = toArray(query.urgency);
    if (urgencyList) where.urgency = { in: urgencyList };

    const txList = toArray(query.transactionType);
    if (txList) where.transactionType = { in: txList };

    const assigneeList = toArray(query.assignedToId);
    if (assigneeList) where.assignedToId = { in: assigneeList };

    const siteTypesList = toArray(query.siteTypes);
    if (siteTypesList) where.siteTypes = { hasSome: siteTypesList };

    const preferredSiteIds = toArray(query.preferredSiteIds);
    if (preferredSiteIds) {
      AND.push({
        preferredSites: { some: { siteId: { in: preferredSiteIds } } },
      });
    }

    const provinceCodes = toArray(query.provinceCodes);
    const districtCodes = toArray(query.districtCodes);
    const wardCodes = toArray(query.wardCodes);
    if (provinceCodes || districtCodes || wardCodes) {
      const regionOR: Prisma.BuyerRequirementRegionWhereInput[] = [];
      if (provinceCodes) regionOR.push({ provinceCode: { in: provinceCodes } });
      // districtCode filter matches either buyer.districtCode OR buyer.wardCode
      // starting with that district (ward codes are 10 digits, first 5 = district)
      if (districtCodes) {
        regionOR.push({ districtCode: { in: districtCodes } });
        for (const dc of districtCodes) {
          regionOR.push({ wardCode: { startsWith: dc } });
        }
      }
      if (wardCodes) regionOR.push({ wardCode: { in: wardCodes } });
      AND.push({
        preferredRegions: { some: { OR: regionOR } },
      });
    }

    if (query.contactId) where.contactId = query.contactId;

    // ── Range filters: overlap semantics ────────────────────────
    // Filter [F.min, F.max] overlaps Buyer [priceMin, priceMax] when:
    //   (F.min == null OR priceMax == null OR priceMax >= F.min)
    //   AND (F.max == null OR priceMin == null OR priceMin <= F.max)
    const addOverlap = (
      fieldMin: keyof Prisma.BuyerRequirementWhereInput,
      fieldMax: keyof Prisma.BuyerRequirementWhereInput,
      filterMin: number | undefined,
      filterMax: number | undefined,
    ) => {
      if (filterMin === undefined && filterMax === undefined) return;
      if (filterMin !== undefined) {
        AND.push({
          OR: [{ [fieldMax]: null }, { [fieldMax]: { gte: filterMin } }] as any,
        });
      }
      if (filterMax !== undefined) {
        AND.push({
          OR: [{ [fieldMin]: null }, { [fieldMin]: { lte: filterMax } }] as any,
        });
      }
    };

    addOverlap('priceMin', 'priceMax', query.priceMin, query.priceMax);
    addOverlap('depositMin', 'depositMax', query.depositMin, query.depositMax);
    addOverlap('areaMin', 'areaMax', query.areaMin, query.areaMax);

    // monthlyRentMax: single upper-bound field, not a range. Interpret as
    // "show buyers whose acceptable monthly rent is at least this much".
    if (query.monthlyRentMax !== undefined) {
      AND.push({
        OR: [{ monthlyRentMax: null }, { monthlyRentMax: { gte: query.monthlyRentMax } }],
      });
    }

    // ── Date ranges ─────────────────────────────────────────────
    if (query.nextContactAfter || query.nextContactBefore) {
      const cond: Prisma.DateTimeNullableFilter = {};
      if (query.nextContactAfter) cond.gte = new Date(query.nextContactAfter);
      if (query.nextContactBefore) cond.lte = new Date(query.nextContactBefore);
      where.nextContactDate = cond;
    }
    if (query.moveInAfter || query.moveInBefore) {
      const cond: Prisma.DateTimeNullableFilter = {};
      if (query.moveInAfter) cond.gte = new Date(query.moveInAfter);
      if (query.moveInBefore) cond.lte = new Date(query.moveInBefore);
      where.moveInDate = cond;
    }

    // ── Free-text search ────────────────────────────────────────
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const normalized = normalizePhone(q);
      AND.push({
        OR: [
          { contact: { name: { contains: q, mode: 'insensitive' } } },
          { contact: { phones: { some: { normalizedPhone: { contains: normalized } } } } },
          { memo: { contains: q, mode: 'insensitive' } },
          { preferredSites: { some: { site: { name: { contains: q, mode: 'insensitive' } } } } },
        ],
      });
    }

    if (AND.length > 0) where.AND = AND;

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.buyerRequirement.findMany({
        where,
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
          assignedTo: { select: { id: true, name: true } },
          preferredSites: {
            include: {
              site: { select: { id: true, name: true, type: true } },
            },
            orderBy: { priority: 'asc' },
          },
          preferredRegions: {
            include: {
              province: true,
              district: true,
              ward: true,
            },
          },
          _count: { select: { matches: true, consultations: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.buyerRequirement.count({ where }),
    ]);

    return {
      items: items.map(withPrimaryContactPhone),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const req = await this.prisma.buyerRequirement.findFirst({
      where: { id, officeId },
      include: {
        contact: true,
        assignedTo: { select: { id: true, name: true } },
        matches: { include: { listing: { include: { property: { include: { site: true } } } } } },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10 },
        preferredSites: {
          include: { site: { select: { id: true, name: true, type: true } } },
          orderBy: { priority: 'asc' },
        },
        preferredRegions: {
          include: { province: true, district: true, ward: true },
        },
      },
    });
    if (!req) throw new NotFoundException('BuyerRequirement not found');
    return req;
  }

  async create(
    officeId: string,
    dto: {
      contactId: string;
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      mustConditions?: string[];
      preferConditions?: string[];
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      nextContactDate?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
  ) {
    const { moveInDate, nextContactDate, preferredSites, preferredRegions, ...rest } = dto;
    return this.prisma.buyerRequirement.create({
      data: {
        officeId,
        ...rest,
        moveInDate: moveInDate ? new Date(moveInDate) : undefined,
        nextContactDate: nextContactDate ? new Date(nextContactDate) : undefined,
        preferredSites: preferredSites?.length
          ? { create: preferredSites }
          : undefined,
        preferredRegions: preferredRegions?.length
          ? { create: preferredRegions }
          : undefined,
      },
      include: {
        contact: true,
        preferredSites: { include: { site: { select: { id: true, name: true, type: true } } } },
        preferredRegions: { include: { province: true, district: true, ward: true } },
      },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      mustConditions?: string[];
      preferConditions?: string[];
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      lastContactDate?: string;
      nextContactDate?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
  ) {
    await this.findOne(id, officeId);
    const { preferredSites, preferredRegions, ...rest } = dto;
    return this.prisma.buyerRequirement.update({
      where: { id },
      data: {
        ...rest,
        moveInDate: rest.moveInDate ? new Date(rest.moveInDate) : undefined,
        lastContactDate: rest.lastContactDate ? new Date(rest.lastContactDate) : undefined,
        nextContactDate: rest.nextContactDate ? new Date(rest.nextContactDate) : undefined,
        // Replace-all semantics for nested sets on update
        preferredSites: preferredSites
          ? { deleteMany: {}, create: preferredSites }
          : undefined,
        preferredRegions: preferredRegions
          ? { deleteMany: {}, create: preferredRegions }
          : undefined,
      },
      include: {
        contact: true,
        preferredSites: { include: { site: { select: { id: true, name: true, type: true } } } },
        preferredRegions: { include: { province: true, district: true, ward: true } },
      },
    });
  }

  async updateStatus(id: string, officeId: string, status: string) {
    await this.findOne(id, officeId);
    return this.prisma.buyerRequirement.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.buyerRequirement.delete({ where: { id } });
  }

  async findDueContacts(officeId: string) {
    const now = new Date();
    const items = await this.prisma.buyerRequirement.findMany({
      where: {
        officeId,
        status: 'active',
        nextContactDate: { lte: now },
      },
      include: {
        contact: { include: { phones: contactPhonesIncludeOrdered } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { nextContactDate: 'asc' },
    });
    return items.map(withPrimaryContactPhone);
  }
}
