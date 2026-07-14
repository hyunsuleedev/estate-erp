import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * CtiLine 회선 자격증명 암호화 (AES-256-GCM).
 *
 * 레거시는 복호화된 회선 비밀번호를 클라이언트 DataTable에 상주시켰다(스펙 6장 3번).
 * 모던 설계: 서버만 복호화 가능. API 응답에 절대 포함하지 않고,
 * 발신 위임(cti.dial.request) 시에만 복호화해 WSS로 일회성 전달한다.
 *
 * 키: CTI_CREDENTIAL_KEY 환경변수 (임의 문자열 → SHA-256으로 32바이트 유도).
 * 미설정 시 dev 전용 fallback 키 사용 — 프로덕션에서는 반드시 설정할 것.
 */

const DEV_FALLBACK_KEY = 'dev-cti-credential-key-change-in-production';

export interface CtiLineCredential {
  /// 회선 계정 ID (레거시 Phne_Id)
  loginId?: string;
  /// 회선 비밀번호 (레거시 Phne_Pwd)
  password?: string;
  /// 인증키 (KT sKTPAuthKey 등)
  authKey?: string;
}

function deriveKey(): Buffer {
  const secret = process.env.CTI_CREDENTIAL_KEY || DEV_FALLBACK_KEY;
  return createHash('sha256').update(secret).digest();
}

export function encryptCtiCredential(credential: CtiLineCredential): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(credential), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv(12) + authTag(16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptCtiCredential(cipherText: string): CtiLineCredential {
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as CtiLineCredential;
}
