/**
 * 언어를 바꾼 뒤 화면을 다시 불러오는 일 — 작성 중인 내용을 지우지 않게 미룬다.
 *
 * 언어는 화면을 불러올 때 한 번 정해지므로(./auto.ts) 바꾸면 열린 화면을 모두 다시 불러와야 한다.
 * 그런데 탭마다 화면이 따로 떠 있어서, 설정 탭에서 언어를 바꾸는 순간 다른 탭에서 쓰던 상담·등록 대화창의
 * 내용이 함께 사라진다(그 내용은 그 화면의 메모리에만 있다). 그래서 다시 불러오기 전에 탭을 버려도 되는지
 * 가리는 기준(features/tabs/lib/unsavedWork.ts — 열린 대화창·시트, 저장 전 변경 표시, 올리는 중인 파일)과
 * 저장 요청이 도는 중인지를 보고, 하나라도 있으면 그것이 끝날 때까지 기다린다. 기다리는 동안 그 화면은
 * 예전 언어로 남는다(언어가 잠깐 섞이는 쪽이 쓰던 글을 잃는 쪽보다 낫다).
 *
 * 화면(document)과 떨어져 있어 테스트할 수 있다. 실제 연결은 ./index.ts가 한다.
 */
import {
  ACTIVE_TRANSFER_SELECTOR,
  EXPLICIT_DIRTY_SELECTOR,
  TRANSIENT_EDITOR_SELECTOR,
} from '../features/tabs/lib/unsavedWork';

/** 이 화면을 버리면 사라지는 것이 있다는 표시 (탭을 버려도 되는지 가리는 기준과 같다) */
export const UNSAVED_WORK_SELECTOR = [TRANSIENT_EDITOR_SELECTOR, EXPLICIT_DIRTY_SELECTOR, ACTIVE_TRANSFER_SELECTOR].join(',');

export interface LocaleReloadDeps {
  /** 저장된 언어가 지금 화면의 언어와 여전히 다른가. 기다리는 사이 되돌렸으면 다시 불러올 까닭이 없다. */
  stillWanted(): boolean;
  /** 저장 요청이 도는 중인가 */
  isSaving(): boolean | Promise<boolean>;
  /** 열린 대화창·저장 전 변경·올리는 중인 파일이 있는가. 다시 불러오기 바로 앞에서 읽으므로 기다리지 않는 함수여야 한다. */
  hasUnsavedWork(): boolean;
  reload(): void;
  /** 화면이 바뀔 때마다(그리고 일정 간격으로) check를 부른다. 돌려준 함수로 멈춘다. */
  watch(check: () => void): () => void;
  /** 미루기 시작했다고 알린다. reloadNow는 사용자가 "지금 다시 불러오기"를 눌렀을 때 부른다. */
  onDeferred(reloadNow: () => void): void;
  /** 미루던 일이 끝났다(다시 불러오거나 그만둠) */
  onSettled(): void;
}

export function createLocaleReloader(deps: LocaleReloadDeps) {
  let stopWatching: (() => void) | null = null;
  let deferred = false;
  let checking = false;
  let again = false;

  const settle = () => {
    stopWatching?.();
    stopWatching = null;
    if (deferred) deps.onSettled();
    deferred = false;
  };

  const reloadNow = () => {
    settle();
    deps.reload();
  };

  async function check(): Promise<void> {
    // 확인하는 사이(저장 여부를 기다리는 동안) 또 불리면, 끝난 뒤 한 번 더 본다
    if (checking) {
      again = true;
      return;
    }
    checking = true;
    try {
      do {
        again = false;
        if (!deps.stillWanted()) {
          settle();
          return;
        }
        const saving = await deps.isSaving();
        // 기다리는 사이 언어를 되돌렸을 수 있다
        if (!deps.stillWanted()) {
          settle();
          return;
        }
        // 대화창은 맨 마지막에, 기다림 없이 읽는다 — 읽은 뒤 다시 불러오기까지 틈이 없어야 한다
        if (!saving && !deps.hasUnsavedWork()) {
          reloadNow();
          return;
        }
        if (!deferred) {
          deferred = true;
          deps.onDeferred(reloadNow);
        }
        stopWatching ??= deps.watch(() => void check());
      } while (again);
    } finally {
      checking = false;
    }
  }

  return {
    /** 저장된 언어가 바뀌었다: 다시 불러오거나, 작성 중인 것이 있으면 끝날 때까지 미룬다 */
    request: () => check(),
    /** 미루는 중인가 */
    isDeferred: () => deferred,
  };
}
