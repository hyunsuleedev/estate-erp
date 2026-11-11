/**
 * 앱이 준비된 뒤의 시작 순서. Electron에 의존하지 않는다(main.ts가 실제 동작을 넘긴다).
 *
 * 업데이트 확인을 창보다 먼저 시작한다. 창을 만들지 못하는 빌드(탭바 문서가 빠진
 * 빌드 등)도 고친 버전으로 스스로 올라갈 수 있어야 하기 때문이다. 창을 만들다 실패하면
 * 조용히 넘어가지 않고 알린 뒤 끝낸다.
 */
export interface StartupSteps {
  /** 창을 띄우기 전에 끝나야 하는 정리. 실패해도 시작은 계속한다. */
  prepare(): Promise<void>;
  checkForUpdates(): void;
  /** 문서 주소를 준비하고 메인 창을 만든다. 실패하면 던진다. */
  createWindow(): void;
  /** 창이 뜬 뒤에 시작하는 것(전화 연동 등). */
  startServices(): void;
  /** 시작하지 못했다. 사용자에게 알리고 앱을 끝낸다. */
  reportFailure(error: unknown): void | Promise<void>;
}

export async function runStartup(steps: StartupSteps): Promise<'started' | 'failed'> {
  try {
    await steps.prepare();
  } catch {
    // 정리는 다음 실행에서 다시 한다.
  }
  try {
    steps.checkForUpdates();
  } catch {
    // 업데이트 확인을 시작하지 못해도 앱은 뜬다.
  }
  try {
    steps.createWindow();
  } catch (error) {
    await steps.reportFailure(error);
    return 'failed';
  }
  steps.startServices();
  return 'started';
}
