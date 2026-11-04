import { SiteType } from '@estate-erp/shared';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * 사무소가 직접 등록하는 단지의 입력값.
 *
 * isPublic·isLocked·officeId는 일부러 두지 않았다. 전역 ValidationPipe가
 * forbidNonWhitelisted이므로 이 값을 보내면 요청 자체가 400으로 거부된다.
 */
export class RegisterPrivateSiteDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: '단지명을 입력해주세요' })
  @MaxLength(100, { message: '단지명은 100자 이하로 입력해주세요' })
  name!: string;

  @IsIn(Object.values(SiteType), { message: '단지 유형을 선택해주세요' })
  type!: SiteType;

  @Matches(/^\d{10}$/, { message: '주소의 법정동 코드가 올바르지 않습니다' })
  wardCode!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(300)
  roadAddress?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(300)
  jibunAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1900, { message: '준공년도를 확인해주세요' })
  @Max(2100, { message: '준공년도를 확인해주세요' })
  builtYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: '세대수는 1 이상이어야 합니다' })
  totalUnits?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: '동수는 1 이상이어야 합니다' })
  totalDongs?: number;
}
