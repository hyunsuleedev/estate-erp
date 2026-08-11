import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
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
