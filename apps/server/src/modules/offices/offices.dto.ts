import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
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

const RATE_MESSAGE = '배분율은 0~100 사이 숫자로 입력해 주세요.';

/** 설정 › 수수료 배분. 직원 정산이 defaultAgentRate를 숫자로 읽는다(finance/settlement.service.ts). */
export class UpdateCommissionConfigDto {
  @IsOptional()
  @IsIn(['percentage', 'fixed', 'custom'], { message: '배분 방식이 올바르지 않습니다.' })
  distributionType?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: RATE_MESSAGE })
  @Min(0, { message: RATE_MESSAGE })
  @Max(100, { message: RATE_MESSAGE })
  defaultAgentRate?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: RATE_MESSAGE })
  @Min(0, { message: RATE_MESSAGE })
  @Max(100, { message: RATE_MESSAGE })
  listingAgentRate?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: RATE_MESSAGE })
  @Min(0, { message: RATE_MESSAGE })
  @Max(100, { message: RATE_MESSAGE })
  buyingAgentRate?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: RATE_MESSAGE })
  @Min(0, { message: RATE_MESSAGE })
  @Max(100, { message: RATE_MESSAGE })
  dualAgentRate?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: RATE_MESSAGE })
  @Min(0, { message: RATE_MESSAGE })
  @Max(100, { message: RATE_MESSAGE })
  managerRate?: number;

  /** 만원 단위 정수 */
  @IsOptional()
  @IsInt({ message: '마감 담당 보너스는 0 이상의 정수(만원)로 입력해 주세요.' })
  @Min(0, { message: '마감 담당 보너스는 0 이상의 정수(만원)로 입력해 주세요.' })
  closerBonus?: number;
}
