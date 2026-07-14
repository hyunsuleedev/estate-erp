import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * ContractParty 개인정보 컬럼 암호화 (AES-256-GCM).
 *
 * 레거시 MySpider 는 TPCT02S/TPCT28S 의 주민(법인)등록번호(Rsdt_Regi_No)와
 * 전화번호(Phne_No/Mov_Phne_No)를 암호화 저장했다 (legacy-spec §2.1(c), G4).
 * 현행도 동일하게 write-path 에서 암호화하고, 조회 시 복호화 후
 * 잔금일+15일 마스킹 정책을 적용한다.
 *
 * 저장 포맷: `enc:v1:` + base64(iv(12) + authTag(16) + ciphertext)
 * - prefix 로 암호화 여부를 판별하므로, 암호화 도입 이전에 평문으로 저장된
 *   행도 그대로 읽을 수 있다 (additive / 하위호환).
 *
 * 키: CONTRACT_PARTY_CRYPTO_KEY 환경변수 (임의 문자열 → SHA-256 32바이트 유도).
 * 미설정 시 dev 전용 fallback 키 사용 — 프로덕션에서는 반드시 설정할 것.
 * (cti-line-credential.util.ts 와 동일 패턴)
 */

const DEV_FALLBACK_KEY = 'dev-contract-party-crypto-key-change-in-production';

const ENCRYPTED_PREFIX = 'enc:v1:';

function deriveKey(): Buffer {
  const secret = process.env.CONTRACT_PARTY_CRYPTO_KEY || DEV_FALLBACK_KEY;
  return createHash('sha256').update(secret).digest();
}

export function isEncryptedContractPartyField(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/** null/빈 문자열은 그대로 통과, 이미 암호화된 값은 이중 암호화하지 않는다. */
export function encryptContractPartyField(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  if (isEncryptedContractPartyField(value)) {
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(value, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64')
  );
}

/**
 * 암호화 prefix 가 없는 값(레거시 평문 행)은 그대로 반환한다.
 * 복호화 실패(키 변경 등) 시 원본 유출 없이 null 을 반환한다.
 */
export function decryptContractPartyField(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  if (!isEncryptedContractPartyField(value)) {
    return value;
  }

  try {
    const buf = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
