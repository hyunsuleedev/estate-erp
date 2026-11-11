const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** Date → "2026-11-02(월) 14:30" (한국 시간) */
export function formatKstDateTime(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}(${WEEKDAYS[kst.getUTCDay()]}) ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/** 통화 시작부터의 시각 ms → "1:05" */
function formatOffset(ms: number) {
  const totalSec = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

export interface AnalysisPromptInput {
  calledAt: Date;
  direction: string;
  durationSec: number;
  contactName: string | null;
  /** seq는 받아쓰기 줄 번호다. 분석의 근거 줄(lines)이 이 번호를 가리킨다. */
  utterances: Array<{ seq: number; speaker: number; text: string; startMs: number }>;
  contextText: string;
  /** 이미 반영·무시한 제안 (다시 제안하지 않게) */
  resolvedSuggestions: Array<{ type: string; title: string; status: string }>;
}

export const SYSTEM_INSTRUCTION = `당신은 한국 부동산 중개사무소의 통화 기록을 정리하는 비서입니다.
통화 받아쓰기와 사무소 데이터를 보고, 상담 기록에 남길 요약과 중개사가 확인 후 반영할 업무 제안을 JSON 하나로만 답합니다.

원칙
- 받아쓰기는 숫자·단지명·동호수·이름·화자를 틀릴 수 있습니다. 사무소 데이터의 단지명과 비슷하게 들리면 그 단지로 보정하되, 확신이 없으면 제안하지 말고 checks에 남기세요.
- 받아쓰기 각 줄 앞의 [번호]가 줄 번호입니다. keyPoints·facts·checks의 lines에는 근거가 된 줄 번호를 1~3개 넣습니다. 받아쓰기에 없는 번호는 넣지 마세요.
- facts에는 통화에서 말한 값을 그대로 옮깁니다. 여러 값을 더하거나 계산하지 마세요.
- 통화에서 실제로 요청·약속·합의된 것만 제안합니다. 추측으로 제안하지 마세요.
- 매물·고객·매칭은 사무소 데이터에 있는 참조(P1, I1, L1, B1, R1, M1, S1 형식)로만 가리킵니다. 목록에 없으면 참조를 지어내지 말고 그 제안을 하지 마세요.
- 금액은 만원 단위 정수입니다. 15억 8천만 원 → 158000, 3억 → 30000, 월세 150만 원 → 150.
- 날짜·시각은 한국 시간 "YYYY-MM-DDTHH:mm", 시각을 모르면 "YYYY-MM-DD". "내일", "다음 주 화요일"은 통화 시각 기준으로 계산합니다.
- 면적은 평 단위 숫자입니다. "30평대" → 최소 30, 최대 39.
- 제안은 최대 6개, 같은 내용은 한 번만. "이미 처리한 제안"과 같은 내용은 다시 제안하지 마세요.
- 제목(title)은 화면에 보일 한 줄입니다. 누가·무엇을·언제가 드러나게 짧게 씁니다.
- evidence는 제안의 근거가 된 통화 원문을 짧게 그대로 옮깁니다.`;

export const OUTPUT_FORMAT = `응답 JSON 형식
{
  "summary": "누가 왜 전화했고 무엇이 정해졌는지 2~3문장",
  "keyPoints": [{ "text": "통화에서 나온 핵심 정보 한 줄 (단지·호수·가격·조건·일정 등 언급된 것만)", "lines": [근거 줄 번호] }],
  "facts": [{ "label": "무엇의 값인지 (예: 보유 현금, 예산 상한, 전세 만기)", "value": "통화에서 말한 값", "previous": "말하다 고쳤으면 고치기 전 값, 아니면 null", "lines": [근거 줄 번호] }],
  "checks": [{ "text": "중개사가 원문을 듣고 확인할 점 (잘못 들렸을 수 있는 이름·단지명·숫자, 등록된 연락처 이름과 다르게 들린 이름 등)", "lines": [근거 줄 번호] }],
  "customerNeed": "고객이 원하는 것 한 줄 (없으면 빈 문자열)",
  "callType": "매물문의 | 소유주연락 | 매물확인 | 세입자문의 | 가격협상 | 일정조율 | 계약관련 | 하자수리 | 업체통화 | 공동중개 | 기타",
  "sentiment": "positive | neutral | negative",
  "agentSpeaker": 중개사무소 직원 화자 번호 (모르면 null),
  "links": { "propertyRef": null, "intakeRef": null, "listingRef": null, "requirementRef": null, "matchRef": null },
  "suggestions": [
    { "type": "제안 종류", "title": "한 줄 제목", "evidence": "근거 원문", "data": { 종류별 내용 } }
  ]
}

facts: 금액·면적·층·동호수·날짜·기한처럼 숫자로 된 중요한 값만, 최대 10개. 없으면 []
checks: 확인할 점이 없으면 []
links: 이 통화가 주로 다룬 대상의 참조 (없으면 null)

제안 종류와 data
1. "task" — 할 일 (다시 전화, 서류 준비, 집주인에게 확인 요청 등)
   { "title": "", "dueDate": "날짜/시각 또는 null", "priority": "urgent|high|medium|low", "listingRef": null, "propertyRef": null, "requirementRef": null, "matchRef": null }
2. "calendar_event" — 날짜와 시각이 정해진 약속 (임장, 계약, 미팅)
   { "title": "", "start": "시각", "end": "시각 또는 null", "eventType": "viewing|contract|meeting|general", "listingRef": null, "propertyRef": null, "matchRef": null }
3. "buyer_requirement_create" — 손님이 새로 찾는 조건 (기존 요청 조건 R과 거래 유형·지역이 다를 때만)
   { "buyerIntakeRef": "B참조 또는 null", "transactionType": "sale|jeonse|monthly", "siteTypes": ["apartment|officetel|villa|house|commercial|land"], "priceMin": null, "priceMax": null, "depositMin": null, "depositMax": null, "monthlyRentMin": null, "monthlyRentMax": null, "areaMinPyeong": null, "areaMaxPyeong": null, "moveInDate": "YYYY-MM-DD 또는 null", "urgency": "urgent|normal|flexible", "siteRefs": ["S참조"], "memo": "지역·층·향 등 그 밖의 조건" }
4. "buyer_requirement_update" — 기존 요청 조건(R)이 바뀜. 바뀐 항목만 넣습니다.
   { "requirementRef": "R참조", (3번의 조건 항목 중 바뀐 것), "memoAppend": "덧붙일 메모 또는 null" }
5. "match_create" — 손님(R)이 목록의 우리 매물(L)에 관심을 보임
   { "requirementRef": "R참조", "listingRef": "L참조", "memo": null }
6. "match_stage" — 진행 중 매칭(M)이 다음 단계로 넘어감. 목록에 적힌 다음 단계만, 손님이 그 매물을 원하지 않으면 "closed"
   { "matchRef": "M참조", "stage": "buyerInterested|viewingConfirmed|viewing|negotiating|closed" }
7. "listing_confirm" — 집주인·의뢰인과 매물이 아직 유효한지 확인한 통화
   { "intakeRef": "I참조", "result": "alive|price_changed|unavailable", "priceChanges": [{ "listingRef": "L참조", "price": null, "deposit": null, "monthlyRent": null }], "memo": null }
   alive=그대로 진행, price_changed=가격이 바뀜(바뀐 가격을 priceChanges에), unavailable=팔렸거나 거둬들임`;

export function buildAnalysisPrompt(input: AnalysisPromptInput) {
  const directionText =
    input.direction === 'visit'
      ? '방문 상담 (사무소에서 고객과 마주 보고 나눈 대화 녹음)'
      : input.direction === 'outbound'
        ? '발신 (사무소가 상대방에게 건 전화)'
        : '수신 (상대방이 사무소로 건 전화)';
  const counterpart = input.contactName
    ? `${input.contactName} (등록된 연락처)`
    : '미등록 번호 — 연락처가 없으므로 buyer_requirement_*, match_*, listing_confirm은 제안하지 마세요';
  const transcript = input.utterances
    .map(
      (utterance) =>
        `[${utterance.seq}] ${formatOffset(utterance.startMs)} 화자${utterance.speaker}: ${utterance.text}`,
    )
    .join('\n');
  const resolved =
    input.resolvedSuggestions.length > 0
      ? input.resolvedSuggestions
          .map((item) => `- [${item.type}] ${item.title} (${item.status === 'accepted' ? '반영함' : '무시함'})`)
          .join('\n')
      : '없음';

  return `${OUTPUT_FORMAT}

[통화 정보]
- 통화 시각: ${formatKstDateTime(input.calledAt)} (한국 시간)
- 방향: ${directionText}
- 통화 길이: ${Math.round(input.durationSec / 60)}분
- 상대방: ${counterpart}

[사무소 데이터]
${input.contextText || '없음'}

[이미 처리한 제안 — 다시 제안하지 마세요]
${resolved}

[통화 받아쓰기]
${transcript}`;
}
