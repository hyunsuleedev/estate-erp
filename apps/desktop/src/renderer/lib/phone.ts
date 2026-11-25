import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Contact } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { phoneDigits } from '@/lib/phone-format';

/**
 * 전화번호 입력의 공용 도구. 정리·하이픈·자리 수 확인 같은 순수 함수는 phone-format.ts에 있고 여기서 함께 내보낸다.
 */
export {
  formatPhoneWhileTyping,
  isCompletePhone,
  phoneDigits,
  phoneInputProblem,
} from '@/lib/phone-format';

/** 이미 등록된 번호를 확인할 최소 자리 수(그보다 짧으면 묻지 않는다) */
export const PHONE_DUPLICATE_MIN_DIGITS = 7;

/**
 * 적고 있는 번호가 이미 다른 연락처의 번호인지 본다(서버 /contacts/search-by-phone, 정확히 같은 번호).
 * 치는 동안 매번 묻지 않도록 미뤄 둔 값으로 묻고, 연락처 추가·프로젝트 열기와 같은 캐시 키를 쓴다.
 */
export function useExistingContactByPhone(
  raw: string | null | undefined,
  { enabled = true, minDigits = PHONE_DUPLICATE_MIN_DIGITS }: { enabled?: boolean; minDigits?: number } = {},
): {
  digits: string;
  contact: Contact | null;
  isChecking: boolean;
  checkFailed: boolean;
  /** 화면에 보일 한 줄. 없으면 null */
  message: string | null;
} {
  const digits = phoneDigits(useDeferredValue(raw ?? ''));
  const active = enabled && digits.length >= minDigits;
  const query = useQuery({
    queryKey: ['contacts', 'search-by-phone', digits],
    queryFn: () => api.contacts.findByPhone(digits),
    enabled: active,
    staleTime: 30_000,
  });
  const contact = active ? (query.data?.[0] ?? null) : null;
  return {
    digits,
    contact,
    isChecking: active && query.isLoading,
    checkFailed: active && query.isError,
    message: contact
      ? `${formatPhone(digits)}은(는) 이미 ${contact.name}님의 번호입니다.`
      : null,
  };
}
