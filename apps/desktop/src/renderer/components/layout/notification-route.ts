import type { AppNotification } from "@estate-erp/api-client";

/**
 * 알림의 주소. 숨긴 화면(네트워크 등)으로 가는 알림은 주소를 주지 않는다 — 누르면 읽음만 된다.
 * 서버가 linkType을 주지 않는 알림은 type으로 정한다.
 */
export function notificationRoute(
  notification: Pick<AppNotification, "type" | "linkType" | "linkId">,
): string | null {
  const { type, linkType, linkId } = notification;
  const id = linkId ? encodeURIComponent(linkId) : null;
  switch (linkType) {
    case "property":
      return id ? `/properties/${id}` : "/properties";
    case "listing":
      return "/properties";
    case "deal":
      return id ? `/deals?dealId=${id}` : "/deals";
    case "task":
      // 업무 화면이 ?task=<id>를 받으면 그 업무의 수정 창을 바로 연다
      return id ? `/tasks?task=${id}` : "/tasks";
    case "match":
      return id ? `/wanted-properties?matchId=${id}` : "/wanted-properties";
    case "project":
      return id ? `/projects/${id}` : "/projects";
    case "contact":
      return id ? `/contacts/${id}` : "/contacts";
    case "my_ads":
      return "/properties/naver-my-ads";
    default:
      break;
  }
  // 네트워크(2차 기능, 메뉴에서 숨김)의 방·공유 매물 알림은 갈 곳이 없다.
  if (linkType?.startsWith("network") || type.startsWith("network")) return null;
  if (type === "task_assigned") return id ? `/tasks?task=${id}` : "/tasks";
  if (type === "verification_due") return "/properties";
  if (type === "advertisement_comparison_changed") return "/properties/naver-my-ads";
  return null;
}
