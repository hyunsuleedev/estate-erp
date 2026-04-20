/**
 * 계약서 초안 전용 렌더러 — 한국 부동산 매매계약서 표준 양식 기반.
 */

import { useTranslation } from 'react-i18next';

const 한글숫자 = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const 단위 = ['', '십', '백', '천'];
const 만단위 = ['', '만', '억', '조'];

/** 만원 단위 정수 → 한글 금액 ("일십오억팔천만원整") */
function manwonToHangul(manwon: number | null | undefined): string {
  if (manwon == null || manwon === 0) return '';
  let num = manwon * 10000;
  if (num < 0) return '';

  const parts: string[] = [];
  let unitIdx = 0;

  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      const digits = String(chunk).split('').map(Number).reverse();
      digits.forEach((d, i) => {
        if (d !== 0) {
          chunkStr = 한글숫자[d] + 단위[i] + chunkStr;
        }
      });
      parts.unshift(chunkStr + 만단위[unitIdx]);
    }
    num = Math.floor(num / 10000);
    unitIdx += 1;
  }
  return parts.join('') + '원整';
}

/** 만원 단위 정수 → 영어 스펠아웃 금액 ("ONE BILLION FIVE HUNDRED EIGHTY MILLION WON ONLY") */
function manwonToEnglish(manwon: number | null | undefined): string {
  if (manwon == null || manwon === 0) return '';
  let num = manwon * 10000;
  if (num < 0) return '';

  const ones = [
    '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
    'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
  ];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

  const below1000 = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(`${ones[Math.floor(n / 100)]} HUNDRED`);
      n %= 100;
    }
    if (n >= 20) {
      parts.push(tens[Math.floor(n / 10)]);
      n %= 10;
      if (n > 0) parts.push(ones[n]);
    } else if (n > 0) {
      parts.push(ones[n]);
    }
    return parts.join(' ');
  };

  const scales = ['', 'THOUSAND', 'MILLION', 'BILLION', 'TRILLION'];
  const chunks: string[] = [];
  let idx = 0;
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      chunks.unshift(`${below1000(chunk)}${scales[idx] ? ' ' + scales[idx] : ''}`);
    }
    num = Math.floor(num / 1000);
    idx += 1;
  }
  return chunks.join(' ').trim() + ' WON ONLY';
}

function formatKRW(manwon: number | null | undefined, locale: string): string {
  if (manwon == null) return '';
  return new Intl.NumberFormat(locale === 'ko' ? 'ko-KR' : 'en-US').format(
    manwon * 10000,
  );
}

function formatDate(iso: string | null | undefined): {
  year: string;
  month: string;
  day: string;
} {
  if (!iso) return { year: '', month: '', day: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { year: '', month: '', day: '' };
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
  };
}

function Blank({ value, minWidth = '6rem' }: { value?: string; minWidth?: string }) {
  return (
    <span
      className="inline-block border-b border-foreground/40 px-1 text-center"
      style={{ minWidth }}
    >
      {value || '\u00A0'}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-foreground/10 py-1.5">
      <span className="w-28 shrink-0 text-[11px] font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 text-[13px]">{children}</span>
    </div>
  );
}

interface ContractDocumentData {
  transactionType?: string;
  totalPrice?: number;
  statedDeposit?: number;
  statedInterimPayment?: number;
  statedInterimDate?: string;
  statedBalance?: number;
  statedBalanceDate?: string;
  contractDate?: string;
  specialTerms?: string;
  _document?: {
    propertyAddress?: string;
    buildingStructure?: string;
    buildingUse?: string;
    landShareNumerator?: number;
    landShareDenominator?: number;
    landAreaM2?: number;
    exclusiveAreaM2?: number;
    encumbrance?: {
      maxDebtAmount?: number;
      creditor?: string;
    };
    sellerName?: string;
    sellerAddress?: string;
    sellerRrn?: string;
    sellerPhone?: string;
    buyerName?: string;
    buyerAddress?: string;
    buyerRrn?: string;
    buyerPhone?: string;
    handoverDate?: string;
  };
}

export function ContractDocumentPreview({
  proposedChanges,
}: {
  proposedChanges: Record<string, unknown>;
}) {
  const { t, i18n } = useTranslation('inbox');
  const isKo = i18n.language.startsWith('ko');
  const lang = isKo ? 'ko' : 'en';

  const data = proposedChanges as ContractDocumentData;
  const doc = data._document ?? {};

  const spelloutAmount = (amount?: number) =>
    isKo ? manwonToHangul(amount) : manwonToEnglish(amount);

  const totalWords = spelloutAmount(data.totalPrice);
  const depositWords = spelloutAmount(data.statedDeposit);
  const interimWords = spelloutAmount(data.statedInterimPayment);
  const balanceWords = spelloutAmount(data.statedBalance);

  const contractDate = formatDate(data.contractDate);
  const interimDate = formatDate(data.statedInterimDate);
  const balanceDate = formatDate(data.statedBalanceDate);
  const handoverDate = formatDate(doc.handoverDate);

  return (
    <div className="rounded-md border bg-background p-6 font-serif text-[13px] leading-relaxed text-foreground shadow-sm">
      {/* 제목 */}
      <h2 className="text-center text-lg font-bold tracking-wide">
        {t('contract.title')}
      </h2>
      <p className="mt-2 text-center text-[12px] text-muted-foreground">
        {t('contract.preamble')}
      </p>

      {/* 1. 부동산의 표시 */}
      <section className="mt-5">
        <h3 className="mb-2 text-[13px] font-bold">
          {t('contract.section1Title')}
        </h3>
        <Row label={t('contract.rows.address')}>
          <Blank value={doc.propertyAddress} minWidth="24rem" />
        </Row>
        <Row label={t('contract.rows.landCategory')}>
          {t('contract.rows.landCategoryValue')}
          <span className="ml-4 text-[11px] text-muted-foreground">
            {t('contract.rows.landShareLabel')}
          </span>{' '}
          <Blank
            value={
              doc.landShareDenominator
                ? t('contract.rows.landShareValue', {
                    numerator: doc.landShareNumerator ?? '',
                    denominator: doc.landShareDenominator,
                  })
                : undefined
            }
            minWidth="10rem"
          />
        </Row>
        <Row label={t('contract.rows.landArea')}>
          <Blank
            value={doc.landAreaM2 ? `${doc.landAreaM2} ㎡` : undefined}
            minWidth="8rem"
          />
        </Row>
        <Row label={t('contract.rows.buildingStructure')}>
          <Blank value={doc.buildingStructure} minWidth="8rem" />
          <span className="ml-4 text-[11px] text-muted-foreground">
            {t('contract.rows.buildingUse')}
          </span>{' '}
          <Blank value={doc.buildingUse} minWidth="12rem" />
        </Row>
        <Row label={t('contract.rows.exclusiveArea')}>
          <Blank
            value={doc.exclusiveAreaM2 ? `${doc.exclusiveAreaM2} ㎡` : undefined}
            minWidth="8rem"
          />
        </Row>
      </section>

      {/* 2. 계약내용 */}
      <section className="mt-6">
        <h3 className="mb-2 text-[13px] font-bold">
          {t('contract.section2Title')}
        </h3>
        <p className="mb-3 text-[12.5px]">
          <strong>{t('contract.articles.article1Title')}</strong>{' '}
          {t('contract.articles.article1Body')}
        </p>

        <div className="rounded-md border border-foreground/10">
          <Row label={t('contract.rows.totalPrice')}>
            <span className="font-semibold">{totalWords}</span>
            <span className="ml-2 text-[11px] text-muted-foreground">
              (₩{formatKRW(data.totalPrice, lang)})
            </span>
          </Row>
          <Row label={t('contract.rows.deposit')}>
            <span>{depositWords}</span>
            <span className="ml-2 text-[11px] text-muted-foreground">
              (₩{formatKRW(data.statedDeposit, lang)})
            </span>
            <span className="ml-2 text-[12px] text-muted-foreground">
              {t('contract.depositReceived')}
            </span>
          </Row>
          {data.statedInterimPayment != null && data.statedInterimPayment > 0 && (
            <Row label={t('contract.rows.interim')}>
              <span>{interimWords}</span>
              <span className="ml-2 text-[11px] text-muted-foreground">
                (₩{formatKRW(data.statedInterimPayment, lang)})
              </span>
              <span className="ml-2 text-[12px]">
                {isKo ? (
                  <>
                    <Blank value={interimDate.year} minWidth="3rem" />년{' '}
                    <Blank value={interimDate.month} minWidth="2rem" />월{' '}
                    <Blank value={interimDate.day} minWidth="2rem" />일에 지불한다.
                  </>
                ) : (
                  <>
                    shall be paid on{' '}
                    <Blank value={interimDate.year} minWidth="3rem" />-
                    <Blank value={interimDate.month} minWidth="2rem" />-
                    <Blank value={interimDate.day} minWidth="2rem" />.
                  </>
                )}
              </span>
            </Row>
          )}
          <Row label={t('contract.rows.balance')}>
            <span>{balanceWords}</span>
            <span className="ml-2 text-[11px] text-muted-foreground">
              (₩{formatKRW(data.statedBalance, lang)})
            </span>
            <span className="ml-2 text-[12px]">
              {isKo ? (
                <>
                  <Blank value={balanceDate.year} minWidth="3rem" />년{' '}
                  <Blank value={balanceDate.month} minWidth="2rem" />월{' '}
                  <Blank value={balanceDate.day} minWidth="2rem" />일에 지불한다.
                </>
              ) : (
                <>
                  shall be paid on{' '}
                  <Blank value={balanceDate.year} minWidth="3rem" />-
                  <Blank value={balanceDate.month} minWidth="2rem" />-
                  <Blank value={balanceDate.day} minWidth="2rem" />.
                </>
              )}
            </span>
          </Row>
        </div>

        <div className="mt-4 space-y-2 text-[12.5px] leading-relaxed">
          <p>
            <strong>{t('contract.articles.article2Title')}</strong>{' '}
            {t('contract.articles.article2Body')}{' '}
            {isKo ? (
              <>
                <Blank value={handoverDate.year} minWidth="3rem" />년{' '}
                <Blank value={handoverDate.month} minWidth="2rem" />월{' '}
                <Blank value={handoverDate.day} minWidth="2rem" />일로 한다.
              </>
            ) : (
              <>
                {' '}
                <Blank value={handoverDate.year} minWidth="3rem" />-
                <Blank value={handoverDate.month} minWidth="2rem" />-
                <Blank value={handoverDate.day} minWidth="2rem" />.
              </>
            )}
          </p>
          <p>
            <strong>{t('contract.articles.article3Title')}</strong>{' '}
            {t('contract.articles.article3Body')}
          </p>
          <p>
            <strong>{t('contract.articles.article4Title')}</strong>{' '}
            {t('contract.articles.article4Body')}
          </p>
          <p>
            <strong>{t('contract.articles.article5Title')}</strong>{' '}
            {t('contract.articles.article5Body')}
          </p>
          <p>
            <strong>{t('contract.articles.article6Title')}</strong>{' '}
            {t('contract.articles.article6Body')}
          </p>
        </div>
      </section>

      {/* 특약사항 */}
      {data.specialTerms && (
        <section className="mt-5">
          <h3 className="mb-2 rounded-sm bg-amber-50 px-2 py-1 text-[13px] font-bold dark:bg-amber-950/30">
            {t('contract.specialTermsTitle')}
          </h3>
          <div className="whitespace-pre-wrap rounded-md border border-amber-200 bg-amber-50/40 p-3 text-[12.5px] leading-relaxed dark:border-amber-900/40 dark:bg-amber-950/10">
            {data.specialTerms}
          </div>
        </section>
      )}

      {/* 서명 */}
      <section className="mt-6">
        <p className="mb-3 text-[12px] text-muted-foreground">
          {t('contract.signatureNote')}
        </p>
        <p className="mb-4 text-center text-[12.5px]">
          {isKo ? (
            <>
              <Blank value={contractDate.year} minWidth="3rem" />년{' '}
              <Blank value={contractDate.month} minWidth="2rem" />월{' '}
              <Blank value={contractDate.day} minWidth="2rem" />일
            </>
          ) : (
            <>
              <Blank value={contractDate.year} minWidth="3rem" />-
              <Blank value={contractDate.month} minWidth="2rem" />-
              <Blank value={contractDate.day} minWidth="2rem" />
            </>
          )}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 매도인 */}
          <div className="rounded-md border border-foreground/20 p-3">
            <div className="mb-2 text-[12px] font-bold">
              {t('contract.seller')}
            </div>
            <div className="space-y-1 text-[12px]">
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.address')}
                </span>
                <Blank value={doc.sellerAddress} minWidth="16rem" />
              </div>
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.rrn')}
                </span>
                <Blank value={doc.sellerRrn} minWidth="8rem" />
              </div>
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.phone')}
                </span>
                <Blank value={doc.sellerPhone} minWidth="8rem" />
              </div>
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.name')}
                </span>
                <Blank value={doc.sellerName} minWidth="8rem" />
                <span className="ml-auto text-muted-foreground">㊞</span>
              </div>
            </div>
          </div>

          {/* 매수인 */}
          <div className="rounded-md border border-foreground/20 p-3">
            <div className="mb-2 text-[12px] font-bold">
              {t('contract.buyer')}
            </div>
            <div className="space-y-1 text-[12px]">
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.address')}
                </span>
                <Blank value={doc.buyerAddress} minWidth="16rem" />
              </div>
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.rrn')}
                </span>
                <Blank value={doc.buyerRrn} minWidth="8rem" />
              </div>
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.phone')}
                </span>
                <Blank value={doc.buyerPhone} minWidth="8rem" />
              </div>
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {t('contract.party.name')}
                </span>
                <Blank value={doc.buyerName} minWidth="8rem" />
                <span className="ml-auto text-muted-foreground">㊞</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
