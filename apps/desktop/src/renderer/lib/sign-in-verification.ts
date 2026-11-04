import type { SignInResource, SignInSecondFactor } from '@clerk/react/types';

export type SignInCodeFactor = Exclude<SignInSecondFactor, { strategy: 'email_link' }>;

export function getSignInCodeFactor(
  signIn: Pick<SignInResource, 'status' | 'supportedSecondFactors'>,
): SignInCodeFactor | null {
  // Older Clerk instances report Device Trust as needs_second_factor too.
  if (signIn.status !== 'needs_second_factor' && signIn.status !== 'needs_client_trust') {
    return null;
  }
  const factors = signIn.supportedSecondFactors ?? [];
  return factors.find((factor) => factor.strategy === 'totp')
    ?? factors.find((factor) => factor.strategy === 'email_code')
    ?? factors.find((factor) => factor.strategy === 'phone_code')
    ?? factors.find((factor) => factor.strategy === 'backup_code')
    ?? null;
}

export function getCodeDeliveryParams(factor: SignInCodeFactor) {
  if (factor.strategy === 'email_code') {
    return { strategy: factor.strategy, emailAddressId: factor.emailAddressId };
  }
  if (factor.strategy === 'phone_code') {
    return { strategy: factor.strategy, phoneNumberId: factor.phoneNumberId };
  }
  return null;
}

export function getCodeVerificationParams(factor: SignInCodeFactor, value: string) {
  const code = value.trim();
  if (!code) throw new Error('인증 코드를 입력해 주세요.');
  return { strategy: factor.strategy, code };
}
