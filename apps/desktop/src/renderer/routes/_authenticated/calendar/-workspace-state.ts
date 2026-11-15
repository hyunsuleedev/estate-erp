import type { CalendarViewMode } from "./-calendar-view-utils";

export type CalendarWorkspaceState = {
  viewMode: CalendarViewMode;
  currentDate: string;
  selectedDate: string;
  scroll: Partial<Record<CalendarViewMode, number>>;
  monthViewport?: { start: string; offset: number };
};

export function readWorkspaceState(key: string): CalendarWorkspaceState {
  const initial: CalendarWorkspaceState = {
    viewMode: "month",
    currentDate: new Date().toISOString(),
    selectedDate: new Date().toISOString(),
    scroll: {},
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!saved || !["month", "week", "day", "agenda"].includes(saved.viewMode))
      return initial;
    if (
      !Number.isFinite(Date.parse(saved.currentDate)) ||
      !Number.isFinite(Date.parse(saved.selectedDate))
    )
      return initial;
    const scroll: CalendarWorkspaceState["scroll"] = {};
    for (const mode of ["month", "week", "day", "agenda"] as const) {
      const value = saved.scroll?.[mode];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0)
        scroll[mode] = value;
    }
    return {
      viewMode: saved.viewMode,
      currentDate: saved.currentDate,
      selectedDate: saved.selectedDate,
      scroll,
      monthViewport:
        saved.monthViewport &&
        Number.isFinite(Date.parse(saved.monthViewport.start)) &&
        Number.isFinite(saved.monthViewport.offset) &&
        saved.monthViewport.offset >= 0
          ? {
              start: saved.monthViewport.start,
              offset: saved.monthViewport.offset,
            }
          : undefined,
    };
  } catch {
    return initial;
  }
}

export function writeWorkspaceState(
  key: string,
  state: CalendarWorkspaceState,
) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* Storage can be unavailable. */
  }
}
