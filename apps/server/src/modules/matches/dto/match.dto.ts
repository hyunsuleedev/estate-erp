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
  @IsUUID('all', { message: '매물을 찾을 수 없습니다' })
  listingId!: string;

  @IsUUID('all', { message: '희망 조건을 찾을 수 없습니다' })
  buyerReqId!: string;

  @IsOptional()
  @IsString({ message: '메모는 글로 적어 주세요' })
  memo?: string;
}

export class UpdateMatchStageDto {
  @IsIn(MATCH_STAGES, { message: '유효하지 않은 매칭 단계입니다' })
  stage!: string;

  /** null = 메모 비우기 (undefined = 변경 없음) */
  @IsOptional()
  @IsString({ message: '메모는 글로 적어 주세요' })
  memo?: string | null;
}

export class UpdateMatchMemoDto {
  /** null = 메모 비우기 */
  @ValidateIf((_object, value) => value !== null)
  @IsString({ message: '메모는 글로 적어 주세요' })
  memo!: string | null;

  /** 마지막 조회 시점과 다르면 409 Conflict */
  @IsOptional()
  @IsISO8601({}, { message: '수정 시각 형식이 올바르지 않습니다.' })
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
  @Min(0, { message: '합의 가격은 0 이상이어야 합니다' })
  @Max(MAX_MANWON, { message: '합의 가격이 너무 큽니다' })
  agreedPrice?: number | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt({ message: '합의 보증금은 만원 단위 정수여야 합니다' })
  @Min(0, { message: '합의 보증금은 0 이상이어야 합니다' })
  @Max(MAX_MANWON, { message: '합의 보증금이 너무 큽니다' })
  agreedDeposit?: number | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt({ message: '합의 월세는 만원 단위 정수여야 합니다' })
  @Min(0, { message: '합의 월세는 0 이상이어야 합니다' })
  @Max(MAX_MANWON, { message: '합의 월세가 너무 큽니다' })
  agreedMonthlyRent?: number | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({}, { message: '입주일 형식이 올바르지 않습니다' })
  agreedMoveInDate?: string | null;
}
