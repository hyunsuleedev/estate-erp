import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsUUID,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class SavePublicListingDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(2)
  @MaxLength(100)
  title!: string;
  @IsString() @MaxLength(5000) description!: string;
  @IsArray()
  @ArrayMaxSize(12)
  @IsUrl({ protocols: ["https"], require_protocol: true }, { each: true })
  photoUrls!: string[];
  @IsBoolean() isPublished!: boolean;
}
export class PublicListingQuery {
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() officeId?: string;
  @IsOptional()
  @IsIn([
    "apartment",
    "officetel",
    "villa",
    "house",
    "commercial",
    "land",
    "living_accommodation",
  ])
  siteType?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000000)
  priceMin?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000000)
  priceMax?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  areaMin?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  areaMax?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  south?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  north?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  west?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  east?: number;
  @IsOptional() @IsIn(["latest", "priceAsc", "priceDesc"]) sort?: string;

  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @IsIn(["sale", "jeonse", "monthly"]) transactionType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page: number =
    1;
}
