/** 창 제목에 붙는 제품 이름. 탭이 없을 때(로그인 화면 등)는 이것만 쓴다. */
export const APP_WINDOW_TITLE = '에스테잇플로우';

const MAX_WINDOW_TITLE_LENGTH = 120;

/**
 * 창 제목(작업 표시줄, Mission Control, 창 메뉴에 보이는 이름). 그 창에서 보고 있는 탭의
 * 제목을 앞에 둔다. 창의 화면(탭바 문서)의 <title>은 모든 창이 같으므로, 제목은 main이
 * 탭 상태로 정한다.
 */
export function windowTitleForTabs(
  state: {
    tabs: ReadonlyArray<{ id: string; title: string }>;
    activeTabId: string | null;
  } | null,
): string {
  const active = state?.tabs.find((tab) => tab.id === state.activeTabId);
  const title = active?.title.replace(/\s+/g, ' ').trim() ?? '';
  // '...'는 제목을 아직 모르는 탭의 자리표시다.
  if (!title || title === '...') return APP_WINDOW_TITLE;
  const shortened =
    title.length > MAX_WINDOW_TITLE_LENGTH
      ? `${title.slice(0, MAX_WINDOW_TITLE_LENGTH - 1)}…`
      : title;
  return `${shortened} — ${APP_WINDOW_TITLE}`;
}
