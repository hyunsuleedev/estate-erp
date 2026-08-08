import { Workflow } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { STEP_META } from "../-customer-management/prototype-data";
import {
  buildLedgerDependencyGraph,
  formatLedgerMonthlyRent,
  formatLedgerPrice,
  getLedgerDependencyLinks,
  getLedgerIntentLines,
  type CustomerLedgerRow,
  type LedgerDependencyGraphEdge,
  type LedgerIntentLine,
} from "./prototype-data";

const GRAPH_WIDTH = 1088;
const SOURCE_X = 0;
const SOURCE_WIDTH = 260;
const STEP_X = 386;
const STEP_WIDTH = 316;
const TARGET_X = 828;
const TARGET_WIDTH = 260;
const COLUMN_GAP = 126;

export function DependencyDiagram({ row }: { row: CustomerLedgerRow }) {
  const intentLines = getLedgerIntentLines(row);
  const intentById = new Map(intentLines.map((line) => [line.id, line]));
  const links = getLedgerDependencyLinks(row);
  const graph = buildLedgerDependencyGraph(row);
  const graphHeight = Math.max(
    180,
    Math.max(graph.sources.length, graph.steps.length, graph.targets.length) *
      84,
  );
  const sourceY = nodePositions(graph.sources, graphHeight);
  const stepY = nodePositions(graph.steps, graphHeight);
  const targetY = nodePositions(graph.targets, graphHeight);
  const unresolvedSteps = graph.steps.filter(
    ({ link }) => link.step.state !== "done",
  );
  const bottleneck =
    unresolvedSteps.find(({ link }) => link.step.state === "blocked") ??
    unresolvedSteps[0] ??
    null;
  const markerPrefix = `ledger-${row.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <section
      className="bg-[#fbfbfa] px-4 py-3"
      data-ledger-dependency-diagram={row.id}
      aria-label={`${row.name} 거래 계획`}
    >
      <div className="w-[1120px] min-w-[1120px]">
        <header className="flex min-h-8 items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#eceae6] text-slate-600">
            <Workflow className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[11px] font-semibold text-slate-900">
                거래 계획
              </h3>
              <span className="truncate text-[9.5px] text-muted-foreground">
                현재 상황 · {row.source.currentSituation}
              </span>
            </div>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              같은 기반과 거래 요건은 한 번만 표시하고, 필요한 선행 조건을
              연결했습니다.
            </p>
          </div>
          <dl className="ml-auto flex shrink-0 items-center rounded-md bg-white px-1 py-1 text-[9px] ring-1 ring-border/70">
            <PlanCount label="출발" value={graph.sources.length} />
            <PlanCount
              label="미해결"
              value={unresolvedSteps.length}
              emphasis={unresolvedSteps.length > 0}
            />
            <PlanCount label="목표" value={graph.targets.length} />
          </dl>
        </header>

        <div className="mt-3 overflow-hidden rounded-md border border-[#deddd9] bg-white">
          <div className="border-b border-[#e7e6e2] bg-[#f7f7f5] px-4 py-2">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `${SOURCE_WIDTH}px ${STEP_WIDTH}px ${TARGET_WIDTH}px`,
                columnGap: `${COLUMN_GAP}px`,
                width: GRAPH_WIDTH,
              }}
            >
              <StageHeading
                number="1"
                title="출발 기반"
                description="현재 자산·거주·자금"
              />
              <StageHeading
                number="2"
                title="선행 조건"
                description="확인하거나 해결할 일"
              />
              <StageHeading
                number="3"
                title="거래 목표"
                description="구함·내놓음 요건"
              />
            </div>
          </div>

          <div
            className="relative mx-4"
            style={{ width: GRAPH_WIDTH, height: graphHeight }}
          >
            <DependencyEdges
              edges={graph.edges}
              sourceY={sourceY}
              stepY={stepY}
              targetY={targetY}
              height={graphHeight}
              markerPrefix={markerPrefix}
            />

            <div
              className="absolute inset-y-0"
              style={{ insetInlineStart: SOURCE_X, width: SOURCE_WIDTH }}
              data-ledger-dependency-stage="source"
            >
              {graph.sources.map((source) => (
                <div
                  key={source.id}
                  className="absolute inset-x-0 -translate-y-1/2"
                  style={{ top: sourceY.get(source.id) }}
                >
                  {source.intent ? (
                    <IntentDiagramNode
                      line={source.intent}
                      placement="source"
                    />
                  ) : (
                    <ContextDiagramNode id={source.id} label={source.label} />
                  )}
                </div>
              ))}
            </div>

            <div
              className="absolute inset-y-0"
              style={{ insetInlineStart: STEP_X, width: STEP_WIDTH }}
              data-ledger-dependency-stage="step"
            >
              {graph.steps.map(({ id, link }) => (
                <div
                  key={id}
                  className="absolute inset-x-0 -translate-y-1/2"
                  style={{ top: stepY.get(id) }}
                >
                  <StepDiagramNode link={link} />
                </div>
              ))}
            </div>

            <div
              className="absolute inset-y-0"
              style={{ insetInlineStart: TARGET_X, width: TARGET_WIDTH }}
              data-ledger-dependency-stage="target"
            >
              {graph.targets.map((target) => (
                <div
                  key={target.id}
                  className="absolute inset-x-0 -translate-y-1/2"
                  style={{ top: targetY.get(target.id) }}
                >
                  {target.intent ? (
                    <IntentDiagramNode
                      line={target.intent}
                      placement="target"
                    />
                  ) : (
                    <MissingTargetNode id={target.id} label={target.label} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <PlanFooter row={row} bottleneck={bottleneck?.link ?? null} />
        </div>

        <ol className="sr-only" aria-label="선행 조건 연결 목록">
          {links.map((link) => {
            const sourceIntents = link.sourceIntentIds
              .map((id) => intentById.get(id))
              .filter((line): line is LedgerIntentLine => Boolean(line));
            const targetIntents = link.targetIntentIds
              .map((id) => intentById.get(id))
              .filter((line): line is LedgerIntentLine => Boolean(line));
            const sourceSummary =
              sourceIntents.length > 0
                ? sourceIntents.map(describeIntent).join(", ")
                : link.sourceLabel;
            const targetSummary =
              targetIntents.length > 0
                ? targetIntents.map(describeIntent).join(", ")
                : "거래 목표 미지정";

            return (
              <li key={link.id}>
                {sourceSummary}에서 {link.step.label} 해결 후 {targetSummary}{" "}
                진행 가능
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function PlanCount({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1 px-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-semibold tabular-nums text-slate-700",
          emphasis && "text-destructive-strong",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function StageHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-white text-[9px] font-semibold text-slate-700 ring-1 ring-[#d9d8d3]">
        {number}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-800">{title}</p>
        <p className="truncate text-[8.5px] text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function DependencyEdges({
  edges,
  sourceY,
  stepY,
  targetY,
  height,
  markerPrefix,
}: {
  edges: LedgerDependencyGraphEdge[];
  sourceY: Map<string, number>;
  stepY: Map<string, number>;
  targetY: Map<string, number>;
  height: number;
  markerPrefix: string;
}) {
  const neutralMarker = `${markerPrefix}-neutral`;
  const demandMarker = `${markerPrefix}-demand`;
  const supplyMarker = `${markerPrefix}-supply`;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={GRAPH_WIDTH}
      height={height}
      viewBox={`0 0 ${GRAPH_WIDTH} ${height}`}
      aria-hidden="true"
    >
      <defs>
        <ArrowMarker id={neutralMarker} color="#bbb9b2" />
        <ArrowMarker id={demandMarker} color="#6f9fb7" />
        <ArrowMarker id={supplyMarker} color="#6c9f89" />
      </defs>
      {edges.map((edge) => {
        const isSourceEdge = edge.phase === "source-to-step";
        const startY = isSourceEdge
          ? sourceY.get(edge.fromId)
          : stepY.get(edge.fromId);
        const endY = isSourceEdge
          ? stepY.get(edge.toId)
          : targetY.get(edge.toId);
        if (startY === undefined || endY === undefined) return null;

        const startX = isSourceEdge
          ? SOURCE_X + SOURCE_WIDTH
          : STEP_X + STEP_WIDTH;
        const endX = isSourceEdge ? STEP_X : TARGET_X;
        const color = isSourceEdge
          ? "#bbb9b2"
          : edge.targetKind === "supply"
            ? "#6c9f89"
            : "#6f9fb7";
        const markerId = isSourceEdge
          ? neutralMarker
          : edge.targetKind === "supply"
            ? supplyMarker
            : demandMarker;

        return (
          <path
            key={edge.id}
            d={connectorPath(startX, startY, endX, endY)}
            fill="none"
            stroke={color}
            strokeWidth="1.35"
            vectorEffect="non-scaling-stroke"
            markerEnd={`url(#${markerId})`}
            data-ledger-dependency-edge={edge.id}
            data-ledger-dependency-edge-phase={edge.phase}
          />
        );
      })}
    </svg>
  );
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 6 6"
      refX="5.4"
      refY="3"
      markerWidth="6"
      markerHeight="6"
      orient="auto"
      markerUnits="strokeWidth"
    >
      <path d="M0 0L6 3L0 6Z" fill={color} />
    </marker>
  );
}

function ContextDiagramNode({ id, label }: { id: string; label: string }) {
  return (
    <div
      className="rounded-md border border-[#dddbd6] bg-[#faf9f7] px-3 py-2.5"
      data-ledger-dependency-source={id}
    >
      <p className="text-[8.5px] font-medium text-muted-foreground">
        현재 기반
      </p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-700">
        {label}
      </p>
    </div>
  );
}

function MissingTargetNode({ id, label }: { id: string; label: string }) {
  return (
    <div
      className="rounded-md border border-dashed border-border px-3 py-2.5 text-[10px] font-medium text-muted-foreground"
      data-ledger-dependency-intent={id}
    >
      {label}
    </div>
  );
}

function StepDiagramNode({
  link,
}: {
  link: ReturnType<typeof getLedgerDependencyLinks>[number];
}) {
  const meta = STEP_META[link.step.state];
  const supportingFacts = [link.step.amountLabel, link.step.dueLabel].filter(
    Boolean,
  );

  return (
    <div
      className="min-w-0 rounded-md border border-[#d8d7d2] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
      data-ledger-dependency-link={link.step.id}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-medium",
            meta.className,
          )}
        >
          <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
          {meta.label}
        </span>
        <strong className="truncate text-[10.5px] text-slate-800">
          {link.step.label}
        </strong>
        <span className="ml-auto shrink-0 rounded bg-[#f1f0ed] px-1.5 py-0.5 text-[8.5px] font-medium text-muted-foreground">
          {link.step.requiredBefore}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[8.5px] text-muted-foreground">
        <p className="min-w-0 flex-1 truncate">{link.step.detail}</p>
        {supportingFacts.length > 0 && (
          <span className="shrink-0 font-medium tabular-nums text-slate-600">
            {supportingFacts.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

function IntentDiagramNode({
  line,
  placement,
}: {
  line: LedgerIntentLine;
  placement: "source" | "target";
}) {
  const isDemand = line.kind === "demand";
  const kindLabel = isDemand ? "구함" : "내놓음";
  const priceLabel = intentPriceLabel(line);

  return (
    <div
      className={cn(
        "min-w-0 rounded-md border px-3 py-2",
        isDemand
          ? "border-[#cfe3ef] bg-[#f4f9fb]"
          : "border-[#cce5dc] bg-[#f3faf7]",
      )}
      data-ledger-dependency-source-intent={
        placement === "source" ? line.id : undefined
      }
      data-ledger-dependency-intent={
        placement === "target" ? line.id : undefined
      }
    >
      <p className="flex min-w-0 items-center gap-1.5 text-[9px]">
        <span
          className={cn(
            "font-semibold",
            isDemand ? "text-info-strong" : "text-success",
          )}
        >
          {kindLabel} {line.ordinal}
        </span>
        <strong className="text-slate-800">{line.transactionType}</strong>
        <span className="text-muted-foreground">{line.roleLabel}</span>
        <span className="ml-auto shrink-0 font-semibold tabular-nums text-slate-700">
          {priceLabel}
        </span>
      </p>
      <p className="mt-1 truncate text-[8.5px] text-muted-foreground">
        {line.locationLabel} · {line.timingLabel}
      </p>
    </div>
  );
}

function PlanFooter({
  row,
  bottleneck,
}: {
  row: CustomerLedgerRow;
  bottleneck: ReturnType<typeof getLedgerDependencyLinks>[number] | null;
}) {
  if (!bottleneck) {
    return (
      <footer className="flex items-center gap-2 border-t border-[#e7e6e2] bg-[#fbfbfa] px-4 py-2 text-[9px]">
        <span className="size-1.5 rounded-full bg-success" />
        <strong className="text-success">선행 조건 완료</strong>
        <span className="text-muted-foreground">
          모든 거래 목표를 진행할 수 있습니다.
        </span>
      </footer>
    );
  }

  return (
    <footer className="flex items-center gap-2 border-t border-[#e7e6e2] bg-[#fbfbfa] px-4 py-2 text-[9px]">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          STEP_META[bottleneck.step.state].dotClassName,
        )}
      />
      <span className="font-medium text-muted-foreground">현재 병목</span>
      <strong className="text-slate-800">{bottleneck.step.label}</strong>
      <span className="mx-1 h-3 w-px bg-[#d9d8d3]" aria-hidden="true" />
      <span className="font-medium text-muted-foreground">다음 액션</span>
      <span className="truncate text-slate-700">{row.nextAction}</span>
      <span className="ml-auto shrink-0 rounded bg-white px-2 py-0.5 font-semibold text-destructive-strong ring-1 ring-border/70">
        {row.nextActionDue}
      </span>
    </footer>
  );
}

function nodePositions<T extends { id: string }>(
  nodes: T[],
  height: number,
): Map<string, number> {
  return new Map(
    nodes.map((node, index) => [
      node.id,
      ((index + 0.5) * height) / Math.max(nodes.length, 1),
    ]),
  );
}

function connectorPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string {
  const controlOffset = (endX - startX) * 0.54;
  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

function intentPriceLabel(line: LedgerIntentLine): string {
  const primaryPrice =
    line.kind === "demand"
      ? `${formatLedgerPrice(line.budgetMin)}~${formatLedgerPrice(line.budgetMax)}`
      : formatLedgerPrice(line.askingPrice);
  if (line.monthlyRentMin === null) return primaryPrice;

  const monthlyRent =
    line.monthlyRentMax === null || line.monthlyRentMax === line.monthlyRentMin
      ? formatLedgerMonthlyRent(line.monthlyRentMin)
      : `${formatLedgerMonthlyRent(line.monthlyRentMin)}~${formatLedgerMonthlyRent(line.monthlyRentMax)}`;
  return `${primaryPrice} / 월 ${monthlyRent}`;
}

function describeIntent(line: LedgerIntentLine): string {
  const kindLabel = line.kind === "demand" ? "구함" : "내놓음";
  return `${kindLabel} ${line.ordinal} ${line.transactionType} ${line.roleLabel} ${intentPriceLabel(line)}`;
}
