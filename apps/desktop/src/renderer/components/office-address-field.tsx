import { useEffect, useId, useRef, useState } from 'react';
import type { OfficePostalAddress } from '@estate-erp/api-client';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { loadKakaoPostcode, type PostcodeResult } from '@/lib/kakao-postcode';

export function OfficeAddressField({
  value,
  onChange,
  disabled = false,
  legacyAddress,
}: {
  value: OfficePostalAddress | null;
  onChange: (value: OfficePostalAddress | null) => void;
  disabled?: boolean;
  legacyAddress?: string | null;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const detailInput = useRef<HTMLInputElement>(null);
  const selected = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const baseAddress =
    value?.roadAddress || value?.jibunAddress || legacyAddress || '';

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) {
        setLoading(false);
        setError('주소 검색 연결이 지연되고 있습니다. 다시 시도해 주세요.');
      }
    }, 15000);
    setLoading(true);
    setError('');
    void loadKakaoPostcode()
      .then((Postcode) => {
        if (!active || !host.current) return;
        host.current.replaceChildren();
        new Postcode({
          width: '100%',
          height: '100%',
          autoMapping: false,
          onresize: () => {
            if (active) {
              clearTimeout(timeout);
              setLoading(false);
              setError('');
            }
          },
          oncomplete: (data: PostcodeResult) => {
            if (!active) return;
            // Never use autoRoadAddress/autoJibunAddress: those can be guessed mappings.
            const roadAddress =
              data.roadAddress?.trim() ||
              (data.userSelectedType === 'R' ? data.address?.trim() : null) ||
              null;
            const jibunAddress =
              data.jibunAddress?.trim() ||
              (data.userSelectedType === 'J' ? data.address?.trim() : null) ||
              null;
            if (!roadAddress && !jibunAddress) {
              setError('검색 결과에서 기본주소를 선택해 주세요.');
              return;
            }
            onChangeRef.current({
              roadAddress,
              jibunAddress,
              zipCode: data.zonecode || null,
              buildingCode: data.buildingCode || null,
              detailAddress: null,
            });
            selected.current = true;
            setOpen(false);
          },
        }).embed(host.current);
      })
      .catch((reason) => {
        clearTimeout(timeout);
        if (active) {
          setLoading(false);
          setError(
            reason instanceof Error
              ? reason.message
              : '주소 검색을 불러오지 못했습니다.',
          );
        }
      });
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [open, attempt]);

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-address`}>사무소 주소</Label>
      <div className="flex items-start gap-2">
        <Input
          id={`${id}-address`}
          value={baseAddress}
          readOnly
          placeholder="주소 검색으로 선택해 주세요"
          className="h-10 flex-1 shadow-none"
          disabled={disabled}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={disabled}
            >
              <Search className="size-4" aria-hidden="true" />
              {baseAddress ? '주소 변경' : '주소 검색'}
            </Button>
          </DialogTrigger>
          <DialogContent
            className="gap-3 p-4 sm:max-w-xl"
            onCloseAutoFocus={(event) => {
              if (selected.current) {
                event.preventDefault();
                selected.current = false;
                detailInput.current?.focus();
              }
            }}
          >
            <DialogHeader className="pr-8">
              <DialogTitle>사무소 주소 검색</DialogTitle>
              <DialogDescription>
                도로명, 지번 또는 건물명으로 검색하세요.
              </DialogDescription>
            </DialogHeader>
            {loading && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" />
                주소 검색을 불러오는 중입니다.
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="space-y-3 rounded-md bg-muted p-4 text-sm"
              >
                <p>{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAttempt((v) => v + 1)}
                >
                  다시 시도
                </Button>
              </div>
            )}
            <div
              ref={host}
              className="h-[min(480px,60svh)] min-h-64 w-full overflow-hidden"
              aria-busy={loading}
            />
          </DialogContent>
        </Dialog>
      </div>
      {value && (
        <>
          {value.zipCode && (
            <p className="text-xs text-muted-foreground-strong">
              우편번호 {value.zipCode}
            </p>
          )}
          <Label htmlFor={`${id}-detail`} className="sr-only">
            상세주소
          </Label>
          <Input
            ref={detailInput}
            id={`${id}-detail`}
            value={value.detailAddress ?? ''}
            onChange={(event) =>
              onChange({ ...value, detailAddress: event.target.value || null })
            }
            placeholder="상세주소 (층·호수 등, 선택)"
            autoComplete="address-line2"
            className="h-10 shadow-none"
            disabled={disabled}
          />
        </>
      )}
      {!value && legacyAddress && (
        <p className="text-xs text-muted-foreground-strong">
          기존 주소입니다. 주소 검색으로 다시 선택하면 우편번호와 기본주소가
          구분되어 저장됩니다.
        </p>
      )}
      {baseAddress && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-0 text-xs text-muted-foreground"
          onClick={() => onChange(null)}
        >
          주소 삭제
        </Button>
      )}
    </div>
  );
}
