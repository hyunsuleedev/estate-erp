/**
 * 핸드폰 기본 통화 녹음 파일 이름에서 상대방과 통화 시각을 읽는다.
 *
 * 갤럭시 기본 통화 녹음 예:
 *   "통화 녹음 홍길동_241102_143012.m4a"
 *   "통화 녹음 010-1234-5678_241102_143012.m4a"
 *   "Call recording 01012345678_241102_143012.m4a"
 *   "홍길동_20241102143012.m4a"
 * 형식이 다르면 읽을 수 있는 값만 채우고 나머지는 null로 둔다.
 * 통화 시각은 한국 시간(KST)으로 해석한다.
 */
export interface ParsedCallRecordingFileName {
  /** 파일 이름에 적힌 상대방 (이름 또는 번호 원문) */
  counterpart: string | null;
  /** 상대방이 번호면 숫자만 남긴 번호 (01012345678) */
  phoneNumber: string | null;
  /** 통화 시각 */
  calledAt: Date | null;
}

const PREFIX_PATTERN = /^(?:통화\s*녹음|call[\s_-]*recording|record(?:ing)?)[\s_-]*/i;
const EXTENSION_PATTERN = /\.[a-z0-9]{2,5}$/i;

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DATE_TIME_PATTERNS: Array<{
  pattern: RegExp;
  read: (match: RegExpMatchArray) => DateTimeParts;
}> = [
  {
    // _241102_143012 (yyMMdd_HHmmss)
    pattern: /[_\s-](\d{2})(\d{2})(\d{2})[_\s-](\d{2})(\d{2})(\d{2})$/,
    read: (m) => parts(2000 + Number(m[1]), m[2], m[3], m[4], m[5], m[6]),
  },
  {
    // _20241102_143012 / _20241102143012 (yyyyMMdd HHmmss)
    pattern: /[_\s-](\d{4})(\d{2})(\d{2})[_\s-]?(\d{2})(\d{2})(\d{2})$/,
    read: (m) => parts(Number(m[1]), m[2], m[3], m[4], m[5], m[6]),
  },
  {
    // _241102143012 (yyMMddHHmmss)
    pattern: /[_\s-](\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
    read: (m) => parts(2000 + Number(m[1]), m[2], m[3], m[4], m[5], m[6]),
  },
  {
    // _2024-11-02 14-30-12 / _2024-11-02_14.30.12
    pattern: /[_\s-](\d{4})-(\d{2})-(\d{2})[_\s](\d{2})[-.:](\d{2})[-.:](\d{2})$/,
    read: (m) => parts(Number(m[1]), m[2], m[3], m[4], m[5], m[6]),
  },
];

function parts(
  year: number,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
): DateTimeParts {
  return {
    year,
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function toKstDate(value: DateTimeParts): Date | null {
  const { year, month, day, hour, minute, second } = value;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
  // 2월 30일처럼 넘어간 날짜는 버린다
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCMonth() !== month - 1 || kst.getUTCDate() !== day) return null;
  return date;
}

/** 번호처럼 보이면 숫자만 남긴 국내 번호로 바꾼다 (+82 10 → 010). */
export function phoneNumberFromText(text: string): string | null {
  if (!/^[+\d\s().-]+$/.test(text)) return null;
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('82') && text.trim().startsWith('+')) {
    digits = `0${digits.slice(2)}`;
  }
  return /^0\d{8,10}$/.test(digits) ? digits : null;
}

export function parseCallRecordingFileName(fileName: string): ParsedCallRecordingFileName {
  const base = fileName
    .split(/[\\/]/)
    .pop()!
    .replace(EXTENSION_PATTERN, '')
    .trim()
    .replace(PREFIX_PATTERN, '');

  let rest = base;
  let calledAt: Date | null = null;
  for (const { pattern, read } of DATE_TIME_PATTERNS) {
    const match = rest.match(pattern);
    if (!match) continue;
    calledAt = toKstDate(read(match));
    rest = rest.slice(0, match.index).trim();
    break;
  }

  const counterpart = rest.replace(/[_\s-]+$/, '').trim() || null;
  return {
    counterpart,
    phoneNumber: counterpart ? phoneNumberFromText(counterpart) : null,
    calledAt,
  };
}

/** 받아쓰기 업체가 받는 오디오 형식. 브라우저가 주는 MIME 대신 확장자를 우선한다. */
export function audioMimeTypeFromFileName(
  fileName: string,
  fallback?: string | null,
): string | null {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const byExtension: Record<string, string> = {
    m4a: 'audio/m4a',
    mp4: 'audio/m4a',
    aac: 'audio/aac',
    mp3: 'audio/mp3',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    flac: 'audio/flac',
    webm: 'audio/webm',
    aiff: 'audio/aiff',
  };
  if (extension && byExtension[extension]) return byExtension[extension];
  if (fallback === 'audio/x-m4a' || fallback === 'audio/mp4') return 'audio/m4a';
  if (fallback === 'audio/mpeg') return 'audio/mp3';
  if (fallback && fallback.startsWith('audio/') && fallback !== 'audio/amr') return fallback;
  return null;
}
