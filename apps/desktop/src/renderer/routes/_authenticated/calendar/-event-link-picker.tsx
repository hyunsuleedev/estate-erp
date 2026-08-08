import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Search, X } from "lucide-react";
import type { CalendarEvent, Task } from "@estate-erp/api-client";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMoney, formatPhone } from "@/lib/format";
import { getStatusMeta } from "@/lib/status-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EntityChip } from "@/components/domain";

export type EventLinkKind =
  | "contact"
  | "property"
  | "listing"
  | "match"
  | "deal";

export interface LinkedEntity {
  id: string;
  label: string;
  sublabel?: string | null;
  /** listing 연결 시 상세 점프에 사용할 propertyId */
  propertyId?: string | null;
}

export type EventLinks = Record<EventLinkKind, LinkedEntity | null>;

export const EMPTY_EVENT_LINKS: EventLinks = {
  contact: null,
  property: null,
  listing: null,
  match: null,
  deal: null,
};

export const LINK_KIND_LABEL: Record<EventLinkKind, string> = {
  contact: "연락처",
  property: "매물",
  listing: "매물 조건",
  match: "매칭",
  deal: "거래",
};

/** CalendarEvent include 데이터를 폼 연결 상태로 변환 */
export function linksFromEvent(event: CalendarEvent): EventLinks {
  return {
    contact: event.contactId
      ? {
          id: event.contactId,
          label: event.contact?.name ?? "연락처",
          sublabel: event.contact?.phone
            ? formatPhone(event.contact.phone)
            : null,
        }
      : null,
    property: event.propertyId
      ? { id: event.propertyId, label: event.property?.site?.name ?? "매물" }
      : null,
    listing: event.listingId
      ? {
          id: event.listingId,
          label: event.listing
            ? [
                getStatusMeta("transactionType", event.listing.transactionType)
                  .label,
                event.listing.price ? formatMoney(event.listing.price) : null,
              ]
                .filter(Boolean)
                .join(" ")
            : "매물 조건",
          propertyId:
            event.propertyId ?? event.listingIntake?.propertyId ?? null,
        }
      : null,
    match: event.matchId
      ? {
          id: event.matchId,
          label: event.match
            ? `매칭 · ${getStatusMeta("matchStage", event.match.stage).label}`
            : "매칭",
        }
      : null,
    deal: event.dealId
      ? {
          id: event.dealId,
          label: event.deal
            ? `거래 · ${getStatusMeta("dealStage", event.deal.stage).label}`
            : "거래",
        }
      : null,
  };
}

/** 업무함의 업무를 일정 초안으로 옮길 때 CRM 연결 문맥도 함께 보존한다. */
export function linksFromTask(task: Task): EventLinks {
  const listingLabel = task.listing
    ? [
        getStatusMeta("transactionType", task.listing.transactionType).label,
        task.listing.price ? formatMoney(task.listing.price) : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "매물 조건";

  return {
    contact: task.contactId
      ? {
          id: task.contactId,
          label: task.contact?.name ?? "연락처",
          sublabel: task.contact?.phone
            ? formatPhone(task.contact.phone)
            : null,
        }
      : null,
    property: task.propertyId
      ? {
          id: task.propertyId,
          label:
            [task.property?.site?.name, task.property?.unit?.name]
              .filter(Boolean)
              .join(" ") || "매물",
        }
      : null,
    listing: task.listingId
      ? {
          id: task.listingId,
          label: listingLabel,
          propertyId:
            task.propertyId ??
            task.listing?.propertyId ??
            task.listingIntake?.propertyId ??
            null,
        }
      : null,
    match: task.matchId
      ? {
          id: task.matchId,
          label: task.match?.stage
            ? `매칭 · ${getStatusMeta("matchStage", task.match.stage).label}`
            : "매칭",
        }
      : null,
    deal: task.dealId
      ? {
          id: task.dealId,
          label: task.deal?.stage
            ? `거래 · ${getStatusMeta("dealStage", task.deal.stage).label}`
            : "거래",
        }
      : null,
  };
}

function propertyLabel(property: {
  site?: { name: string } | null;
  unit?: {
    name: string;
    dong?: { name: string; isPlaceholder?: boolean } | null;
  } | null;
}) {
  const dongName =
    property.unit?.dong && !property.unit.dong.isPlaceholder
      ? property.unit.dong.name
      : null;
  return [property.site?.name ?? "매물", dongName, property.unit?.name]
    .filter(Boolean)
    .join(" ");
}

function matchesNeedle(
  needle: string,
  ...values: Array<string | null | undefined>
) {
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

async function searchEntities(
  kind: EventLinkKind,
  query: string,
): Promise<LinkedEntity[]> {
  const needle = query.trim().toLowerCase();

  if (kind === "contact") {
    const result = await api.contacts.findAll({
      search: query.trim() || undefined,
      limit: 8,
    });
    return result.items.map((contact) => ({
      id: contact.id,
      label: contact.name,
      sublabel: contact.phone ? formatPhone(contact.phone) : null,
    }));
  }

  if (kind === "property") {
    const result = await api.properties.findAll({
      search: query.trim() || undefined,
      limit: 8,
    });
    return result.items.map((property) => ({
      id: property.id,
      label: propertyLabel(property),
      sublabel: property.site?.roadAddress ?? null,
    }));
  }

  if (kind === "listing") {
    const result = await api.listings.findAll({
      search: query.trim() || undefined,
      limit: 8,
    });
    return result.items.map((listing) => ({
      id: listing.id,
      label: listing.property ? propertyLabel(listing.property) : "매물 조건",
      sublabel: [
        getStatusMeta("transactionType", listing.transactionType).label,
        listing.price ? formatMoney(listing.price) : null,
      ]
        .filter(Boolean)
        .join(" "),
      propertyId: listing.propertyId,
    }));
  }

  if (kind === "match") {
    const matches = await api.matches.findAll();
    return matches
      .filter((match) =>
        matchesNeedle(
          needle,
          match.property?.site?.name,
          match.buyerRequirement?.contact?.name,
          getStatusMeta("matchStage", match.stage).label,
        ),
      )
      .slice(0, 8)
      .map((match) => ({
        id: match.id,
        label: `${match.property?.site?.name ?? "매칭"} · ${getStatusMeta("matchStage", match.stage).label}`,
        sublabel: match.buyerRequirement?.contact?.name
          ? `구매고객 ${match.buyerRequirement.contact.name}`
          : null,
      }));
  }

  const deals = await api.deals.findAll();
  return deals
    .filter((deal) =>
      matchesNeedle(
        needle,
        deal.property?.site?.name,
        deal.buyerContact?.name,
        deal.sellerContact?.name,
        getStatusMeta("dealStage", deal.stage).label,
      ),
    )
    .slice(0, 8)
    .map((deal) => ({
      id: deal.id,
      label: `${deal.property?.site?.name ?? getStatusMeta("transactionType", deal.transactionType).label} · ${getStatusMeta("dealStage", deal.stage).label}`,
      sublabel: deal.agreedPrice ? formatMoney(deal.agreedPrice) : null,
    }));
}

/**
 * 일정 다이얼로그의 CRM 연결 한 줄 — 연결돼 있으면 EntityChip(클릭 시 상세 점프) + 해제 버튼,
 * 없으면 검색 팝오버로 연결할 항목을 찾는다.
 */
export function EventLinkRow({
  kind,
  value,
  onChange,
}: {
  kind: EventLinkKind;
  value: LinkedEntity | null;
  onChange: (value: LinkedEntity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const navigate = useNavigate();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["calendar-event-link-search", kind, deferredQuery],
    queryFn: () => searchEntities(kind, deferredQuery),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <div className="-mx-2 flex min-h-9 items-center gap-2 rounded-md px-2 transition-colors hover:bg-muted/45">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">
        {LINK_KIND_LABEL[kind]}
      </span>

      {value ? (
        <div className="flex min-w-0 items-center gap-1">
          {kind === "match" ? (
            <button
              type="button"
              onClick={() => void navigate({ to: "/matches" })}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-2.5 text-xs transition-colors hover:bg-accent"
            >
              <span className="truncate font-medium text-foreground">
                {value.label}
              </span>
              {value.sublabel ? (
                <span className="truncate text-muted-foreground">
                  {value.sublabel}
                </span>
              ) : null}
            </button>
          ) : (
            <EntityChip
              kind={kind}
              id={value.id}
              label={value.label}
              sublabel={value.sublabel ?? undefined}
              propertyId={value.propertyId ?? undefined}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${LINK_KIND_LABEL[kind]} 연결 해제`}
            onClick={() => onChange(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            >
              <Plus className="size-3.5" />
              연결
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`${LINK_KIND_LABEL[kind]} 검색`}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto">
              {isFetching ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  검색 중…
                </div>
              ) : results.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  검색 결과가 없습니다.
                </div>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
                    )}
                  >
                    <span className="w-full truncate text-sm font-medium">
                      {item.label}
                    </span>
                    {item.sublabel ? (
                      <span className="w-full truncate text-xs text-muted-foreground">
                        {item.sublabel}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
