/**
 * 업데이트 통로(updater:*)를 누가 쓸 수 있는지. Electron에 의존하지 않는다.
 *
 * 업데이트 안내는 보이는 화면이 그린다: 로그인 전에는 로그인 화면, 로그인 뒤에는 보고
 * 있는 탭 화면. 상태를 읽는 것은 앱 화면이면 되지만(뒤에 있는 탭 화면과 미리 띄워 둔
 * 화면도 안내를 그릴 준비를 한다), 확인·설치·닫기는 사용자가 지금 보고 있는 화면만
 * 요청할 수 있다. 뒤에 있는 화면이 앱을 다시 시작시키면 안 된다.
 */
export type UpdaterRequest =
  | 'getStatus'
  | 'getDismissed'
  | 'dismiss'
  | 'check'
  | 'install';

export type UpdaterSenderKind =
  /** 로그인 전의 창 화면. */
  | 'gate'
  /** 그 창에서 지금 보이는 탭의 화면. */
  | 'visible-tab'
  /** 뒤에 있는 탭의 화면, 미리 띄워 둔 화면. */
  | 'background-tab'
  /** 탭바 문서, 전화 팝업 층, 앱이 모르는 화면, main frame이 아닌 frame. */
  | 'other';

export function allowsUpdaterRequest(
  request: UpdaterRequest,
  sender: UpdaterSenderKind,
): boolean {
  if (sender === 'other') return false;
  if (request === 'getStatus' || request === 'getDismissed') return true;
  return sender === 'gate' || sender === 'visible-tab';
}
