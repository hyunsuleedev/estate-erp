import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PublicListingsService } from "./public-listings.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  PublicCatalogController,
  PublicListingsController,
} from "./public-listings.controller";
import { ClerkAuthService } from "../auth/clerk-auth.service";

// Run only against an explicitly supplied disposable local database.
const url = process.env.PUBLIC_CATALOG_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("public catalog PostgreSQL integration", () => {
  let db: PrismaClient;
  let service: PublicListingsService;
  let app: INestApplication;
  let baseUrl: string;
  const identities = new Map<string, string>();
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.includes("estate_public_qa")
    )
      throw new Error("Use a disposable local estate_public_qa database");
    db = new PrismaClient({ datasourceUrl: url });
    service = new PublicListingsService(db as PrismaService);
    const module = await Test.createTestingModule({
      controllers: [PublicCatalogController, PublicListingsController],
      providers: [
        { provide: PublicListingsService, useValue: service },
        {
          provide: ClerkAuthService,
          useValue: {
            authenticateBearerToken: async (token: string) => {
              const officeId = identities.get(token);
              if (!officeId) throw new UnauthorizedException();
              return { userId: randomUUID(), officeId, role: "owner" };
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });
  it("persists publication, applies live lifecycle and price changes, and enforces the tenant FK", async () => {
    const office = await db.office.create({
      data: {
        name: "공개 플랫폼 QA",
        phone: "02-000-0000",
        licenseNo: "QA",
        ceoName: "QA",
        address: "예시 주소",
      },
    });
    const other = await db.office.create({ data: { name: "다른 사무소 QA" } });
    await db.province.upsert({
      where: { code: "99" },
      create: { code: "99", name: "QA" },
      update: {},
    });
    await db.district.upsert({
      where: { code: "99999" },
      create: { code: "99999", provinceCode: "99", name: "QA" },
      update: {},
    });
    await db.ward.upsert({
      where: { code: "9999999999" },
      create: { code: "9999999999", districtCode: "99999", name: "QA" },
      update: {},
    });
    const site = await db.site.create({
      data: {
        officeId: office.id,
        name: "QA 아파트",
        lat: 37.55,
        lng: 127.15,
        type: "apartment",
        wardCode: "9999999999",
      },
    });
    const property = await db.property.create({
      data: { officeId: office.id, siteId: site.id },
    });
    const caseFile = await db.brokerageCase.create({
      data: { officeId: office.id },
    });
    const intake = await db.listingIntake.create({
      data: {
        officeId: office.id,
        propertyId: property.id,
        brokerageCaseId: caseFile.id,
        memo: "SECRET_INTAKE",
      },
    });
    const listing = await db.listing.create({
      data: {
        officeId: office.id,
        propertyId: property.id,
        intakeId: intake.id,
        transactionType: "sale",
        price: 120000,
        privateMemo: "SECRET_OWNER",
      },
    });
    identities.set("qa-owner", office.id);
    identities.set("qa-other", other.id);
    const draft = {
      title: "QA 공개 매물",
      description: "공개 설명",
      photoUrls: [],
      isPublished: false,
    };
    try {
      await expect(
        db.publicListing.create({
          data: {
            ...draft,
            officeId: other.id,
            listingId: listing.id,
            id: randomUUID(),
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
      const manageUrl = `${baseUrl}/public-listings/listing/${listing.id}`;
      expect((await fetch(manageUrl)).status).toBe(401);
      expect(
        (
          await fetch(manageUrl, {
            headers: { Authorization: "Bearer qa-other" },
          })
        ).status,
      ).toBe(404);
      const write = (body: unknown) =>
        fetch(manageUrl, {
          method: "PUT",
          headers: {
            Authorization: "Bearer qa-owner",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      expect(
        (await write({ ...draft, privateMemo: "must be rejected" })).status,
      ).toBe(400);
      expect(
        (await write({ ...draft, photoUrls: ["javascript:alert(1)"] })).status,
      ).toBe(400);
      expect((await write(draft)).status).toBe(200);
      expect(
        (await fetch(`${baseUrl}/public/offices/${office.id}?page=-1`)).status,
      ).toBe(400);
      const publication = await service.save(office.id, listing.id, draft);
      await expect(service.detail(publication.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.save(other.id, listing.id, draft),
      ).rejects.toBeInstanceOf(NotFoundException);
      await service.save(office.id, listing.id, {
        ...draft,
        isPublished: true,
      });
      expect((await service.office(office.id, { page: 1 })).total).toBe(1);
      const searchResponse = await fetch(`${baseUrl}/public/homes?search=QA&priceMin=120000&priceMax=120000&south=37.5&north=37.6&west=127.1&east=127.2`);
      expect(searchResponse.status).toBe(200);
      expect((await searchResponse.json()).total).toBe(1);
      expect((await service.search({ page: 1, priceMax: 119999 })).total).toBe(0);
      expect((await service.search({ page: 1, south: 36, north: 37, west: 127, east: 128 })).total).toBe(0);
      const mapResponse = await fetch(`${baseUrl}/public/map`);
      expect(mapResponse.status).toBe(200);
      const map = await mapResponse.json();
      expect(map.items).toEqual([{ siteId: site.id, name: site.name, lat: 37.55, lng: 127.15, count: 1, transactionType: "sale", minPrice: 120000 }]);
      expect(mapResponse.headers.get("cache-control")).toBe("no-store");
      for (const invalid of ["south=37", "priceMin=10&priceMax=1", "sort=priceAsc", "north=100&south=37&west=127&east=128"])
        expect((await fetch(`${baseUrl}/public/homes?${invalid}`)).status).toBe(400);
      const publicResponse = await fetch(
        `${baseUrl}/public/homes/${publication.id}`,
      );
      expect(publicResponse.status).toBe(200);
      expect(publicResponse.headers.get("cache-control")).toBe("no-store");
      expect(
        JSON.stringify(await service.detail(publication.id)),
      ).not.toContain("SECRET");
      await db.listing.update({
        where: { id: listing.id },
        data: { price: 119000 },
      });
      expect((await service.detail(publication.id)).listing.price).toBe(119000);
      await db.listing.update({
        where: { id: listing.id },
        data: { isPaused: true },
      });
      await expect(service.detail(publication.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await db.listing.update({
        where: { id: listing.id },
        data: { isPaused: false },
      });
      expect((await service.map({ page: 1 })).total).toBe(1);
      for (const lifecycleStatus of ["hold", "closed"]) {
        await db.listingIntake.update({
          where: { id: intake.id },
          data: { lifecycleStatus },
        });
        expect((await service.office(office.id, { page: 1 })).total).toBe(0);
        expect((await service.map({ page: 1 })).total).toBe(0);
        await expect(service.detail(publication.id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      }
      await db.listingIntake.update({
        where: { id: intake.id },
        data: { lifecycleStatus: "open" },
      });
      const deal = await db.deal.create({
        data: {
          officeId: office.id,
          listingId: listing.id,
          transactionType: "sale",
          stage: "contracted",
        },
      });
      expect((await service.office(office.id, { page: 1 })).total).toBe(0);
        expect((await service.map({ page: 1 })).total).toBe(0);
      await db.deal.update({
        where: { id: deal.id },
        data: { isCancelled: true },
      });
      expect((await service.office(office.id, { page: 1 })).total).toBe(1);
      await service.save(office.id, listing.id, draft);
      await expect(service.detail(publication.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      await db.deal.deleteMany({ where: { listingId: listing.id } });
      await db.publicListing.deleteMany({ where: { listingId: listing.id } });
      await db.listing.delete({ where: { id: listing.id } });
      await db.listingIntake.delete({ where: { id: intake.id } });
      await db.brokerageCase.delete({ where: { id: caseFile.id } });
      await db.property.delete({ where: { id: property.id } });
      await db.site.delete({ where: { id: site.id } });
      await db.office.deleteMany({
        where: { id: { in: [office.id, other.id] } },
      });
    }
  });
});
