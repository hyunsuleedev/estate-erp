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

export interface ProvinceOption {
  code: string;
  name: string;
}

export interface DistrictOption {
  code: string;
  provinceCode: string;
  name: string;
}

export interface WardOption {
  code: string;
  districtCode: string;
  name: string;
}

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findProvinces(): Promise<ProvinceOption[]> {
    return this.prisma.province.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        name: true,
      },
    });
  }

  async findDistricts(provinceCode?: string): Promise<DistrictOption[]> {
    return this.prisma.district.findMany({
      where: provinceCode ? { provinceCode } : undefined,
      orderBy: { code: 'asc' },
      select: {
        code: true,
        provinceCode: true,
        name: true,
      },
    });
  }

  async findWards(districtCode?: string): Promise<WardOption[]> {
    return this.prisma.ward.findMany({
      where: districtCode ? { districtCode } : undefined,
      orderBy: { code: 'asc' },
      select: {
        code: true,
        districtCode: true,
        name: true,
      },
    });
  }

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
