import type { CalendarEvent } from "@estate-erp/api-client";

import { getEventSuperseded, getMatchClosure } from "./-event-meta";

/** 일정 제목에 붙이는 표시(닫힌 매칭의 앞날 일정)와 읽기용 글 */
export const MATCH_CLOSED_TAG = "매칭 종료";

/** 보조 기술·툴팁에 쓰는 제목 — 취소된 약속이면 그렇다고 말한다 */
export function eventTitleText(event: CalendarEvent, now?: Date): string {
  if (getMatchClosure(event, now)) return `${event.title} (${MATCH_CLOSED_TAG})`;
  const superseded = getEventSuperseded(event, now);
  return superseded ? `${event.title} (${superseded.label})` : event.title;
}

/**
 * 일정 제목. 닫힌 매칭에 걸린 앞날의 일정이면 줄을 긋고 '매칭 종료'를 붙인다
 * (중개사가 없는 약속을 보고 준비하지 않게). 감싸는 줄의 글자 크기·말줄임을 그대로 따른다.
 */
export function EventTitle({ event, now }: { event: CalendarEvent; now?: Date }) {
  if (!getMatchClosure(event, now)) {
    // 이미 끝난 거래의 앞날 일정: 줄은 긋지 않고(깨진 약속이 아니다) 흐리게, 거래의 단계(잔금 완료 · 정산 종료)를 붙인다
    const superseded = getEventSuperseded(event, now);
    if (!superseded) return <>{event.title}</>;
    return (
      <>
        <span className="text-muted-foreground">{event.title}</span>{" "}
        <span className="font-medium text-muted-foreground">{superseded.label}</span>
      </>
    );
  }
  return (
    <>
      <span className="text-muted-foreground line-through decoration-muted-foreground/60">
        {event.title}
      </span>{" "}
      <span className="font-medium text-muted-foreground no-underline">
        {MATCH_CLOSED_TAG}
      </span>
    </>
  );
}
