import { cn } from "@/lib/utils";

/**
 * 다시 읽다가 실패했을 때 붙이는 한 줄. 앞서 읽어 둔 내용은 그대로 보여 주되, 그것이 지금 값이 아닐 수
 * 있다는 것을 숨기지 않는다. 이 화면은 돌아올 때마다 다시 읽으므로(다른 탭에서 바뀐 것을 받으려고),
 * 그 읽기가 실패하면 조용히 예전 내용을 지금 것처럼 보여 주게 된다.
 */
export function RefreshFailedNote({
  what = "최신 내용을",
  onRetry,
  className,
}: {
  /** 무엇을 다시 읽지 못했는지. 조사까지 붙여 준다 ("최신 매칭을", "최신 코멘트를") */
  what?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <p
      role="status"
      data-refresh-failed
      className={cn("text-[12px] leading-[1.5] text-[#8f6b1f]", className)}
    >
      {what} 불러오지 못했습니다. 보이는 내용이 예전 것일 수 있습니다.{" "}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        onClick={onRetry}
      >
        다시 시도
      </button>
    </p>
  );
}
