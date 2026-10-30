import { BadRequestException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  PublicListingQuery,
  SavePublicListingDto,
} from "./public-listings.dto";
import {
  PublicListingsService,
  PUBLIC_VISIBLE_WHERE,
  PUBLIC_LISTING_SELECT,
} from "./public-listings.service";
import { MARKETABLE_LISTING_WHERE } from "../listings/listing-state";
describe("PublicListingsService", () => {
  const body = {
    title: "공개 매물",
    description: "소개",
    photoUrls: [],
    isPublished: true,
  };
  let db: any;
  let service: PublicListingsService;
  beforeEach(() => {
    db = {
      listing: { findFirst: jest.fn().mockResolvedValue({ id: "listing-a" }) },
      office: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: "office-a",
            phone: "02-000-0000",
            licenseNo: "test",
            ceoName: "Test",
            address: "Test",
          }),
      },
      publicListing: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockResolvedValue({ id: "publication" }),
      },
    };
    service = new PublicListingsService(db);
  });
  it("rejects writes and settings reads for another office before touching publications", async () => {
    db.listing.findFirst.mockResolvedValue(null);
    await expect(
      service.save("office-b", "listing-a", body),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.settings("office-b", "listing-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.listing.findFirst).toHaveBeenCalledWith({
      where: { id: "listing-a", officeId: "office-b" },
      select: { id: true },
    });
    expect(db.publicListing.upsert).not.toHaveBeenCalled();
    expect(db.publicListing.findFirst).not.toHaveBeenCalled();
  });
  it("rejects publishing unavailable listings", async () => {
    db.listing.findFirst
      .mockResolvedValueOnce({ id: "listing-a" })
      .mockResolvedValueOnce(null);
    await expect(
      service.save("office-a", "listing-a", body),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.publicListing.upsert).not.toHaveBeenCalled();
  });
  it("requires public broker identification before publication", async () => {
    db.office.findFirst.mockResolvedValue({ phone: null });
    await expect(
      service.save("office-a", "listing-a", body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("allows taking down a previously unavailable listing", async () => {
    await service.save("office-a", "listing-a", {
      ...body,
      isPublished: false,
    });
    expect(db.listing.findFirst).toHaveBeenCalledTimes(1);
    expect(db.publicListing.upsert.mock.calls[0][0].update.isPublished).toBe(
      false,
    );
  });
  it("scopes the upsert and copies only explicitly authored public fields", async () => {
    await service.save("office-a", "listing-a", {
      ...body,
      privateMemo: "secret",
    } as any);
    const args = db.publicListing.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      listingId: "listing-a",
      officeId: "office-a",
    });
    expect(args.create.officeId).toBe("office-a");
    expect(args.update).toEqual(body);
  });
  it("uses the same fail-closed availability filter for anonymous detail and list queries", async () => {
    db.publicListing.findFirst.mockResolvedValue(null);
    await expect(service.detail("hidden")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.publicListing.findFirst).toHaveBeenCalledWith({
      where: { id: "hidden", ...PUBLIC_VISIBLE_WHERE },
      select: PUBLIC_LISTING_SELECT,
    });
    await service.office("office-a", {
      page: 2,
      search: "park",
      transactionType: "sale",
    });
    const args = db.publicListing.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      officeId: "office-a",
      isPublished: true,
      office: { isActive: true },
      listing: { ...MARKETABLE_LISTING_WHERE, transactionType: "sale" },
    });
    expect(args.skip).toBe(24);
    expect(args.take).toBe(24);
    expect(db.publicListing.count).toHaveBeenCalledWith({ where: args.where });
  });
  it("never selects internal notes, contacts, unit names, or private photo collections", () => {
    const selection = JSON.stringify(PUBLIC_LISTING_SELECT);
    for (const key of [
      "privateMemo",
      "memo",
      "propertyContacts",
      "tenants",
      "photos",
      "externalAdId",
    ])
      expect(selection).not.toContain(`"${key}"`);
    expect(
      PUBLIC_LISTING_SELECT.listing.select.property.select.unit.select,
    ).toEqual({ exclusiveAreaM2: true, floor: true, siteUnitType: { select: { exclusiveAreaM2: true } } });
  });
  it("validates pagination, transaction types, URLs and maximum photo count", async () => {
    expect(
      await validate(
        plainToInstance(PublicListingQuery, {
          page: "-1",
          transactionType: "secret",
        }),
      ),
    ).toHaveLength(2);
    expect(
      await validate(plainToInstance(PublicListingQuery, { page: "2" })),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SavePublicListingDto, {
          ...body,
          photoUrls: ["javascript:alert(1)"],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SavePublicListingDto, {
          ...body,
          photoUrls: Array(13).fill("https://example.com/photo.jpg"),
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SavePublicListingDto, { ...body, title: "  " }),
      ),
    ).not.toHaveLength(0);
  });
});
