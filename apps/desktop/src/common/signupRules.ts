/**
 * 가입 화면과 main이 함께 쓰는 입력 규칙. 화면은 미리 알려 주고, main은 Auth0에
 * 보내기 전에 같은 규칙으로 다시 확인한다.
 */

/**
 * Auth0 DB 연결은 영문·숫자와 몇몇 기호를 1~30자로 받고 소문자로 바꿔 저장한다.
 * 그중 서버의 아이디 규칙(영문 소문자·숫자·`.`·`_`·`-`)과 겹치는 것만 받는다.
 */
export const SIGNUP_USERNAME_PATTERN = /^[a-z0-9._-]{1,30}$/;
export const SIGNUP_USERNAME_RULE =
  '아이디는 영문 소문자, 숫자, 마침표(.), 밑줄(_), 하이픈(-)으로 1~30자입니다.';

/** Auth0 비밀번호 정책 "good": 8자 이상, 네 종류 중 세 종류 이상. */
export const SIGNUP_PASSWORD_RULE =
  '비밀번호는 8자 이상이고, 영문 소문자·대문자·숫자·특수문자 중 3가지 이상을 넣어야 합니다.';

export const SIGNUP_NAME_MAX_LENGTH = 50;

/** Auth0가 소문자로 저장하므로 미리 소문자로 맞춘다. */
export function normalizeSignupUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidSignupUsername(username: string): boolean {
  return SIGNUP_USERNAME_PATTERN.test(username);
}

export function meetsSignupPasswordPolicy(password: string): boolean {
  if (password.length < 8) return false;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((kind) =>
    kind.test(password),
  ).length;
  return kinds >= 3;
}
