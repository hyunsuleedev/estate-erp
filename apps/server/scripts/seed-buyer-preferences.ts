/**
 * Dummy data seeder for BuyerRequirement preferredSites and preferredRegions.
 * Rotates through available sites and regions to give each of the existing
 * buyer requirements 1~3 preferred sites and 1~2 preferred regions.
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const buyers = await prisma.buyerRequirement.findMany({
      select: { id: true, contact: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const sites = await prisma.site.findMany({
      where: { isPublic: true },
      take: 8,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    // Pick a handful of well-known district/ward codes in Seoul 강동구.
    const districts = await prisma.district.findMany({
      where: { name: { in: ['강동구', '송파구', '강남구', '마포구'] } },
      select: { code: true, name: true },
    });
    const wards = await prisma.ward.findMany({
      where: { name: { in: ['고덕동', '명일동', '암사동', '천호동', '둔촌동'] } },
      select: { code: true, name: true, districtCode: true },
    });

    console.log('Found:', {
      buyers: buyers.length,
      sites: sites.length,
      districts: districts.length,
      wards: wards.length,
    });

    if (!buyers.length) {
      console.log('No buyers to seed.');
      return;
    }
    if (!sites.length) {
      console.log('No public sites found; seeding regions only.');
    }

    // Clear existing preferences so reruns are idempotent.
    await prisma.buyerRequirementSite.deleteMany({});
    await prisma.buyerRequirementRegion.deleteMany({});
    console.log('Cleared existing preferences.');

    // Rotate lastContactDate across a realistic range: today, a few days ago,
    // a few weeks, a few months, a year.
    const dayOffsets = [0, 2, 7, 20, 45, 95, 180, 380];

    for (let i = 0; i < buyers.length; i++) {
      const buyer = buyers[i];
      const daysAgo = dayOffsets[i % dayOffsets.length];
      const lastContactDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      await prisma.buyerRequirement.update({
        where: { id: buyer.id },
        data: { lastContactDate },
      });

      // Preferred sites: 1~3 rotating, but never duplicate same site on one buyer.
      const desiredSiteCount = sites.length ? 1 + (i % 3) : 0;
      const siteCount = Math.min(desiredSiteCount, sites.length);
      const seen = new Set<string>();
      const chosenSites = [] as { siteId: string; priority: number }[];
      for (let j = 0; j < siteCount; j++) {
        const site = sites[(i + j) % sites.length];
        if (seen.has(site.id)) continue;
        seen.add(site.id);
        chosenSites.push({ siteId: site.id, priority: chosenSites.length + 1 });
      }

      // Preferred regions: alternate level pattern (district, ward, district+ward, province-only)
      const regionRows: {
        provinceCode?: string | null;
        districtCode?: string | null;
        wardCode?: string | null;
      }[] = [];
      const pattern = i % 4;
      if (pattern === 0 && districts.length) {
        const d = districts[i % districts.length];
        regionRows.push({ districtCode: d.code });
      } else if (pattern === 1 && wards.length) {
        const w = wards[i % wards.length];
        regionRows.push({ districtCode: w.districtCode, wardCode: w.code });
      } else if (pattern === 2 && districts.length && wards.length) {
        const d = districts[i % districts.length];
        const w = wards[(i + 1) % wards.length];
        regionRows.push({ districtCode: d.code });
        regionRows.push({ districtCode: w.districtCode, wardCode: w.code });
      } else {
        regionRows.push({ provinceCode: '11' }); // 서울 전체
      }

      if (chosenSites.length) {
        await prisma.buyerRequirementSite.createMany({
          data: chosenSites.map((s) => ({
            buyerReqId: buyer.id,
            siteId: s.siteId,
            priority: s.priority,
          })),
        });
      }
      if (regionRows.length) {
        await prisma.buyerRequirementRegion.createMany({
          data: regionRows.map((r) => ({
            buyerReqId: buyer.id,
            provinceCode: r.provinceCode ?? null,
            districtCode: r.districtCode ?? null,
            wardCode: r.wardCode ?? null,
          })),
        });
      }

      console.log(
        `Seeded ${buyer.contact?.name ?? buyer.id}: ${chosenSites.length} sites, ${regionRows.length} regions (pattern ${pattern})`,
      );
    }

    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
