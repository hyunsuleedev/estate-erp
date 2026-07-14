import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 계약서 당사자 행 역할 — 레거시 TPCT02S.Cntr_Stat_Clsf 대응.
 * one(01): 매도/임대/양도측, two(02): 매수/임차/양수측, office(99): 중개사무소.
 */
export const CONTRACT_PARTY_SIDES = ['one', 'two', 'office'] as const;
export type ContractPartySide = (typeof CONTRACT_PARTY_SIDES)[number];

/** 식별번호 유형 — 레거시 Ownr_Clsf 대응 */
export const CONTRACT_PARTY_ID_TYPES = [
  'resident',
  'corporate',
  'foreign',
  'birth',
] as const;
export type ContractPartyIdType = (typeof CONTRACT_PARTY_ID_TYPES)[number];

/** 당사자별 대리인 (레거시 TPCT28S, 당사자당 최대 2명) */
export class ContractPartyAgentDto {
  /**
   * 기존 ContractParty 행 참조 (GET 응답의 id 라운드트립).
   * 마스킹('*')된 idNumber 를 되돌려 보낼 때 이 id 로 기존 행의 저장값을
   * 보존한다 — 위치(side+subId)가 아닌 불변 식별자 매칭.
   */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  /** "대리인" / "공동대리인" / 커스텀. 생략 시 순번에 따라 자동 라벨링 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  agentLabel?: string;

  @IsOptional()
  @IsIn(CONTRACT_PARTY_ID_TYPES)
  idType?: ContractPartyIdType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobilePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;
}

/** 계약서 당사자 1행 (본인 행). 대리인은 agents 로 중첩 전달 → 서버가 parentId 부여 */
export class ContractPartyDto {
  /**
   * 기존 ContractParty 행 참조 (GET 응답의 id 라운드트립).
   * 마스킹('*')된 idNumber 를 되돌려 보낼 때 이 id 로 기존 행의 저장값을
   * 보존한다 — 순서 변경/삭제에도 같은 사람의 원본이 유지된다.
   */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(CONTRACT_PARTY_SIDES)
  side!: ContractPartySide;

  /** 같은 side 내 순번 (1=대표). 생략 시 배열 순서대로 자동 부여 */
  @IsOptional()
  @IsInt()
  @Min(1)
  subId?: number;

  /** 표기 라벨 override ("갑", "전대인" 등). null이면 transactionType에서 유도 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(CONTRACT_PARTY_ID_TYPES)
  idType?: ContractPartyIdType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobilePhone?: string;

  /** 거래지분 "N분의 M" — 레거시 Tran_Stak_Silt/Per */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sharePercent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string;

  /** 고객 마스터 연동 (레거시 Cust_Id) — 반드시 같은 사무소의 Contact */
  @IsOptional()
  @IsUUID()
  contactId?: string;

  // ─── 사무소 행(side="office") 전용 ─────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(200)
  officeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  officeRegNo?: string;

  /** 공동중개 상대 사무소 참조 (레거시 Comm_Ofcr_Id) */
  @IsOptional()
  @IsUUID()
  partnerOfficeId?: string;

  /** 이 당사자의 대리인 (최대 2명, side=office 행은 불가) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ContractPartyAgentDto)
  agents?: ContractPartyAgentDto[];
}

/**
 * PUT /contracts/:id/parties — 전체 교체(replace) 방식.
 * 단일 트랜잭션으로 기존 당사자를 모두 삭제하고 전달된 목록을 다시 생성한다.
 */
export class ReplaceContractPartiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractPartyDto)
  parties!: ContractPartyDto[];
}
