import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProposalDraft, ProposalPriority, Rule, RuleContext } from '../rule.types';

/**
 * TransactionReportDeadlineRule
 *
 * 법 기반 규칙. 부동산 거래신고 등에 관한 법률:
 *   - 제3조: 매매계약은 체결일부터 30일 이내 실거래가 신고 의무.
 *     지연/미신고 시 과태료 (최대 500만원).
 *   - 제6조의2 (주택 임대차 신고제, 2021.6.1 시행): 보증금 6,000만원 초과
 *     또는 월세 30만원 초과 주택 임대차 계약은 체결일부터 30일 이내 신고 의무.
 *     미신고 시 과태료.
 *
 * 판정 로직:
 *   status != 'cancelled' 인 Contract 중 contractDate 가 있고,
 *     (a) transactionType = 'sale'                        → 부동산 거래신고 대상
 *     (b) transactionType ∈ (jeonse, monthly)
 *         AND (보증금 > 6,000만원 OR 월세 > 30만원)        → 임대차 신고 대상
 *   인데 category='report' 인 ContractDocument 에 submittedAt 이 채워진 게
 *   하나도 없으면 신고 미완료로 본다.
 *
 *   보증금 해석: Contract.totalPrice 가 전세금(jeonse) / 월세 보증금(monthly)
 *   스냅샷이다 (ContractsService.resolveTotalPrice 참고).
 *
 * 단계별 알림 (계약일 기준 경과일 d):
 *   d ≥ 20:  'normal'  — 신고 준비 알림
 *   d ≥ 25:  'urgent'  — 기한 임박
 *   d > 30:  'urgent'  — "기한 경과 — 즉시 신고 필요"
 *
 * dedupe / 에스컬레이션:
 *   dedupeKey = `transaction_report_deadline:{contractId}` 로 계약당 1회만 생성.
 *   단계 상승은 expiresInHours 로 처리 — normal 제안은 urgent 단계 진입 시점에
 *   만료되도록 두어, pending 인 채 방치되면 다음 크론에서 urgent 로 재생성된다.
 *   (dedupe 는 pending/approved 상태만 막으므로 expired 후 재생성 가능)
 *
 * 노이즈 방지:
 *   기한 경과 건은 contractDate 가 overdueLookbackDays(기본 60일) 이내인 것만
 *   계속 알린다. 과거 레거시 데이터에 무한 알림 방지.
 */
@Injectable()
export class TransactionReportDeadlineRule implements Rule {
  private readonly logger = new Logger(TransactionReportDeadlineRule.name);

  readonly name = 'transaction_report_deadline';
  readonly version = 'v1';
  readonly displayName = '거래신고 기한 알림';
  readonly description =
    '매매(실거래가 신고) 및 주택 임대차(보증금 6천만 초과/월세 30만 초과) 계약의 30일 신고 기한을 추적하여 과태료를 방지한다.';

  readonly isSystem = true;
  readonly defaultActive = true;

  readonly triggerType = 'schedule' as const;
  // 매일 아침 07:00. LeaseExpiryRule(06:00) 과 NewExternalListingsRule(07:30) 사이.
  readonly schedule = '0 0 7 * * *';

  readonly defaultConfig = {
    /** 기한 경과 건을 계속 알릴 최대 경과일. 이보다 오래된 계약은 무시. */
    overdueLookbackDays: 60,
  };

  /** 법정 신고 기한 (계약일 + 30일) */
  private static readonly REPORT_DEADLINE_DAYS = 30;
  /** normal 알림 시작 (계약일 + 20일) */
  private static readonly NORMAL_AFTER_DAYS = 20;
  /** urgent 격상 (계약일 + 25일) */
  private static readonly URGENT_AFTER_DAYS = 25;
  /** 임대차 신고 대상 보증금 기준 (만원). 초과 시 대상. */
  private static readonly LEASE_DEPOSIT_THRESHOLD = 6000;
  /** 임대차 신고 대상 월세 기준 (만원). 초과 시 대상. */
  private static readonly LEASE_RENT_THRESHOLD = 30;
  /** 임대차 신고 대상 거래유형 */
  private static readonly LEASE_TYPES = ['jeonse', 'monthly'];

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const config = { ...this.defaultConfig, ...(ctx.ruleConfig ?? {}) };
    const overdueLookbackDays =
      Number(config.overdueLookbackDays) ||
      this.defaultConfig.overdueLookbackDays;

    const msPerDay = 86_400_000;
    const normalCutoff = new Date(
      ctx.now.getTime() -
        TransactionReportDeadlineRule.NORMAL_AFTER_DAYS * msPerDay,
    );
    const lookbackCutoff = new Date(
      ctx.now.getTime() - overdueLookbackDays * msPerDay,
    );

    // 신고 미완료 + 계약일 20일 경과 계약 조회.
    // category='report' 문서에 submittedAt 이 채워져 있으면 신고 완료로 본다.
    const contracts = await this.prisma.contract.findMany({
      where: {
        officeId: ctx.officeId,
        status: { not: 'cancelled' },
        transactionType: {
          in: ['sale', ...TransactionReportDeadlineRule.LEASE_TYPES],
        },
        contractDate: { gte: lookbackCutoff, lte: normalCutoff },
        documents: {
          none: { category: 'report', submittedAt: { not: null } },
        },
      },
      include: {
        deal: { select: { id: true, listingId: true } },
        buyerContact: { select: { name: true } },
        sellerContact: { select: { name: true } },
      },
      orderBy: { contractDate: 'asc' },
    });

    const drafts: ProposalDraft[] = [];
    for (const contract of contracts) {
      if (!contract.contractDate) continue;

      const isSale = contract.transactionType === 'sale';
      if (!isSale && !this.isLeaseReportTarget(contract)) continue;

      const daysElapsed = Math.floor(
        (ctx.now.getTime() - contract.contractDate.getTime()) / msPerDay,
      );
      if (daysElapsed < TransactionReportDeadlineRule.NORMAL_AFTER_DAYS) {
        continue;
      }

      const daysLeft =
        TransactionReportDeadlineRule.REPORT_DEADLINE_DAYS - daysElapsed;
      const deadline = new Date(
        contract.contractDate.getTime() +
          TransactionReportDeadlineRule.REPORT_DEADLINE_DAYS * msPerDay,
      );

      drafts.push(
        this.buildDraft(ctx, {
          contract,
          isSale,
          daysElapsed,
          daysLeft,
          deadline,
        }),
      );
    }

    this.logger.log(
      `TransactionReportDeadlineRule office=${ctx.officeId}: ${drafts.length} proposals from ${contracts.length} candidate contracts`,
    );
    return drafts;
  }

  /**
   * 주택 임대차 신고 대상 판정.
   * Contract.totalPrice = 전세금/월세 보증금 스냅샷, monthlyRent = 월세.
   */
  private isLeaseReportTarget(contract: {
    transactionType: string;
    totalPrice: number;
    monthlyRent: number | null;
  }): boolean {
    if (
      !TransactionReportDeadlineRule.LEASE_TYPES.includes(
        contract.transactionType,
      )
    ) {
      return false;
    }
    const deposit = contract.totalPrice ?? 0;
    const rent = contract.monthlyRent ?? 0;
    return (
      deposit > TransactionReportDeadlineRule.LEASE_DEPOSIT_THRESHOLD ||
      rent > TransactionReportDeadlineRule.LEASE_RENT_THRESHOLD
    );
  }

  private buildDraft(
    ctx: RuleContext,
    input: {
      contract: {
        id: string;
        transactionType: string;
        totalPrice: number;
        monthlyRent: number | null;
        contractDate: Date | null;
        dealId: string;
        deal: { id: string; listingId: string | null } | null;
        buyerContact: { name: string } | null;
        sellerContact: { name: string } | null;
      };
      isSale: boolean;
      daysElapsed: number;
      daysLeft: number;
      deadline: Date;
    },
  ): ProposalDraft {
    const { contract, isSale, daysElapsed, daysLeft, deadline } = input;

    const reportName = isSale ? '부동산 거래신고' : '주택 임대차 신고';
    const typeLabel = this.transactionTypeLabel(contract.transactionType);
    const overdue = daysLeft < 0;
    const priority: ProposalPriority =
      overdue || daysElapsed >= TransactionReportDeadlineRule.URGENT_AFTER_DAYS
        ? 'urgent'
        : 'normal';

    const seller = contract.sellerContact?.name ?? '매도/임대인';
    const buyer = contract.buyerContact?.name ?? '매수/임차인';
    const contractYmd = this.toYmd(contract.contractDate!);
    const deadlineYmd = this.toYmd(deadline);
    const dday = overdue ? `D+${-daysLeft}` : `D-${daysLeft}`;

    const title = overdue
      ? `[기한 경과] ${reportName} 즉시 신고 필요 — ${typeLabel} 계약 (${seller} ↔ ${buyer})`
      : `[${dday}] ${reportName} 기한 임박 — ${typeLabel} 계약 (${seller} ↔ ${buyer})`;

    const legalBasis = isSale
      ? `부동산 거래신고 등에 관한 법률 제3조 — 매매계약 체결일부터 30일 이내 실거래가 신고 의무. 지연·미신고 시 과태료 (최대 500만원).`
      : `부동산 거래신고 등에 관한 법률 제6조의2 (주택 임대차 신고제) — 보증금 6,000만원 초과 또는 월세 30만원 초과 임대차 계약은 체결일부터 30일 이내 신고 의무. 미신고 시 과태료.`;

    const amountLine = isSale
      ? `거래금액 ${this.formatManWon(contract.totalPrice)}`
      : `보증금 ${this.formatManWon(contract.totalPrice)}${
          contract.monthlyRent ? ` / 월세 ${contract.monthlyRent}만원` : ''
        }`;

    const description = overdue
      ? `기한 경과 — 즉시 신고 필요.\n` +
        `계약일 ${contractYmd} 기준 신고 기한(${deadlineYmd})이 ${-daysLeft}일 지났습니다.\n` +
        `${amountLine}\n` +
        `category='report' 제출 완료 문서가 없습니다. 지금 바로 신고하고 접수증을 등록하세요.`
      : `계약일 ${contractYmd} → 신고 기한 ${deadlineYmd} (${dday}).\n` +
        `${amountLine}\n` +
        `아직 신고 접수 완료(제출일 기록) 문서가 없습니다. 기한 내 신고를 완료하세요.`;

    const reasoning =
      `${legalBasis} 계약일 ${contractYmd}, 신고 기한 ${deadlineYmd}, 현재 ${dday}` +
      ` (경과 ${daysElapsed}일). 해당 계약에 제출 완료된 신고 문서(category='report', submittedAt)가 없음.`;

    return {
      type: 'transaction_report_deadline',
      title,
      description,
      reasoning,
      priority,
      trustTier: ctx.trustTierFor(
        'transaction_report_deadline',
        'approval_required',
      ),
      actions: [
        {
          tool: 'create_task',
          args: {
            title: `${reportName} 제출 — ${typeLabel} 계약 (${seller} ↔ ${buyer}, 기한 ${deadlineYmd})`,
            content:
              `${legalBasis}\n계약일: ${contractYmd}\n신고 기한: ${deadlineYmd} (${dday})\n${amountLine}\n` +
              `신고 완료 후 계약 문서함에 신고필증(category='report')을 제출 처리하세요.`,
            category: 'document',
            priority: priority === 'urgent' ? 'urgent' : 'high',
            dueDate: deadline.toISOString(),
            contractId: contract.id,
          },
        },
      ],
      dealId: contract.dealId,
      contractId: contract.id,
      listingId: contract.deal?.listingId ?? undefined,
      expiresInHours: this.expiresInHours(daysElapsed, overdue),
      dedupeKey: `transaction_report_deadline:${contract.id}`,
    };
  }

  /**
   * 단계 에스컬레이션용 만료 시간.
   *   normal  → urgent 단계 진입(D+25) 시점에 만료
   *   urgent  → 기한 경과(D+31) 시점에 만료
   *   overdue → 3일 후 만료 (신고될 때까지 3일 주기로 재알림)
   */
  private expiresInHours(daysElapsed: number, overdue: boolean): number {
    if (overdue) return 72;
    if (daysElapsed >= TransactionReportDeadlineRule.URGENT_AFTER_DAYS) {
      return Math.max(
        24,
        (TransactionReportDeadlineRule.REPORT_DEADLINE_DAYS +
          1 -
          daysElapsed) *
          24,
      );
    }
    return Math.max(
      24,
      (TransactionReportDeadlineRule.URGENT_AFTER_DAYS - daysElapsed) * 24,
    );
  }

  private transactionTypeLabel(transactionType: string): string {
    switch (transactionType) {
      case 'sale':
        return '매매';
      case 'jeonse':
        return '전세';
      case 'monthly':
        return '월세';
      default:
        return transactionType;
    }
  }

  private toYmd(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** 만원 단위 → "N.N억" / "N만원" 한국식 표기 */
  private formatManWon(manWon: number | null): string {
    if (manWon == null) return '금액 미상';
    if (manWon >= 10000) {
      const eok = manWon / 10000;
      return `${eok.toFixed(eok % 1 === 0 ? 0 : 1)}억`;
    }
    return `${manWon}만원`;
  }
}
