import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type RegionLevel = 'province' | 'district' | 'ward';

export interface RegionSearchResult {
  level: RegionLevel;
  code: string;
  name: string;
  // Human-readable full path, e.g. "서울특별시 강동구 고덕동"
  fullName: string;
}

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, limit = 20): Promise<RegionSearchResult[]> {
    const query = q.trim();
    if (!query) return [];
    const half = Math.max(5, Math.floor(limit / 3));

    const [provinces, districts, wards] = await Promise.all([
      this.prisma.province.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        take: half,
      }),
      this.prisma.district.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        include: { province: true },
        take: half,
      }),
      this.prisma.ward.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        include: { district: { include: { province: true } } },
        take: half,
      }),
    ]);

    const results: RegionSearchResult[] = [];
    for (const p of provinces) {
      results.push({ level: 'province', code: p.code, name: p.name, fullName: p.name });
    }
    for (const d of districts) {
      results.push({
        level: 'district',
        code: d.code,
        name: d.name,
        fullName: `${d.province.name} ${d.name}`,
      });
    }
    for (const w of wards) {
      results.push({
        level: 'ward',
        code: w.code,
        name: w.name,
        fullName: `${w.district.province.name} ${w.district.name} ${w.name}`,
      });
    }
    return results.slice(0, limit);
  }
}
