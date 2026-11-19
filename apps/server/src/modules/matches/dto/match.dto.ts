import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  LEGACY_MATCH_STAGE_VALUES,
  MATCH_STAGE_ORDER,
} from '@estate-erp/shared';

export const MATCH_STAGES = [
  ...MATCH_STAGE_ORDER,
  ...LEGACY_MATCH_STAGE_VALUES,
] as const;

export class CreateMatchDto {
  @IsUUID()
  listingId!: string;

  @IsUUID()
  buyerReqId!: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class UpdateMatchStageDto {
  @IsIn(MATCH_STAGES, { message: '유효하지 않은 매칭 단계입니다' })
  stage!: string;

  /** null = 메모 비우기 (undefined = 변경 없음) */
  @IsOptional()
  @IsString()
  memo?: string | null;
}

export class UpdateMatchMemoDto {
  /** null = 메모 비우기 */
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  memo!: string | null;

  /** 마지막 조회 시점과 다르면 409 Conflict */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string | null;
}

/** 만원 단위 금액의 상한 (Postgres INTEGER 범위 안, 2조 원) */
const MAX_MANWON = 200_000_000;

/**
 * 협상 중 합의 조건. 보낸 칸만 바꾼다 — 칸을 빼면 변경 없음, null 이면 비우기.
 * 금액은 만원 단위 정수.
 */
export class UpdateMatchAgreedTermsDto {
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt({ message: '합의 가격은 만원 단위 정수여야 합니다' })
  @Min(0)
  @Max(MAX_MANWON)
  agreedPrice?: number | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt({ message: '합의 보증금은 만원 단위 정수여야 합니다' })
  @Min(0)
  @Max(MAX_MANWON)
  agreedDeposit?: number | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt({ message: '합의 월세는 만원 단위 정수여야 합니다' })
  @Min(0)
  @Max(MAX_MANWON)
  agreedMonthlyRent?: number | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({}, { message: '입주일 형식이 올바르지 않습니다' })
  agreedMoveInDate?: string | null;
}
