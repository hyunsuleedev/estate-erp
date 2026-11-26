import { Input } from '@/components/ui/input';
import { describeManwonText, parseManwonText } from './-manwon-input';

// ── 만원 금액 칸 (매물 화면 공용) ───────────────────────────────

/**
 * 만원 단위 금액 입력칸. "15억", "15억 8천", "158000" 어느 쪽으로 넣어도 되고,
 * 읽은 값은 FieldRow 힌트(describeManwonText)로 바로 보여 준다.
 */
export function ManwonInput({
  value,
  onChange,
  placeholder = '예: 15억 8천',
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = !parseManwonText(value).valid;
  return (
    <Input
      {...props}
      type="text"
      autoComplete="off"
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export function manwonHint(value: string, empty?: string) {
  const described = describeManwonText(value, empty);
  return { hint: described.text, hintInvalid: described.invalid };
}
