import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BuyerRequirement } from "@estate-erp/api-client";
import { EllipsisVertical, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";

export function CustomerDemandIntentActionMenu({
  requirementId,
  conditionLabel,
  onDeleted,
}: {
  requirementId: string;
  conditionLabel: string;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] =
    useState<BuyerRequirement | null>(null);

  const invalidateCustomerLedger = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
      queryClient.invalidateQueries({
        queryKey: ["brokerage-cases", "ledger"],
      }),
    ]);
  };

  const prepareDeleteMutation = useMutation({
    mutationFn: () => api.buyerRequirements.findOne(requirementId),
    onSuccess: (requirement) => {
      setDeleteCandidate(requirement);
      setMenuOpen(false);
      setDeleteOpen(true);
    },
    onError: () => toast.error("조건 정보를 불러오지 못했습니다."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.buyerRequirements.remove(requirementId),
    onSuccess: async () => {
      toast.success("구함 조건을 삭제했습니다.");
      setDeleteOpen(false);
      setDeleteCandidate(null);
      onDeleted?.();
      queryClient.removeQueries({
        queryKey: ["buyer-requirements", "detail", requirementId],
      });
      await invalidateCustomerLedger();
    },
    onError: () => toast.error("구함 조건 삭제에 실패했습니다."),
  });

  const holdMutation = useMutation({
    mutationFn: () => api.buyerRequirements.updateStatus(requirementId, "hold"),
    onSuccess: async () => {
      toast.success("구함 조건을 보류 상태로 전환했습니다.");
      setDeleteOpen(false);
      setDeleteCandidate(null);
      await invalidateCustomerLedger();
    },
    onError: () => toast.error("보류 상태 전환에 실패했습니다."),
  });

  const matchCount = deleteCandidate?.matches?.length ?? 0;
  const consultationCount = deleteCandidate?.consultations?.length ?? 0;
  const hasLinks = matchCount > 0 || consultationCount > 0;
  const actionPending = deleteMutation.isPending || holdMutation.isPending;

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (!open && prepareDeleteMutation.isPending) return;
          setMenuOpen(open);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${conditionLabel} 조건 작업 메뉴`}
            title="조건 작업 메뉴"
            className="h-full min-h-10 w-10 rounded-none text-muted-foreground/60 shadow-none transition-[color,background-color,opacity] duration-150 hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:text-foreground group-hover/customer-condition:text-muted-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground motion-reduce:transition-none"
          >
            <EllipsisVertical className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link
              to="/buyer-requirements/$id/edit"
              params={{ id: requirementId }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              조건 수정
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={prepareDeleteMutation.isPending}
            className="text-destructive focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault();
              prepareDeleteMutation.mutate();
            }}
          >
            {prepareDeleteMutation.isPending ? (
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            {prepareDeleteMutation.isPending
              ? "삭제 여부 확인 중"
              : "조건 삭제"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteCandidate(null);
        }}
        title={hasLinks ? "삭제 대신 보류 처리" : "구함 조건 삭제"}
        description={
          hasLinks
            ? `연결된 매칭 ${matchCount}건·상담 ${consultationCount}건이 있어 삭제할 수 없습니다. 이력을 보존하려면 보류 상태로 전환하세요.`
            : `${conditionLabel} 조건을 삭제합니다. 되돌릴 수 없습니다.`
        }
        confirmLabel={hasLinks ? "보류로 전환" : "삭제"}
        destructive={!hasLinks}
        loading={actionPending}
        onConfirm={() => {
          if (hasLinks) holdMutation.mutate();
          else deleteMutation.mutate();
        }}
      />
    </>
  );
}
