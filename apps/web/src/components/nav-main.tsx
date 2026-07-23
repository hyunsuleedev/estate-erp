import { useEffect, useState } from "react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { ALL_NAV_PATHS, type NavItem } from "@/components/layout/nav-config";

/**
 * nav-config의 그룹 1개를 렌더링.
 * active 판정: fuzzy 매치하되, 전체 네비 경로 중 더 구체적(긴) 경로가
 * 함께 매치되면 비활성 (예: /properties/external-listings 방문 시
 * "매물장"(/properties)이 아닌 "광고노트"만 활성).
 */
export function NavMain({ label, items }: { label: string; items: NavItem[] }) {
  const matchRoute = useMatchRoute();

  const isActivePath = (path: string) => {
    if (!matchRoute({ to: path, fuzzy: true })) return false;
    const hasMoreSpecificMatch = ALL_NAV_PATHS.some(
      (other) =>
        other !== path &&
        other.startsWith(`${path}/`) &&
        matchRoute({ to: other, fuzzy: true }),
    );
    return !hasMoreSpecificMatch;
  };

  // 부모와 자식이 같은 경로를 공유할 수 있으므로(예: 매물관리 ↔ 매물 목록 = /properties)
  // 자식이 활성인 동안 부모 버튼은 강조하지 않는다 — 가장 깊은 매치만 하이라이트.
  const isParentActive = (item: NavItem) =>
    isActivePath(item.path) &&
    !(item.children ?? []).some((child) => isActivePath(child.path));

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel className="h-7 px-2">{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.children && item.children.length > 0 ? (
            <NavItemWithChildren
              key={item.path}
              item={item}
              isParentActive={isParentActive(item)}
              isActivePath={isActivePath}
              // 라우트가 이 항목(또는 하위) 안에 있으면 하위 메뉴를 열어 활성 화면을 노출
              isRouteInside={
                !!matchRoute({ to: item.path, fuzzy: true }) ||
                item.children.some(
                  (child) => !!matchRoute({ to: child.path, fuzzy: true }),
                )
              }
            />
          ) : (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton
                asChild
                isActive={isActivePath(item.path)}
                tooltip={item.label}
              >
                <Link to={item.path}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** 하위 메뉴가 있는 항목 — 라우트 변경을 따라 열림 상태를 동기화한다. */
function NavItemWithChildren({
  item,
  isParentActive,
  isActivePath,
  isRouteInside,
}: {
  item: NavItem;
  isParentActive: boolean;
  isActivePath: (path: string) => boolean;
  isRouteInside: boolean;
}) {
  const [open, setOpen] = useState(isRouteInside);

  // 라우트가 항목 안으로 들어오면 열고, 벗어나면 닫는다 (수동 토글은 그 사이에서 유효)
  useEffect(() => {
    setOpen(isRouteInside);
  }, [isRouteInside]);

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        {/* 부모는 링크 — 아이콘 접힘 모드에서도 클릭으로 이동 가능해야 함 */}
        <SidebarMenuButton
          asChild
          isActive={isParentActive}
          tooltip={item.label}
        >
          <Link to={item.path}>
            <item.icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="data-[state=open]:rotate-90 transition-transform duration-200">
            <ChevronRight />
            <span className="sr-only">{item.label} 하위 메뉴 토글</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {(item.children ?? []).map((child) => (
              <SidebarMenuSubItem key={child.path}>
                <SidebarMenuSubButton
                  asChild
                  isActive={isActivePath(child.path)}
                >
                  <Link to={child.path}>
                    <span>{child.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
