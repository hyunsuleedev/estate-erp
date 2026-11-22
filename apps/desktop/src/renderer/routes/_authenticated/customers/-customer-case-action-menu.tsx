import { Link } from "@tanstack/react-router";
import type { CustomerLedgerRow } from "@estate-erp/api-client";
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
import { openProjectPlan } from "./-project-plan-store";

export function CustomerCaseActionMenu({
  project,
  customerName,
  align = "end",
  className,
}: {
  project: CustomerLedgerRow;
  customerName: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const primary = project.primaryParticipant;
  const hasCase = project.projectId !== null;
  const listingTargets = [
    ...new Map(
      project.listingIntents.map(
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
          {project.demandIntents.map((line) => (
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
          {/* 묶는 것은 사용자가 정한다. 프로젝트가 있으면 진행 계획을, 없으면 묶기를 연다. */}
          <DropdownMenuItem
            onSelect={() =>
              openProjectPlan(
                project.projectId
                  ? {
                      kind: "case",
                      projectId: project.projectId,
                      customerName,
                    }
                  : { kind: "bundle", row: project, customerName },
              )
            }
          >
            <ListOrdered className="size-3.5" />
            <span className="truncate">
              {hasCase
                ? `진행 계획${project.stepCount ? ` (${project.stepCount}단계)` : ""}`
                : "프로젝트 열기"}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
