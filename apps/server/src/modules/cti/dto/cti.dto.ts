import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CALL_LOG_STATUSES, CTI_VENDORS } from '@estate-erp/shared';

/**
 * CTI Bridge → Electron → 서버로 전달되는 통화 이벤트.
 * 와이어 계약: packages/shared/src/cti.ts CtiCallEvent (docs/CTI_BRIDGE_PLAN.md §4.1)
 */
export class CallEventDto {
  @IsIn(['ring', 'terminate', 'ctc_result'])
  type!: 'ring' | 'terminate' | 'ctc_result';

  @IsIn(CTI_VENDORS)
  vendor!: (typeof CTI_VENDORS)[number];

  /** 상대방(발신) 번호 */
  @IsString()
  @MaxLength(32)
  caller!: string;

  /** 착신 회선 번호 */
  @IsString()
  @MaxLength(32)
  callee!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lineId?: string;

  /** 통신사 통화 시퀀스 — CallLog dedupe 키 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  seqno?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsISO8601()
  occurredAt!: string;
}

export class UpdateCallLogDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  /** 통화 → 상담 전환 시 연결 */
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsIn(CALL_LOG_STATUSES)
  status?: (typeof CALL_LOG_STATUSES)[number];
}
