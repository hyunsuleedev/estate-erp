export type HitlPhase = 'awaiting_review' | 'agent_working' | 'approved';

export interface HitlActivity {
  id: string;
  actor: 'human' | 'agent' | 'system';
  title: string;
  detail: string;
  timeLabel: string;
}

export interface HitlPreviewState {
  phase: HitlPhase;
  revisionNo: number;
  contentHash: string;
  balanceDate: string;
  warningCount: number;
  instruction: string;
  lastInstruction: string | null;
  activity: HitlActivity[];
}

export type HitlPreviewAction =
  | { type: 'instruction_changed'; value: string }
  | { type: 'revision_requested' }
  | { type: 'agent_returned' }
  | { type: 'revision_approved' }
  | { type: 'reset' };

const INITIAL_ACTIVITY: HitlActivity[] = [
  {
    id: 'review-requested',
    actor: 'system',
    title: '사람 검토 요청',
    detail: '계약서 리비전 #4를 최종 책임자에게 전달했습니다.',
    timeLabel: '12분 전',
  },
  {
    id: 'validation-finished',
    actor: 'agent',
    title: '계약서 검증 완료',
    detail: '필수값 오류 0건, 확인이 필요한 주의사항 2건을 찾았습니다.',
    timeLabel: '13분 전',
  },
  {
    id: 'revision-created',
    actor: 'agent',
    title: '불변 리비전 생성',
    detail: '입력 자료를 바탕으로 계약서 리비전 #4를 생성했습니다.',
    timeLabel: '14분 전',
  },
  {
    id: 'session-started',
    actor: 'system',
    title: 'AI 실행 세션 시작',
    detail: 'contract-writer가 계약서 초안 작성 업무를 위임받았습니다.',
    timeLabel: '15분 전',
  },
];

export const INITIAL_HITL_PREVIEW_STATE: HitlPreviewState = {
  phase: 'awaiting_review',
  revisionNo: 4,
  contentHash:
    '8f2c19a7906bf4a468fe79bc3833f0d973e0454ef33451b4d03be1c4',
  balanceDate: '2026-09-01T00:00:00.000Z',
  warningCount: 2,
  instruction: '',
  lastInstruction: null,
  activity: INITIAL_ACTIVITY,
};

function appendActivity(
  state: HitlPreviewState,
  activity: HitlActivity,
): HitlActivity[] {
  return [activity, ...state.activity];
}

function demoContentHashForRevision(revisionNo: number): string {
  const seed =
    'c7b95f214ed96ef729f263a72602f36bc80c33d4758389bf4d18186ab4ea607';
  const offset = revisionNo % seed.length;
  const rotated = `${seed.slice(offset)}${seed.slice(0, offset)}`;
  return `${revisionNo.toString(16).padStart(8, '0')}${rotated.slice(8)}`;
}

function nextBalanceDate(current: string): string {
  const next = new Date(current);
  next.setUTCDate(next.getUTCDate() + 4);
  return next.toISOString();
}

export function hitlPreviewReducer(
  state: HitlPreviewState,
  action: HitlPreviewAction,
): HitlPreviewState {
  switch (action.type) {
    case 'instruction_changed':
      return { ...state, instruction: action.value };

    case 'revision_requested': {
      const instruction = state.instruction.trim();
      if (state.phase !== 'awaiting_review' || !instruction) return state;

      return {
        ...state,
        phase: 'agent_working',
        instruction: '',
        lastInstruction: instruction,
        activity: appendActivity(state, {
          id: `revision-request-${state.revisionNo}`,
          actor: 'human',
          title: `리비전 #${state.revisionNo + 1} 요청`,
          detail: instruction,
          timeLabel: '방금 전',
        }),
      };
    }

    case 'agent_returned':
      if (state.phase !== 'agent_working') return state;

      return {
        ...state,
        phase: 'awaiting_review',
        revisionNo: state.revisionNo + 1,
        contentHash: demoContentHashForRevision(state.revisionNo + 1),
        balanceDate: nextBalanceDate(state.balanceDate),
        warningCount: Math.max(0, state.warningCount - 1),
        activity: appendActivity(state, {
          id: `agent-return-${state.revisionNo + 1}`,
          actor: 'agent',
          title: `새 리비전 #${state.revisionNo + 1} 도착`,
          detail:
            '수정 지시를 반영하고 새 내용 해시로 고정했습니다. 사람의 재검토를 기다립니다.',
          timeLabel: '방금 전',
        }),
      };

    case 'revision_approved':
      if (state.phase !== 'awaiting_review') return state;

      return {
        ...state,
        phase: 'approved',
        activity: appendActivity(state, {
          id: `approved-${state.revisionNo}`,
          actor: 'human',
          title: `리비전 #${state.revisionNo} 승인`,
          detail: `최종 책임자가 현재 내용 해시 ${state.contentHash.slice(0, 10)}…를 확인하고 승인했습니다.`,
          timeLabel: '방금 전',
        }),
      };

    case 'reset':
      return {
        ...INITIAL_HITL_PREVIEW_STATE,
        activity: [...INITIAL_ACTIVITY],
      };
  }
}
