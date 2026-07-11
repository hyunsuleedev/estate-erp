import { Fragment, useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Unit } from '@estate-erp/api-client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatFloorLabel,
  getUnitOccupancy,
  OCCUPANCY_META,
  OCCUPANCY_ORDER,
  type LayoutSection,
  type OccupancyStatus,
} from './-site-helpers';
import { formatArea } from '@/lib/format';

function formatAreaShort(m2: number | string | null | undefined): string {
  if (m2 == null || m2 === '') return '-';
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return '-';
  return `${(value * 0.3025).toFixed(1)}평`;
}

export function UnitLayoutBoard({
  sections,
  selectedUnitId,
  onUnitOpen,
  colorMode = 'activity',
  occupancyFilter = [],
  onOccupancyFilterChange,
}: {
  sections: LayoutSection[];
  selectedUnitId?: string | null;
  onUnitOpen?: (unit: Unit) => void;
  /** activity = 매물/상담 유무 강조, occupancy = 자가/전세/월세/공실 분류 */
  colorMode?: 'activity' | 'occupancy';
  occupancyFilter?: OccupancyStatus[];
  onOccupancyFilterChange?: (statuses: OccupancyStatus[]) => void;
}) {
  const hasPositionedUnits = sections.some(
    (section) => section.floors.length > 0 && section.lineNos.length > 0,
  );

  const occupancyCounts = useMemo(() => {
    const counts: Record<OccupancyStatus, number> = {
      owner_occupied: 0,
      jeonse: 0,
      monthly: 0,
      vacant_or_unknown: 0,
    };
    if (colorMode !== 'occupancy') return counts;
    for (const section of sections) {
      for (const { unit } of section.cellMap.values()) {
        counts[getUnitOccupancy(unit)] += 1;
      }
      for (const unit of section.unpositionedUnits) {
        counts[getUnitOccupancy(unit)] += 1;
      }
    }
    return counts;
  }, [colorMode, sections]);

  if (!hasPositionedUnits) {
    const allUnits = sections.flatMap((section) => section.unpositionedUnits);

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <LayoutGrid className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">배치표를 그릴 수 있는 층/라인 정보가 없습니다</h3>
            <p className="text-xs text-muted-foreground">
              현재 호수 데이터에 `floor` 또는 `lineNo`가 비어 있습니다. 호수명 숫자도 함께
              파싱했지만, 배치 기준을 만들 수 있는 데이터가 부족합니다.
            </p>
          </div>
          {allUnits.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {allUnits.slice(0, 16).map((unit) => (
                <Badge key={unit.id} variant="secondary" className="text-[10px] font-normal">
                  {unit.name}
                </Badge>
              ))}
              {allUnits.length > 16 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  +{allUnits.length - 16}개
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const toggleOccupancyFilter = (status: OccupancyStatus) => {
    if (!onOccupancyFilterChange) return;
    onOccupancyFilterChange(
      occupancyFilter.includes(status)
        ? occupancyFilter.filter((s) => s !== status)
        : [...occupancyFilter, status],
    );
  };

  const isOccupancyDimmed = (unit: Unit) =>
    colorMode === 'occupancy' &&
    occupancyFilter.length > 0 &&
    !occupancyFilter.includes(getUnitOccupancy(unit));

  return (
    <div className="flex h-full flex-col overflow-auto px-4 py-4">
      {/* Legend / quick filter */}
      {colorMode === 'activity' ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-normal">
            일반
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-normal">
            상담 있음
          </Badge>
          <Badge className="bg-violet-500/15 text-[10px] font-normal text-violet-700 hover:bg-violet-500/15 dark:text-violet-200">
            매물 있음
          </Badge>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {OCCUPANCY_ORDER.map((status) => {
            const meta = OCCUPANCY_META[status];
            const active =
              occupancyFilter.length === 0 || occupancyFilter.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleOccupancyFilter(status)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  occupancyFilter.includes(status)
                    ? 'border-primary bg-accent font-medium'
                    : 'border-border/60 bg-background hover:bg-accent/60',
                  !active && 'opacity-50',
                )}
              >
                <span className={cn('size-2 rounded-full', meta.dotClass)} />
                {meta.label}
                <span className="tabular-nums text-muted-foreground">
                  {occupancyCounts[status]}
                </span>
              </button>
            );
          })}
          <span className="ml-1 text-[10px] text-muted-foreground">
            내부 CRM 데이터 기준 · 신호 없으면 공실/미상
          </span>
        </div>
      )}

      <div className="space-y-6">
        {sections.map((section) => {
          const showTitle = sections.length > 1 || section.label !== '전체';
          return (
            <section key={section.key} className="space-y-3">
              {showTitle && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{section.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {section.floors.length}층 · {section.lineNos.length}라인
                  </span>
                </div>
              )}

              {section.floors.length > 0 && section.lineNos.length > 0 ? (
                <div className="overflow-auto rounded-xl border border-border/60 bg-muted/10 p-3">
                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns: `56px repeat(${section.lineNos.length}, minmax(88px, 1fr))`,
                      minWidth: 56 + section.lineNos.length * 88,
                    }}
                  >
                    <div />
                    {section.lineNos.map((lineNo) => (
                      <div
                        key={`header-${section.key}-${lineNo}`}
                        className="flex h-7 items-center justify-center rounded-md text-[10px] font-medium text-muted-foreground"
                      >
                        {String(lineNo).padStart(2, '0')}
                      </div>
                    ))}

                    {section.floors.map((floor) => (
                      <Fragment key={`floor-row-${section.key}-${floor}`}>
                        <div className="flex min-h-16 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                          {formatFloorLabel(floor)}F
                        </div>
                        {section.lineNos.map((lineNo) => {
                          const positionedUnit = section.cellMap.get(`${floor}:${lineNo}`);

                          if (!positionedUnit) {
                            return (
                              <div
                                key={`empty-${section.key}-${floor}-${lineNo}`}
                                className="min-h-16 rounded-lg border border-dashed border-border/60 bg-background/30"
                              />
                            );
                          }

                          const { unit } = positionedUnit;
                          const hasListing = (unit.properties ?? []).some(
                            (property) => (property.listings?.length ?? 0) > 0,
                          );
                          const hasConsultation = (unit.properties ?? []).some(
                            (property) => (property.consultations?.length ?? 0) > 0,
                          );
                          const isSelected = selectedUnitId === unit.id;
                          const occupancy =
                            colorMode === 'occupancy' ? getUnitOccupancy(unit) : null;

                          return (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => onUnitOpen?.(unit)}
                              className={cn(
                                'group flex min-h-16 flex-col items-center justify-center rounded-lg border px-2 py-1 text-center transition-colors',
                                isSelected &&
                                  'border-primary bg-primary text-primary-foreground shadow-sm',
                                !isSelected &&
                                  occupancy &&
                                  OCCUPANCY_META[occupancy].cellClass,
                                !isSelected &&
                                  !occupancy &&
                                  hasListing &&
                                  'border-violet-500/30 bg-violet-500/12 hover:bg-violet-500/16',
                                !isSelected &&
                                  !occupancy &&
                                  !hasListing &&
                                  hasConsultation &&
                                  'border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/14',
                                !isSelected &&
                                  !occupancy &&
                                  !hasListing &&
                                  !hasConsultation &&
                                  'border-border/70 bg-background hover:bg-accent/60',
                                isOccupancyDimmed(unit) && 'opacity-25',
                              )}
                            >
                              <span className="text-sm font-semibold leading-none">{unit.name}</span>
                              <span
                                className={cn(
                                  'mt-1 text-[10px] leading-none',
                                  isSelected
                                    ? 'text-primary-foreground/80'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {occupancy
                                  ? OCCUPANCY_META[occupancy].label
                                  : (unit.siteUnitType?.name ?? formatAreaShort(unit.exclusiveAreaM2))}
                              </span>
                            </button>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  이 동은 배치 가능한 층/라인 정보가 없습니다.
                </div>
              )}

              {section.unpositionedUnits.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    배치 불가 호수
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {section.unpositionedUnits.map((unit) => {
                      const occupancy =
                        colorMode === 'occupancy' ? getUnitOccupancy(unit) : null;
                      return (
                        <button
                          key={`${section.key}-unplaced-${unit.id}`}
                          type="button"
                          onClick={() => onUnitOpen?.(unit)}
                          title={formatArea(unit.exclusiveAreaM2)}
                          className={cn(
                            'rounded-md border px-2 py-1 text-[11px] transition-colors',
                            selectedUnitId === unit.id
                              ? 'border-primary bg-primary text-primary-foreground'
                              : occupancy
                                ? OCCUPANCY_META[occupancy].cellClass
                                : 'border-border/60 bg-background hover:bg-accent',
                            isOccupancyDimmed(unit) && 'opacity-25',
                          )}
                        >
                          {unit.name}
                          {occupancy && (
                            <span className="ml-1 text-[10px] opacity-70">
                              {OCCUPANCY_META[occupancy].label}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
