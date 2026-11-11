/**
 * refresh token을 OS 암호화(safeStorage)로 디스크에 둬도 되는가.
 *
 * Linux에서 비밀 저장소(gnome-libsecret, kwallet)가 없으면 Chromium은 `basic_text`로
 * 떨어져 고정된 비밀번호로 가리기만 한다. 암호화가 "된다"고 답하지만 평문과 다름없으므로
 * 그때는 디스크에 두지 않는다(세션은 이번 실행 동안 메모리에만 있다).
 */
export function canPersistWithSafeStorage(input: {
  encryptionAvailable: boolean;
  platform: string;
  /** Linux의 safeStorage.getSelectedStorageBackend() 값. 다른 OS는 null. */
  backend: string | null;
}): boolean {
  if (!input.encryptionAvailable) return false;
  if (input.platform === 'linux' && input.backend === 'basic_text') return false;
  return true;
}
