import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BuyerIntakeLifecycleStatus } from "@estate-erp/api-client";
import {
  CircleCheck,
  CirclePause,
  CirclePlay,
  EllipsisVertical,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";

const LIFECYCLE_ACTIONS: Array<{
  value: BuyerIntakeLifecycleStatus;
  label: string;
  Icon: typeof CirclePlay;
}> = [
  { value: "open", label: "진행중", Icon: CirclePlay },
  { value: "hold", label: "보류", Icon: CirclePause },
  { value: "closed", label: "종료", Icon: CircleCheck },
];

const LIFECYCLE_SUCCESS_MESSAGES: Record<BuyerIntakeLifecycleStatus, string> = {
  open: "구함 의뢰를 다시 진행합니다.",
  hold: "구함 의뢰를 보류했습니다.",
  closed: "구함 의뢰를 종료했습니다.",
};

export function CustomerDemandIntakeActionMenu({
  intakeId,
  lifecycleStatus,
  customerName,
  ordinal,
}: {
  intakeId: string;
  lifecycleStatus: BuyerIntakeLifecycleStatus;
  customerName: string;
  ordinal: number;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (nextStatus: BuyerIntakeLifecycleStatus) =>
      api.buyerIntakes.update(intakeId, { lifecycleStatus: nextStatus }),
    onSuccess: async (_intake, nextStatus) => {
      toast.success(LIFECYCLE_SUCCESS_MESSAGES[nextStatus]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["brokerage-cases", "ledger"],
        }),
        queryClient.invalidateQueries({ queryKey: ["buyer-intakes"] }),
      ]);
    },
    onError: () => toast.error("구함 의뢰 상태를 변경하지 못했습니다."),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={mutation.isPending}
          aria-label={`${customerName} 구함 의뢰 ${ordinal} 작업 메뉴`}
          title="의뢰 작업 메뉴"
          className="relative size-8 shrink-0 text-muted-foreground/60 shadow-none after:absolute after:-inset-1 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          {mutation.isPending ? (
            <Loader2
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <EllipsisVertical className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          의뢰 상태
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={lifecycleStatus}
          onValueChange={(value) => {
            const nextStatus = value as BuyerIntakeLifecycleStatus;
            if (nextStatus !== lifecycleStatus) mutation.mutate(nextStatus);
          }}
        >
          {LIFECYCLE_ACTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              disabled={mutation.isPending}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
