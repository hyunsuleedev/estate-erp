import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OfficePostalAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  roadAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  jibunAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  detailAddress?: string | null;

  @IsOptional()
  @Matches(/^\d{5}$/)
  @Transform(trim)
  zipCode?: string | null;

  @IsOptional()
  @Matches(/^\d{25}$/)
  @Transform(trim)
  buildingCode?: string | null;
}

class OfficeFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  licenseNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  ceoName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trim)
  phone?: string | null;

  /** Compatibility with older clients. New clients send postalAddress atomically. */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  @Transform(trim)
  address?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => OfficePostalAddressDto)
  postalAddress?: OfficePostalAddressDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  naverVerificationId?: string | null;
}

export class UpdateOfficeDto extends OfficeFieldsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 150)
  @Transform(trim)
  name?: string;
}

export class CreateOfficeDto extends OfficeFieldsDto {
  @IsString()
  @Length(1, 150)
  @Transform(trim)
  declare name: string;
}
