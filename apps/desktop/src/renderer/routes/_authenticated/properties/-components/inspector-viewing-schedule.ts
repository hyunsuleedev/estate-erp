/**
 * 매칭 방문 일정 저장 (매물 상세 패널 매칭·거래 탭).
 *
 * 일정 저장 → (필요하면) 임장 단계로 이동, 두 번의 요청이라 중간에 실패할 수 있다.
 * 일정만 저장되고 단계 변경이 실패한 뒤 다시 시도할 때 일정을 또 만들면 중복이 생긴다.
 * 매칭 캐시는 진행 중이던 이전 조회 응답이나 재조회 실패로 저장한 일정을 잃을 수 있으므로,
 * 저장한 일정 id를 매칭별로 따로 기억해(savedEventIds) 캐시와 상관없이 같은 일정을 고친다.
 * 기억은 단계 변경이 실패해 저장이 덜 끝났을 때만 남긴다. 다 끝나면 지워서, 그 방문이 지난 뒤
 * 새 방문을 잡을 때는 새 일정을 만든다(지난 방문 기록을 덮어쓰지 않는다).
 */

/** 일정은 저장됐지만 임장 단계로 바꾸지 못했다. 다시 시도해도 일정은 새로 만들지 않는다. */
export class ViewingStageMoveError extends Error {
  constructor(cause: unknown) {
    super(
      `방문 일정은 저장했지만 임장 단계로 바꾸지 못했습니다${
        cause instanceof Error && cause.message ? `: ${cause.message}` : ""
      }`,
    );
    this.name = "ViewingStageMoveError";
  }
}

export async function saveViewingSchedule<TEvent extends { id: string }>({
  matchId,
  upcomingEventId,
  savedEventIds,
  create,
  update,
  isNotFound,
  onSaved,
  moveStage,
}: {
  matchId: string;
  /** 매칭 캐시에서 찾은 다가오는 방문 일정 id (없으면 null) */
  upcomingEventId: string | null;
  /** 이 화면에서 저장한 일정 id (매칭 id → 일정 id). 호출부가 화면 수명 동안 유지한다. */
  savedEventIds: Map<string, string>;
  create: () => Promise<TEvent>;
  update: (eventId: string) => Promise<TEvent>;
  /** 기억해 둔 일정이 다른 곳에서 지워졌는지 판단 (그때만 새로 만든다) */
  isNotFound: (error: unknown) => boolean;
  /** 저장 직후 호출: 캐시 반영 등 */
  onSaved: (event: TEvent) => void;
  /** 임장 단계로 바꿔야 할 때만 넘긴다 */
  moveStage: (() => Promise<unknown>) | null;
}): Promise<TEvent> {
  const rememberedId = savedEventIds.get(matchId) ?? null;
  let saved: TEvent;
  if (upcomingEventId) {
    saved = await update(upcomingEventId);
  } else if (rememberedId) {
    try {
      saved = await update(rememberedId);
    } catch (error) {
      // 기억한 일정이 지워졌을 때만 새로 만든다. 네트워크 오류 등은 그대로 실패시켜
      // (서버에는 저장됐을 수 있으므로) 중복 생성을 피한다.
      if (!isNotFound(error)) throw error;
      savedEventIds.delete(matchId);
      saved = await create();
    }
  } else {
    saved = await create();
  }
  // 단계 변경까지 끝나기 전에는 기억해 둔다(그 사이 실패하면 다시 시도가 이 일정을 고친다).
  savedEventIds.set(matchId, saved.id);
  onSaved(saved);

  if (moveStage) {
    try {
      await moveStage();
    } catch (error) {
      throw new ViewingStageMoveError(error);
    }
  }
  // 다 끝났으면 잊는다. 계속 기억하면 이 방문이 지난 뒤 새 방문을 잡을 때 지난 일정을 덮어쓴다.
  savedEventIds.delete(matchId);
  return saved;
}
