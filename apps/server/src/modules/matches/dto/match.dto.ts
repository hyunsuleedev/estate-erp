import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export const MATCH_STAGES = [
  'suggested',
  'buyerContacted',
  'viewing',
  'ownerContacted',
  'negotiating',
  'dealCreated',
  'closed',
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
