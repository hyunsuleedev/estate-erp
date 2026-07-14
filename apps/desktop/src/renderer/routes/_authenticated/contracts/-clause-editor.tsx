/**
 * 조항 임베디드 제네릭 렌더러 — CLAUSE_LAYOUTS(ClauseArticle[]) + engineFields +
 * printOptions 를 받아 조항을 렌더한다 (document-hub-editor-plan.md §4.2 하이브리드 b′).
 *
 * - 값 라우팅: fieldKey 가 printOptions boolean 키(isContractPrintOptionFieldKey)면
 *   printOptions 에서, 아니면 engineFields(string 관례)에서 읽고 쓴다 —
 *   읽기는 shared getClauseFieldValue 가 'true'/'' 로 통일.
 * - 행 가시성: isClauseRowVisible (현 임차보증금 토글 / 제2조 직접입력).
 * - readOnly(프리뷰) 모드: 같은 레이아웃을 읽기 전용으로 렌더해 편집면=인쇄면.
 *   편집용 컨트롤(check 토글·receipt 버튼)은 인쇄면에서 제외한다.
 *   공란인쇄의 실제 인쇄 반영(빈 값 행 유지 ≠)은 P5 범위 — P1 은 저장까지만.
 * - receipt 컨트롤은 비활성 placeholder 배치만. TODO(P5): 영수증 즉석 발행.
 */
import { Fragment } from 'react';
import {
  getClauseFieldValue,
  isClauseRowVisible,
  isContractPrintOptionFieldKey,
  type ClauseArticle,
  type ClauseRow,
  type ClauseSegment,
  type ContractDocumentEngineFieldDefinition,
  type ContractDocumentEnginePrintOptions,
} from './-document-engine';
import {
  ClauseAmountInput,
  ClauseArticleFrame,
  ClauseInlineCheck,
  ClauseInlineDate,
  ClauseInlineSelect,
  ClauseReceiptButton,
  ClauseRowFrame,
} from './-clause-primitives';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

export type ClauseFieldChangeHandler = (
  key: string,
  value: string,
  field?: ContractDocumentEngineFieldDefinition,
) => void;

type FieldSegment = Extract<ClauseSegment, { kind: 'field' }>;

/** 프리뷰(인쇄면)에서 제외하는 편집 전용 슬롯 — 토글/공란인쇄 체크, 영수증 버튼 */
function isEditorOnlySegment(segment: ClauseSegment): boolean {
  return segment.kind === 'field' && (segment.control === 'check' || segment.control === 'receipt');
}

/** 도입문 우측에 인라인 배치할 선두 토글 행(라벨 없는 단일 check)인지 판별 */
function isLeadingToggleRow(row: ClauseRow): boolean {
  return (
    !row.label &&
    row.segments.length === 1 &&
    row.segments[0].kind === 'field' &&
    row.segments[0].control === 'check'
  );
}

export function ContractClauseEditor({
  articles,
  fields,
  printOptions,
  onFieldChange,
  onPrintOptionsChange,
  readOnly,
  idPrefix = 'clause',
}: {
  articles: ClauseArticle[];
  fields: Record<string, string>;
  printOptions: ContractDocumentEnginePrintOptions;
  onFieldChange?: ClauseFieldChangeHandler;
  onPrintOptionsChange?: (partial: Partial<ContractDocumentEnginePrintOptions>) => void;
  /** 프리뷰(A4) 모드 — 같은 레이아웃을 읽기 전용으로 렌더 */
  readOnly?: boolean;
  /** 인라인 체크 id 충돌 방지 접두 (편집/프리뷰 동시 마운트 대비) */
  idPrefix?: string;
}) {
  function handleSegmentChange(segment: FieldSegment, value: string) {
    if (isContractPrintOptionFieldKey(segment.fieldKey)) {
      onPrintOptionsChange?.({ [segment.fieldKey]: value === 'true' });
      return;
    }
    onFieldChange?.(
      segment.fieldKey,
      value,
      // amount 슬롯은 편집기 셸의 파생 로직(한글 병기/거래 금액 미러)을 태운다
      segment.control === 'amount'
        ? { key: segment.fieldKey, label: segment.fieldKey, inputType: 'amount' }
        : undefined,
    );
  }

  function renderSegment(articleNo: string, rowKey: string, segment: ClauseSegment, index: number) {
    if (segment.kind === 'text') {
      return <span key={index}>{segment.text}</span>;
    }

    const value = getClauseFieldValue(segment.fieldKey, fields, printOptions);

    switch (segment.control) {
      case 'amount':
        return (
          <ClauseAmountInput
            key={index}
            value={value}
            onChange={(next) => handleSegmentChange(segment, next)}
            amountUnit={printOptions.amountUnit}
            amountNotation={printOptions.amountNotation}
            suffix={segment.suffix}
            readOnly={readOnly}
          />
        );
      case 'date':
        return (
          <ClauseInlineDate
            key={index}
            value={value}
            onChange={(next) => handleSegmentChange(segment, next)}
            suffix={segment.suffix}
            readOnly={readOnly}
          />
        );
      case 'select':
        return (
          <Fragment key={index}>
            <ClauseInlineSelect
              value={value}
              onChange={(next) => handleSegmentChange(segment, next)}
              options={segment.options ?? []}
              readOnly={readOnly}
            />
            {segment.suffix ? <span>{segment.suffix}</span> : null}
          </Fragment>
        );
      case 'check':
        return (
          <ClauseInlineCheck
            key={index}
            id={`${idPrefix}-${articleNo}-${rowKey}-${segment.fieldKey}`}
            checked={value === 'true'}
            onCheckedChange={(checked) =>
              handleSegmentChange(segment, checked ? 'true' : '')
            }
            label={segment.suffix ?? segment.fieldKey}
            readOnly={readOnly}
          />
        );
      case 'text':
        // 본문 조항(제3조~ bodyText) — 전폭 textarea / 프리뷰는 pre-wrap 문단
        return readOnly ? (
          <div key={index} className="w-full whitespace-pre-wrap text-sm leading-6">
            {value || ' '}
          </div>
        ) : (
          <Textarea
            key={index}
            rows={14}
            value={value}
            onChange={(event) => handleSegmentChange(segment, event.target.value)}
            className="my-1 w-full text-sm leading-6"
          />
        );
      case 'receipt':
        // TODO(P5): 영수증 즉석 발행 — P1 은 비활성 placeholder 배치만
        return readOnly ? null : (
          <ClauseReceiptButton key={index} label={segment.suffix ?? '영수증'} />
        );
      default:
        return null;
    }
  }

  function renderRow(articleNo: string, row: ClauseRow) {
    const segments = readOnly
      ? row.segments.filter((segment) => !isEditorOnlySegment(segment))
      : row.segments;
    if (segments.length === 0) return null;

    return (
      <ClauseRowFrame key={row.key} label={row.label} readOnly={readOnly}>
        {segments.map((segment, index) => renderSegment(articleNo, row.key, segment, index))}
      </ClauseRowFrame>
    );
  }

  return (
    <div className={cn('space-y-3', readOnly && 'space-y-4')}>
      {articles.map((article) => {
        const visibleRows = article.rows.filter((row) =>
          isClauseRowVisible(row, fields, printOptions),
        );

        // 도입문 우측 토글(레거시 '현 임차보증금 입력란 추가' 위치) — 편집 모드 전용.
        // 선두에 연속한 토글 행만 도입문으로 올린다 (말미의 '계약사항2조 직접입력'은
        // 레거시처럼 표 아래 전폭 행으로 남긴다).
        const introToggleRows: ClauseRow[] = [];
        if (!readOnly && article.intro) {
          for (const row of visibleRows) {
            if (!isLeadingToggleRow(row)) break;
            introToggleRows.push(row);
          }
        }
        const bodyRows = visibleRows.filter((row) => !introToggleRows.includes(row));

        const renderedRows = bodyRows
          .map((row) => renderRow(article.no, row))
          .filter((node) => node !== null);

        // 프리뷰에서 인쇄할 내용이 없는 조항(제2조 직접입력 등)은 통째로 생략
        if (readOnly && !article.intro && renderedRows.length === 0) return null;

        return (
          <ClauseArticleFrame
            key={article.no}
            no={article.no}
            title={article.title}
            intro={article.intro}
            introTrailing={
              introToggleRows.length > 0 ? (
                <span className="inline-flex items-center gap-3">
                  {introToggleRows.map((row) =>
                    row.segments.map((segment, index) =>
                      renderSegment(article.no, row.key, segment, index),
                    ),
                  )}
                </span>
              ) : undefined
            }
            readOnly={readOnly}
          >
            {renderedRows}
            {!readOnly && renderedRows.length === 0 ? (
              <div className="border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
                직접입력 모드 — 이 조 내용은 본문 조항(제3조~)에 직접 기재합니다.
              </div>
            ) : null}
          </ClauseArticleFrame>
        );
      })}
    </div>
  );
}
