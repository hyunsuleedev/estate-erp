import type { Prisma } from '@prisma/client';

/** 단지·주소·법정동 글에서 찾는 조건(낱말 하나) */
function siteTextWhere(token: string): Prisma.PropertyWhereInput[] {
  const contains = { contains: token, mode: 'insensitive' as const };
  return [
    { site: { name: contains } },
    { site: { roadAddress: contains } },
    { site: { jibunAddress: contains } },
    { site: { ward: { name: contains } } },
    { site: { ward: { district: { name: contains } } } },
    { site: { ward: { district: { province: { name: contains } } } } },
  ];
}

/**
 * 매물 검색어 → 조건. 낱말마다 단지·주소 글, 동 이름, 호 이름 가운데 하나에 맞아야 한다(낱말끼리는 AND).
 * "고덕그라시움 108동 1505호", "108동1505호", "108-1505", "1505"처럼 전화로 들은 그대로 찾게 한다.
 * (예전에는 단지·주소 글만 봐서 업무·일정의 매물 연결에서 동·호로 찾으면 결과가 없었다)
 */
export function buildPropertySearchWhere(search: string): Prisma.PropertyWhereInput | null {
  const normalized = search
    .normalize('NFKC')
    // 붙여 쓴 "108동1505호" → "108동 1505호", "108-1505" → "108 1505"
    .replace(/([A-Za-z]?\d+[A-Za-z]?)\s*(동|호)/g, ' $1$2 ')
    .replace(/(\d+)-(\d+)/g, '$1 $2')
    .trim();
  const tokens = normalized.split(/\s+/).filter(Boolean).slice(0, 6);
  if (tokens.length === 0) return null;
  const perToken = tokens.map((token): Prisma.PropertyWhereInput => {
    const or: Prisma.PropertyWhereInput[] = siteTextWhere(token);
    const dong = /^([A-Za-z]?\d+[A-Za-z]?)동$/.exec(token)?.[1];
    const ho = /^([A-Za-z]?\d+[A-Za-z]?)호$/.exec(token)?.[1];
    const bare = /^[A-Za-z]?\d+[A-Za-z]?$/.test(token) ? token : null;
    const dongNames = [dong, bare].filter((value): value is string => Boolean(value));
    const unitNames = [ho, bare].filter((value): value is string => Boolean(value));
    for (const name of dongNames) {
      or.push({ unit: { dong: { name: { in: [name, `${name}동`] } } } });
    }
    for (const name of unitNames) {
      or.push({ unit: { name: { in: [name, `${name}호`] } } });
    }
    return { OR: or };
  });
  return perToken.length === 1 ? perToken[0] : { AND: perToken };
}
