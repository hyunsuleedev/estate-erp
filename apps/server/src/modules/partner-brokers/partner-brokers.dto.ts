import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** 고치는 칸을 비우면 빈 글자 대신 null로 저장한다 */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const NAME_MESSAGE = '사무소명을 1~100자로 입력해 주세요.';

class PartnerBrokerFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '전화번호는 50자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '대표자 이름은 50자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  ceoName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '대표 휴대폰은 50자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  ceoPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '등록번호는 100자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  licenseNo?: string | null;

  @IsOptional()
  @IsEmail({}, { message: '이메일 형식이 맞지 않습니다.' })
  @MaxLength(200)
  @Transform(trimToNull)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '주소는 300자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: '메모는 2000자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  memo?: string | null;
}

export class CreatePartnerBrokerDto extends PartnerBrokerFieldsDto {
  @IsString({ message: NAME_MESSAGE })
  @Length(1, 100, { message: NAME_MESSAGE })
  @Transform(trim)
  declare name: string;

  /** 우리 서비스를 쓰는 사무소와 이어 둘 때. 화면에서는 아직 보내지 않는다 */
  @IsOptional()
  @IsUUID('all', { message: '연결할 사무소가 올바르지 않습니다.' })
  linkedOfficeId?: string;
}

export class UpdatePartnerBrokerDto extends PartnerBrokerFieldsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: NAME_MESSAGE })
  @Length(1, 100, { message: NAME_MESSAGE })
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsBoolean({ message: '사용 여부는 켬 또는 끔이어야 합니다.' })
  isActive?: boolean;
}

export class CreatePartnerBrokerContactDto {
  @IsString({ message: '이름을 1~50자로 입력해 주세요.' })
  @Length(1, 50, { message: '이름을 1~50자로 입력해 주세요.' })
  @Transform(trim)
  declare name: string;

  @IsString({ message: '전화번호를 1~50자로 입력해 주세요.' })
  @Length(1, 50, { message: '전화번호를 1~50자로 입력해 주세요.' })
  @Transform(trim)
  declare phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '직책·역할은 50자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  role?: string | null;

  @IsOptional()
  @IsBoolean({ message: '대표 연락처 여부는 참 또는 거짓이어야 합니다.' })
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '메모는 500자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  memo?: string | null;
}

export class UpdatePartnerBrokerContactDto {
  @IsOptional()
  @IsString({ message: '이름을 1~50자로 입력해 주세요.' })
  @Length(1, 50, { message: '이름을 1~50자로 입력해 주세요.' })
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsString({ message: '전화번호를 1~50자로 입력해 주세요.' })
  @Length(1, 50, { message: '전화번호를 1~50자로 입력해 주세요.' })
  @Transform(trim)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: '직책·역할은 50자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  role?: string | null;

  @IsOptional()
  @IsBoolean({ message: '대표 연락처 여부는 참 또는 거짓이어야 합니다.' })
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '메모는 500자까지 입력할 수 있습니다.' })
  @Transform(trimToNull)
  memo?: string | null;
}
