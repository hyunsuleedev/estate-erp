import { Link } from "@tanstack/react-router";
import type { BrokerageCase } from "@estate-erp/api-client";
import {
  Building2,
  EllipsisVertical,
  ListOrdered,
  Tag,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { openBrokerageCasePlan } from "./-brokerage-case-plan-store";

export function CustomerCaseActionMenu({
  brokerageCase,
  customerName,
  align = "end",
  className,
}: {
  brokerageCase: BrokerageCase;
  customerName: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const primary = brokerageCase.primaryParticipant;
  const hasCase = brokerageCase.brokerageCaseId !== null;
  const listingTargets = [
    ...new Map(
      brokerageCase.listingIntents.map(
        (line) => [line.propertyId, line] as const,
      ),
    ).values(),
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${customerName} 케이스 작업 메뉴`}
            title="케이스 작업 메뉴"
            className={cn(
              "size-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
              className,
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <EllipsisVertical className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="max-h-72 w-48"
          onClick={(event) => event.stopPropagation()}
        >
          {primary ? (
            <DropdownMenuItem asChild>
              <Link
                to="/contacts/$id"
                params={{ id: primary.contact.id }}
                className="min-w-0"
              >
                <UserRound className="size-3.5" />
                <span className="truncate">고객 정보 열기</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          {brokerageCase.demandIntents.map((line) => (
            <DropdownMenuItem key={line.requirementId} asChild>
              <Link
                to="/buyer-requirements/$id"
                params={{ id: line.requirementId }}
                className="min-w-0"
                title={line.contextLabel}
              >
                <Tag className="size-3.5" />
                <span className="truncate">
                  구함 {line.priorityRank} 상세 열기
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
          {listingTargets.map((line, index) => (
            <DropdownMenuItem key={line.propertyId} asChild>
              <Link
                to="/properties/$id"
                params={{ id: line.propertyId }}
                className="min-w-0"
                title={line.contextLabel}
              >
                <Building2 className="size-3.5" />
                <span className="truncate">매물 {index + 1} 열기</span>
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* 묶는 것은 사용자가 정한다. 건이 있으면 진행 계획을, 없으면 묶기를 연다. */}
          <DropdownMenuItem
            onSelect={() =>
              openBrokerageCasePlan(
                brokerageCase.brokerageCaseId
                  ? {
                      kind: "case",
                      caseId: brokerageCase.brokerageCaseId,
                      customerName,
                    }
                  : { kind: "bundle", row: brokerageCase, customerName },
              )
            }
          >
            <ListOrdered className="size-3.5" />
            <span className="truncate">
              {hasCase
                ? `진행 계획${brokerageCase.stepCount ? ` (${brokerageCase.stepCount}단계)` : ""}`
                : "건으로 묶기"}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
