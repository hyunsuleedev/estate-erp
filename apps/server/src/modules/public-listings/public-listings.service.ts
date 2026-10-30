import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MARKETABLE_LISTING_WHERE } from "../listings/listing-state";
import {
  PublicListingQuery,
  SavePublicListingDto,
} from "./public-listings.dto";

export const PUBLIC_OFFICE_SELECT = {
  id: true,
  name: true,
  phone: true,
  address: true,
  licenseNo: true,
  ceoName: true,
} satisfies Prisma.OfficeSelect;
// Allowlist at the database boundary: no contacts, unit number, internal memo or provider payload.
export const PUBLIC_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  photoUrls: true,
  updatedAt: true,
  office: { select: PUBLIC_OFFICE_SELECT },
  listing: {
    select: {
      transactionType: true,
      price: true,
      deposit: true,
      monthlyRent: true,
      maintenanceFee: true,
      moveInAvailableType: true,
      moveInAvailableFrom: true,
      moveInAvailableTo: true,
      intake: { select: { lastVerifiedAt: true } },
      property: {
        select: {
          site: {
            select: {
              id: true,
              name: true,
              type: true,
              roadAddress: true,
              lat: true,
              lng: true,
            },
          },
          unit: {
            select: {
              exclusiveAreaM2: true,
              floor: true,
              siteUnitType: { select: { exclusiveAreaM2: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PublicListingSelect;
export const PUBLIC_VISIBLE_WHERE = {
  isPublished: true,
  office: { isActive: true },
  listing: MARKETABLE_LISTING_WHERE,
} satisfies Prisma.PublicListingWhereInput;

@Injectable()
export class PublicListingsService {
  constructor(private readonly prisma: PrismaService) {}
  private async ownListing(officeId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, officeId },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException("매물을 찾을 수 없습니다.");
  }
  async settings(officeId: string, listingId: string) {
    await this.ownListing(officeId, listingId);
    return this.prisma.publicListing.findFirst({
      where: { officeId, listingId },
    });
  }
  async save(officeId: string, listingId: string, dto: SavePublicListingDto) {
    await this.ownListing(officeId, listingId);
    if (dto.isPublished) {
      const eligible = await this.prisma.listing.findFirst({
        where: { id: listingId, officeId, ...MARKETABLE_LISTING_WHERE },
        select: { id: true },
      });
      if (!eligible)
        throw new BadRequestException("거래 가능한 매물만 공개할 수 있습니다.");
      const office = await this.prisma.office.findFirst({
        where: { id: officeId, isActive: true },
        select: PUBLIC_OFFICE_SELECT,
      });
      if (
        !office?.phone ||
        !office.licenseNo ||
        !office.ceoName ||
        !office.address
      )
        throw new BadRequestException(
          "사무소 설정에 전화번호·등록번호·대표자·주소를 입력해 주세요.",
        );
    }
    const data = {
      title: dto.title,
      description: dto.description,
      photoUrls: dto.photoUrls,
      isPublished: dto.isPublished,
    };
    return this.prisma.publicListing.upsert({
      where: { listingId, officeId },
      create: { officeId, listingId, ...data },
      update: data,
    });
  }
  async office(officeId: string, query: PublicListingQuery) {
    const office = await this.prisma.office.findFirst({
      where: {
        id: officeId,
        isActive: true,
        publicListings: { some: { isPublished: true } },
      },
      select: PUBLIC_OFFICE_SELECT,
    });
    if (!office) throw new NotFoundException("공개 사무소를 찾을 수 없습니다.");
    return { office, ...(await this.search({ ...query, officeId })) };
  }
  private where(query: PublicListingQuery): Prisma.PublicListingWhereInput {
    for (const [min, max] of [
      [query.priceMin, query.priceMax],
      [query.areaMin, query.areaMax],
    ]) {
      if (min != null && max != null && min > max)
        throw new BadRequestException("최소값은 최대값보다 클 수 없습니다.");
    }
    const bounds = [query.south, query.north, query.west, query.east];
    if (
      bounds.some((v) => v != null) &&
      (!bounds.every((v) => v != null) ||
        query.south! > query.north! ||
        query.west! > query.east!)
    )
      throw new BadRequestException("지도 영역이 올바르지 않습니다.");
    const price = {
      ...(query.priceMin != null ? { gte: query.priceMin } : {}),
      ...(query.priceMax != null ? { lte: query.priceMax } : {}),
    };
    const area = {
      ...(query.areaMin != null ? { gte: query.areaMin } : {}),
      ...(query.areaMax != null ? { lte: query.areaMax } : {}),
    };
    const listing: Prisma.ListingWhereInput = {
      ...MARKETABLE_LISTING_WHERE,
      ...(query.transactionType
        ? { transactionType: query.transactionType }
        : {}),
      property: {
        site: {
          ...(query.siteId ? { id: query.siteId } : {}),
          ...(query.siteType ? { type: query.siteType } : {}),
          ...(query.south != null
            ? {
                lat: { gte: query.south, lte: query.north },
                lng: { gte: query.west, lte: query.east },
              }
            : {}),
        },
        ...(Object.keys(area).length
          ? {
              unit: {
                OR: [
                  { exclusiveAreaM2: area },
                  {
                    exclusiveAreaM2: null,
                    siteUnitType: { exclusiveAreaM2: area },
                  },
                ],
              },
            }
          : {}),
      },
      ...(Object.keys(price).length
        ? {
            OR: [
              { transactionType: "monthly", deposit: price },
              { transactionType: { not: "monthly" }, price },
            ],
          }
        : {}),
    };
    return {
      ...PUBLIC_VISIBLE_WHERE,
      listing,
      ...(query.officeId ? { officeId: query.officeId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: "insensitive" } },
              {
                listing: {
                  property: {
                    site: {
                      OR: [
                        {
                          name: {
                            contains: query.search.trim(),
                            mode: "insensitive",
                          },
                        },
                        {
                          roadAddress: {
                            contains: query.search.trim(),
                            mode: "insensitive",
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }
  async search(query: PublicListingQuery) {
    const where = this.where(query);
    // A mixed transaction list has incomparable price/deposit values: sort within a chosen transaction type.
    if (query.sort && query.sort !== "latest" && !query.transactionType)
      throw new BadRequestException("가격순 정렬은 거래유형을 선택해 주세요.");
    const orderBy: Prisma.PublicListingOrderByWithRelationInput[] =
      query.sort && query.sort !== "latest"
        ? [
            {
              listing: {
                [query.transactionType === "monthly" ? "deposit" : "price"]: {
                  sort: query.sort === "priceAsc" ? "asc" : "desc",
                  nulls: "last",
                },
              },
            },
            { id: "asc" },
          ]
        : [{ updatedAt: "desc" }, { id: "asc" }];
    const [items, total] = await Promise.all([
      this.prisma.publicListing.findMany({
        where,
        select: PUBLIC_LISTING_SELECT,
        orderBy,
        skip: ((query.page ?? 1) - 1) * 24,
        take: 24,
      }),
      this.prisma.publicListing.count({ where }),
    ]);
    return { items, total, page: query.page ?? 1, pageSize: 24 };
  }
  async map(query: PublicListingQuery) {
    const base = this.where(query);
    const where: Prisma.PublicListingWhereInput = {
      AND: [
        base,
        {
          listing: {
            property: { site: { lat: { not: null }, lng: { not: null } } },
          },
        },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.publicListing.findMany({
        where,
        take: 500,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: {
          listing: {
            select: {
              transactionType: true,
              price: true,
              deposit: true,
              property: {
                select: {
                  site: {
                    select: { id: true, name: true, lat: true, lng: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.publicListing.count({ where }),
    ]);
    const groups = new Map<
      string,
      {
        siteId: string;
        name: string;
        lat: number;
        lng: number;
        count: number;
        minPrice: number | null;
        transactionType: string;
      }
    >();
    for (const { listing } of rows) {
      const site = listing.property.site;
      const amount =
        listing.transactionType === "monthly" ? listing.deposit : listing.price;
      const key = site.id;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (existing.transactionType !== listing.transactionType)
          existing.transactionType = "mixed";
        if (existing.transactionType === "mixed") existing.minPrice = null;
        else if (amount != null)
          existing.minPrice =
            existing.minPrice == null
              ? amount
              : Math.min(existing.minPrice, amount);
      } else
        groups.set(key, {
          siteId: site.id,
          name: site.name,
          lat: Number(site.lat),
          lng: Number(site.lng),
          count: 1,
          minPrice: amount,
          transactionType: listing.transactionType,
        });
    }
    return { items: [...groups.values()], total, truncated: total > 500 };
  }
  async detail(id: string) {
    const item = await this.prisma.publicListing.findFirst({
      where: { id, ...PUBLIC_VISIBLE_WHERE },
      select: PUBLIC_LISTING_SELECT,
    });
    if (!item)
      throw new NotFoundException(
        "공개가 종료되었거나 찾을 수 없는 매물입니다.",
      );
    return item;
  }
}
