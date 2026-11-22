/**
 * 프로젝트가 바뀐 것을 다른 탭에 알린다.
 *
 * 탭마다 화면과 데이터 캐시가 따로다. 한 탭에서 프로젝트를 고치거나 풀어도 다른 탭(목록, 이미 열어 둔
 * 상세)은 그 사실을 모른다. 그래서 프로젝트를 바꾼 탭이 BroadcastChannel로 알리고, 프로젝트를 보여 주는
 * 화면은 그 알림을 들으면 서버에서 다시 읽는다. 값을 실어 보내지 않는다: 알림은 "다시 읽어라"일 뿐이고,
 * 무엇이 맞는 값인지는 서버가 말한다.
 *
 * 같은 사람의 다른 탭까지만 닿는다. 다른 직원이 고친 것은 이 방법으로 오지 않는다.
 */
const CHANNEL_NAME = 'estate-erp:projects';

export interface ProjectSignal {
  /** changed: 프로젝트나 그 진행 계획 · 코멘트가 바뀜. removed: 프로젝트를 풂. */
  type: 'changed' | 'removed';
  /** 바뀐 프로젝트. 여럿을 한 번에 바꿨거나 새로 열었으면 null. */
  projectId: string | null;
  /** 보낸 탭. 한 탭 안에서 자기가 보낸 알림을 다시 듣지 않게 한다. */
  sender: string;
}

/** 이 탭의 이름. 탭(문서)마다 다르다. */
const SENDER = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function isProjectSignal(value: unknown): value is ProjectSignal {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Record<string, unknown>;
  return (
    (signal.type === 'changed' || signal.type === 'removed') &&
    (signal.projectId === null || typeof signal.projectId === 'string') &&
    typeof signal.sender === 'string'
  );
}

/** 다른 탭에 알린다. BroadcastChannel이 없는 환경에서는 조용히 넘어간다 (이 탭의 동작에는 영향이 없다). */
export function announceProjectChange(type: ProjectSignal['type'], projectId: string | null) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type, projectId, sender: SENDER } satisfies ProjectSignal);
  channel.close();
}

/**
 * 다른 탭이 보낸 알림을 듣는다. 돌려주는 함수를 부르면 그만 듣는다.
 * 이 탭이 보낸 것은 넘기지 않는다(같은 문서 안의 다른 채널에는 자기 알림도 오기 때문에 보낸 탭으로 가른다).
 */
export function listenToProjectChanges(handler: (signal: ProjectSignal) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (isProjectSignal(event.data) && event.data.sender !== SENDER) handler(event.data);
  };
  return () => channel.close();
}
