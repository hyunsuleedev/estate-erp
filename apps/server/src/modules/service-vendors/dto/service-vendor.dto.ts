import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const VENDOR_AD_TIERS = ['none', 'basic', 'premium'] as const;
export type VendorAdTier = (typeof VENDOR_AD_TIERS)[number];

export const VENDOR_BUSINESS_TYPES = [
  'individual',
  'sole_proprietor',
  'corporate',
] as const;
export type VendorBusinessType = (typeof VENDOR_BUSINESS_TYPES)[number];

export class CreateServiceVendorDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(VENDOR_BUSINESS_TYPES)
  businessType?: VendorBusinessType;

  @IsArray()
  @IsString({ each: true })
  serviceCategories!: string[];

  @IsArray()
  @IsString({ each: true })
  coverageDistricts!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceNote?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // ── 공용 풀 전용 필드 (플랫폼 운영자만 설정 가능) ─────────
  /** null이면 공용 풀, 생략하면 본인 사무소의 개인 업체로 생성 */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsIn(VENDOR_AD_TIERS)
  adTier?: VendorAdTier;

  @IsOptional()
  @IsString()
  adStartDate?: string;

  @IsOptional()
  @IsString()
  adEndDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  adPriority?: number;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}

export class UpdateServiceVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(VENDOR_BUSINESS_TYPES)
  businessType?: VendorBusinessType | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCategories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coverageDistricts?: string[];

  @IsOptional()
  priceNote?: string | null;

  @IsOptional()
  description?: string | null;

  @IsOptional()
  memo?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // 플랫폼 운영자만 수정 가능
  @IsOptional()
  @IsIn(VENDOR_AD_TIERS)
  adTier?: VendorAdTier;

  @IsOptional()
  adStartDate?: string | null;

  @IsOptional()
  adEndDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  adPriority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}

export class ServiceVendorFilter {
  /** 카테고리 slug */
  @IsOptional()
  @IsString()
  category?: string;

  /** 법정동 district code */
  @IsOptional()
  @IsString()
  district?: string;

  /** 자유 텍스트 검색 (이름·메모·priceNote·description) */
  @IsOptional()
  @IsString()
  search?: string;

  /** true면 즐겨찾기한 업체만 */
  @IsOptional()
  favoritesOnly?: boolean;

  /** 'public' | 'private' | 'all' (기본 all). private=내 사무소 개인 업체만, public=공용 풀만 */
  @IsOptional()
  @IsIn(['all', 'public', 'private'])
  scope?: 'all' | 'public' | 'private';
}

export class CreateVendorContactDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateVendorContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  role?: string | null;

  @IsOptional()
  memo?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpsertFavoriteDto {
  @IsOptional()
  memo?: string | null;
}
