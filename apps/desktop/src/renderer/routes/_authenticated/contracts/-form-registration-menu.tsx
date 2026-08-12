/**
 * MySpider 문서관리 리본 "계약서등록" / "서식등록" 드롭다운.
 * 아파트·오피스텔 등 종별 × 매매·전세 등 거래유형을 고르면 해당 양식 스펙을 반환한다.
 */
import { ChevronDown, FilePlus2, FileStack } from 'lucide-react';
import {
  ANNEX_FORM_MENU_GROUPS,
  CONTRACT_FORM_MENU,
  type FormRegistrationSpec,
} from './-form-registration-catalog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function FormRegistrationMenu({
  onSelect,
  disabled,
  contractDisabled,
  annexDisabled,
  showContract = true,
  showAnnex = true,
}: {
  onSelect: (spec: FormRegistrationSpec) => void;
  disabled?: boolean;
  /** 거래가 없을 때 계약서 등록만 잠그고, 선택 계약의 서식 추가는 유지할 수 있다. */
  contractDisabled?: boolean;
  annexDisabled?: boolean;
  showContract?: boolean;
  showAnnex?: boolean;
}) {
  const isContractDisabled = contractDisabled ?? disabled;
  const isAnnexDisabled = annexDisabled ?? disabled;

  return (
    <div className="flex items-center gap-1.5">
      {showContract ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={isContractDisabled}>
              <FilePlus2 className="size-4" />
              계약서 등록
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[min(72vh,36rem)] min-w-56 overflow-y-auto"
          >
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              종별 · 거래유형을 고르면 해당 양식이 적용됩니다
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CONTRACT_FORM_MENU.map((group) =>
              group.items.length === 1 ? (
                <DropdownMenuItem
                  key={group.groupLabel}
                  onSelect={() => onSelect(group.items[0])}
                >
                  {group.items[0].title}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuSub key={group.groupLabel}>
                  <DropdownMenuSubTrigger>
                    {group.groupLabel}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {group.items.map((item) => (
                      <DropdownMenuItem
                        key={`${item.templateCode}-${item.transactionType}-${item.title}`}
                        onSelect={() => onSelect(item)}
                      >
                        <span className="flex w-full items-center justify-between gap-4">
                          <span>{item.tradeLabel}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {item.title.replace(`${group.groupLabel} `, '')}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {showAnnex ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isAnnexDisabled}>
              <FileStack className="size-4" />
              서식 등록
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[min(72vh,36rem)] min-w-64 overflow-y-auto"
          >
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              확인설명서 · 신고 · 동의 등 부속 서식
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ANNEX_FORM_MENU_GROUPS.map((group) => (
              <DropdownMenuSub key={group.groupLabel}>
                <DropdownMenuSubTrigger>
                  {group.groupLabel}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[min(70vh,34rem)] min-w-72 overflow-y-auto">
                  {group.items.map((item) => (
                    <DropdownMenuItem
                      key={`${item.cntrClsf}-${item.templateCode}-${item.title}`}
                      onSelect={() => onSelect(item)}
                    >
                      <span className="flex w-full items-start gap-2">
                        <span className="mt-0.5 w-6 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {item.cntrClsf}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal leading-snug">
                          {item.title}
                        </span>
                        {item.repeatable ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            여러 장
                          </span>
                        ) : null}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
