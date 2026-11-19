import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Loader2, X } from "lucide-react";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { advertisementLocationLabel } from "./my-ads-location";
import { draftLines, type MyAdsRequestDrafts } from "./my-ads-modes";

/** 맡길 사람을 고르지 않음 = 담당자 없이 등록 (에이전트가 가져간다) */
const AGENT = "__agent__";

export type RequestSendOptions = {
  assignedToId: string | null;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  memo: string | null;
};

/**
 * 요청 보내기. 변경 요청 모드에서 표에 적어 둔 것을 한 번 보여 주고,
 * 맡길 사람 · 기한 · 메모를 한 번만 받아 전체에 적용한다. 여기서 "보내기"를 눌러야 업무가 생긴다.
 */
export function MyAdsRequestSendDialog({
  open,
  advertisements,
  drafts,
  isSending,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  /** 초안이 있는 광고 */
  advertisements: ListingAdvertisementWithListing[];
  drafts: MyAdsRequestDrafts;
  isSending: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (options: RequestSendOptions) => void;
}) {
  const [assignee, setAssignee] = useState(AGENT);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.findAll(),
    enabled: open,
    staleTime: 60_000,
  });
  const employees = (employeesQuery.data ?? []).filter(
    (employee) => employee.isActive !== false,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(84svh,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-[15px]">요청 보내기</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            광고마다 업무가 하나씩 생깁니다. 광고 값은 CP에서 처리된 뒤에 바뀝니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-3">
          <ul className="overflow-hidden rounded-lg border">
            {advertisements.map((advertisement) => (
              <li
                key={advertisement.id}
                className="flex items-baseline gap-3 border-b px-3 py-1.5 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate">
                  {advertisementLocationLabel(advertisement)}
                </span>
                <span className="shrink-0 text-right tabular-nums text-info">
                  {draftLines(advertisement, drafts[advertisement.id])
                    .map((line) =>
                      line.key === "readvertise" || line.key === "takedown"
                        ? line.label
                        : `${line.label} ${line.text}`,
                    )
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 grid gap-y-1.5">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center">
              <dt className="text-[13px] text-muted-foreground">맡길 사람</dt>
              <dd>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger className="h-8 w-56 text-[13px]" aria-label="맡길 사람">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AGENT}>에이전트 (담당자 없이 등록)</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </dd>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center">
              <dt className="text-[13px] text-muted-foreground">기한</dt>
              <dd className="flex items-center gap-1">
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-[13px] font-normal"
                      aria-label={dueDate ? `기한 ${formatDate(dueDate)}, 눌러서 변경` : "기한 정하기"}
                    >
                      <CalendarDays className="size-3.5 text-muted-foreground" />
                      {dueDate ? (
                        <span className="tabular-nums">{formatDate(dueDate)}</span>
                      ) : (
                        <span className="text-muted-foreground">기한 없음</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      defaultMonth={dueDate ?? today}
                      disabled={{ before: today }}
                      onSelect={(date) => {
                        setDueDate(date ?? undefined);
                        setIsCalendarOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {dueDate && (
                  <button
                    type="button"
                    aria-label="기한 비우기"
                    onClick={() => setDueDate(undefined)}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start">
              <dt className="pt-1.5 text-[13px] text-muted-foreground">메모</dt>
              <dd>
                <Textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  rows={2}
                  aria-label="메모"
                  placeholder="예: 집주인이 31.5억까지 조정 가능하다고 함"
                  className="min-h-0 text-[13px]"
                />
              </dd>
            </div>
          </dl>
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSending}
            onClick={() => onOpenChange(false)}
          >
            돌아가기
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSending || advertisements.length === 0}
            onClick={() =>
              onSend({
                assignedToId: assignee === AGENT ? null : assignee,
                dueDate: dueDate
                  ? `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`
                  : null,
                memo: memo.trim() || null,
              })
            }
          >
            {isSending && <Loader2 className="size-3.5 animate-spin" />}
            {advertisements.length}건 보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
