/**
 * Rule Engine — 공통 타입
 *
 * 설계 문서: docs/ai-employee-architecture.md
 *
 * Rule은 "조건이 참이 되면 Proposal을 생성하는 독립 단위"다.
 * - triggerType: schedule (cron) | event (EventEmitter2)
 * - evaluate(ctx): 조건 평가 → ProposalDraft[]
 *
 * 모든 Rule은 같은 Proposal 테이블에 쓰고, inbox UI는 그 테이블을 본다.
 * Phase 1: 법 기반 규칙만 (하드코딩 상수 사용).
 * Phase 2: 임계값 기반 규칙 (ctx.ruleConfig 읽어서 사용), 이벤트 기반 규칙.
 */

export type TrustTier = 'auto' | 'approval_required' | 'inform_only';

export type ProposalPriority = 'urgent' | 'normal' | 'low';

export type RuleTriggerType = 'schedule' | 'event';

/**
 * Rule 실행 시 주입되는 컨텍스트.
 *
 * 호환성 원칙: 필드 추가는 OK, 기존 필드 제거/변경은 NO.
 * Phase 2에 LLM 호출 헬퍼 등을 추가할 여지를 남겨둔다.
 */
export interface RuleContext {
  /** 이 실행이 대상으로 하는 사무소 */
  officeId: string;

  /** 실행 시각 (테스트 주입 용이성을 위해 ctx에 포함) */
  now: Date;

  /**
   * 이벤트 기반 규칙일 때 전달되는 이벤트 payload.
   * schedule 기반 규칙일 때는 undefined.
   */
  event?: {
    name: string;
    payload: Record<string, unknown>;
  };

  /**
   * DB에 저장된 Rule 레코드의 config.
   * 임계값 기반 규칙이 파라미터 읽는 용도.
   * 법 기반 규칙은 무시해도 됨 (이 필드가 없어도 동작해야 함).
   */
  ruleConfig?: Record<string, unknown>;

  /**
   * Proposal 타입별 trust tier 해석.
   * Office.agentTrustConfig 를 먼저 보고, 없으면 Rule이 넘긴 기본값 사용.
   */
  trustTierFor(proposalType: string, fallback: TrustTier): TrustTier;
}

/**
 * Rule이 evaluate()에서 반환하는 제안 초안.
 * ProposalService가 이 초안을 받아서 dedupe/저장/실행 트리거를 처리한다.
 */
export interface ProposalDraft {
  type: string;
  title: string;
  description: string;
  reasoning?: string;

  priority: ProposalPriority;
  /**
   * trustTier를 명시하지 않으면 Rule이 ctx.trustTierFor 로 결정해둔 값을 써야 한다.
   * 명시했으면 그 값이 우선이지만, trustTierFor를 거친 결과를 주는 것을 권장.
   */
  trustTier: TrustTier;

  actionType?: string;
  actionPayload?: Record<string, unknown>;

  // 컨텍스트 링크
  listingId?: string;
  propertyId?: string;
  contactId?: string;
  dealId?: string;
  contractId?: string;
  tenantId?: string;

  /** 만료까지 시간 (시간 단위). 미설정 시 Rule 기본값 or 무기한. */
  expiresInHours?: number;

  /**
   * 같은 dedupeKey로 pending/approved 상태 Proposal이 있으면 새 생성 skip.
   * 예: "ad_takedown:{externalListingId}" — 같은 광고에 중복 알림 방지.
   */
  dedupeKey?: string;
}

/**
 * Rule은 클래스로 구현한다. NestJS DI로 AgentModule에 등록.
 *
 * 구현 예:
 *   @Injectable()
 *   class AdTakedownRule implements Rule { ... }
 *
 * RuleEngineService가 모든 Rule을 RULE_REGISTRY 토큰으로 주입받아
 * triggerType에 따라 cron 등록 / EventEmitter 구독을 수행한다.
 */
export interface Rule {
  /** 코드 식별자. DB Rule.name과 1:1 대응. 예: "ad_takedown" */
  readonly name: string;

  /** 버전. Proposal.generatedBy에 "rule:{name}:{version}"으로 기록. */
  readonly version: string;

  /** UI 표시용 이름. DB seed 시 Rule.displayName에 기록. */
  readonly displayName: string;

  /** 사용자용 설명. DB seed 시 Rule.description에 기록. */
  readonly description?: string;

  /** 법 기반(true)이면 사용자가 config 편집 불가. 임계값 기반(false)이면 편집 가능. */
  readonly isSystem: boolean;

  /** 기본 활성 여부. 사무소는 DB Rule 레코드에서 끌 수 있음. */
  readonly defaultActive: boolean;

  readonly triggerType: RuleTriggerType;

  /** triggerType === 'schedule' 일 때 cron 표현식 */
  readonly schedule?: string;

  /** triggerType === 'event' 일 때 EventEmitter2 이벤트명 */
  readonly eventName?: string;

  /** 법 기반이면 빈 객체. 임계값 기반이면 사용자 편집 전 기본 config. */
  readonly defaultConfig?: Record<string, unknown>;

  /**
   * 조건을 평가해서 생성해야 할 제안의 초안을 반환한다.
   * 실제 저장/dedupe/실행은 ProposalService가 담당.
   */
  evaluate(ctx: RuleContext): Promise<ProposalDraft[]>;
}

/** NestJS DI 토큰 — 모든 Rule 구현체를 배열로 주입받을 때 사용 */
export const RULE_REGISTRY = Symbol('RULE_REGISTRY');
