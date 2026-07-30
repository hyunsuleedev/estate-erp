import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  ClipboardCheck,
  DoorOpen,
  Eye,
  EyeOff,
  ExternalLink,
  FileSearch,
  Hash,
  KeyRound,
  Layers3,
  Loader2,
  LockKeyhole,
  Megaphone,
  MonitorCog,
  Pencil,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AgentActionRequest,
  ListingAdvertisementWithListing,
  MyAdvertisementsSyncStatus,
  OfficeAdvertisement,
} from "@estate-erp/api-client";
import {
  ApiError,
  analyzeOfficeAdvertisementComparison,
  analyzeOfficeAdvertisementRow,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRent,
} from "@/lib/format";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MultiSelect,
  type MultiSelectOption,
} from "@/components/ui/multi-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZE = 30;
const LOAD_LIMIT = 100;

const PROPERTY_TABLE_PILL_CLASS_NAME =
  "inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5";
const PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME =
  "inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5";
const PROPERTY_TABLE_PILL_TONES = {
  neutral: "bg-[#f1f1ef] text-[#787774]",
  neutralStrong: "bg-[#f1f1ef] text-[#5f5e5b]",
  success: "bg-[#eef3ed] text-[#44745a]",
  info: "bg-[#e7f3f8] text-[#337ea9]",
  warning: "bg-[#fbf3db] text-[#8f6b1f]",
  danger: "bg-[#fdebec] text-[#8f4b46]",
  violet: "bg-violet-soft text-violet",
} as const;
const PROPERTY_TABLE_TRANSACTION_META: Record<
  string,
  { label: string; className: string }
> = {
  sale: { label: "매매", className: PROPERTY_TABLE_PILL_TONES.danger },
  jeonse: { label: "전세", className: PROPERTY_TABLE_PILL_TONES.info },
  monthly: { label: "월세", className: PROPERTY_TABLE_PILL_TONES.warning },
};

type MyAdsView = "all" | "comparison_pending" | "attention";

const viewTabs: Array<{ value: MyAdsView; label: string }> = [
  { value: "all", label: "전체" },
  { value: "comparison_pending", label: "비교 대기" },
  { value: "attention", label: "검토 필요" },
];

type MyAdsTransactionFilter = "all" | "sale" | "jeonse" | "monthly";
type MyAdsChannelFilter = "all" | "esiljang" | "budongsanbank";
type MyAdsVerificationFilter =
  | "all"
  | "owner"
  | "document"
  | "phone"
  | "agent"
  | "unknown";
type MyAdsFloorExposureFilter =
  | "all"
  | "exact"
  | "band"
  | "disadvantage"
  | "unknown";
type MyAdsExposurePeriodFilter =
  | "all"
  | "within_7_days"
  | "within_30_days"
  | "over_30_days"
  | "unknown";
type MyAdsComparisonFilter =
  | "all"
  | "lower_price"
  | "floor_disadvantage"
  | "rank_disadvantage"
  | "own_inactive"
  | "pending"
  | "clear";

type MyAdsFilterState = {
  siteIds: string[];
  dongSearch: string;
  unitSearch: string;
  transactionType: MyAdsTransactionFilter;
  channel: MyAdsChannelFilter;
  primaryAmountMin: string;
  primaryAmountMax: string;
  monthlyRentMin: string;
  monthlyRentMax: string;
  verification: MyAdsVerificationFilter;
  floorExposure: MyAdsFloorExposureFilter;
  exposurePeriod: MyAdsExposurePeriodFilter;
  comparison: MyAdsComparisonFilter;
};

type MyAdsFilterOption = { value: string; label: string };

const initialMyAdsFilters: MyAdsFilterState = {
  siteIds: [],
  dongSearch: "",
  unitSearch: "",
  transactionType: "all",
  channel: "all",
  primaryAmountMin: "",
  primaryAmountMax: "",
  monthlyRentMin: "",
  monthlyRentMax: "",
  verification: "all",
  floorExposure: "all",
  exposurePeriod: "all",
  comparison: "all",
};

const transactionFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "거래 전체" },
  { value: "sale", label: "매매" },
  { value: "jeonse", label: "전세" },
  { value: "monthly", label: "월세" },
];

const channelFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "CP사 전체" },
  { value: "esiljang", label: "이실장" },
  { value: "budongsanbank", label: "부동산뱅크" },
];

const verificationFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "검증방식 전체" },
  { value: "owner", label: "소유자 확인" },
  { value: "document", label: "홍보확인서" },
  { value: "phone", label: "전화 확인" },
  { value: "agent", label: "중개사 확인" },
  { value: "unknown", label: "미확인" },
];

const floorExposureFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "층수노출 전체" },
  { value: "exact", label: "노출" },
  { value: "band", label: "미노출" },
  { value: "disadvantage", label: "노출 불리" },
  { value: "unknown", label: "미확인" },
];

const exposurePeriodFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "노출기간 전체" },
  { value: "within_7_days", label: "7일 이내" },
  { value: "within_30_days", label: "8~30일" },
  { value: "over_30_days", label: "31일 이상" },
  { value: "unknown", label: "시작일 미확인" },
];

const comparisonFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "경쟁 대비 전체" },
  { value: "lower_price", label: "더 싼 광고 있음" },
  { value: "floor_disadvantage", label: "층 노출 불리" },
  { value: "rank_disadvantage", label: "순위 불리" },
  { value: "own_inactive", label: "내 광고 미노출" },
  { value: "pending", label: "비교 대기" },
  { value: "clear", label: "즉시 경고 없음" },
];

const ACTION_EVIDENCE_TTL_MS = 2 * 60 * 60_000;
const ACTION_REQUESTS_QUERY_KEY = ["agent-action-requests"] as const;
const FULL_SYNC_QUERY_KEY = ["listing-advertisements", "full-sync"] as const;
const CP_CREDENTIAL_QUERY_KEY = ["local-cp-credentials"] as const;
const CP_PROVIDERS = ["esiljang", "budongsanbank"] as const;

type CpProvider = (typeof CP_PROVIDERS)[number];
type CpVaultStatus = {
  available: boolean;
  deviceId: string;
  encryptionBackend: string;
  providers: Array<{
    provider: CpProvider;
    hasCredentials: boolean;
    maskedUsername: string | null;
    updatedAt: string | null;
    lastVerifiedAt: string | null;
  }>;
};
type CpAuthRendererBridge = {
  getStatus(input: { officeId: string }): Promise<CpVaultStatus>;
  save(input: {
    officeId: string;
    provider: CpProvider;
    username: string;
    password: string;
  }): Promise<CpVaultStatus>;
  remove(input: {
    officeId: string;
    provider: CpProvider;
  }): Promise<CpVaultStatus>;
  prepareSession(input: { officeId: string; provider: CpProvider }): Promise<{
    provider: CpProvider;
    deviceId: string;
    status: "authenticated" | "credentials_missing" | "needs_input" | "error";
    targetUrl: string | null;
    windowId: number | null;
    message: string;
  }>;
};
type DesktopWindow = Window & {
  electronBridge?: { cpAuth?: CpAuthRendererBridge };
};

type AdvertisementActionDraft = {
  advertisement: ListingAdvertisementWithListing;
  advertisedPrice: string;
  advertisedDeposit: string;
  advertisedMonthlyRent: string;
  republishAfterSave: boolean;
};

/** 표에서 인라인으로 고친 광고 조건 (거래유형에 따라 쓰는 칸이 다르다) */
type InlinePriceEdit = {
  advertisedPrice: string;
  advertisedDeposit: string;
  advertisedMonthlyRent: string;
  republishAfterSave: boolean;
};

type WorkflowVisualState =
  | "idle"
  | "blocked"
  | "ready"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_input"
  | "skipped"
  | "cancelled";

type WorkflowStagePresentation = {
  state: WorkflowVisualState;
  description: string;
  retryStepIds: string[];
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
};

export const Route = createFileRoute("/_authenticated/properties/naver-my-ads")(
  {
    component: NaverMyAdsPage,
  },
);

function NaverMyAdsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const officeId = user?.office?.id ?? null;
  const cpAuthBridge = (window as DesktopWindow).electronBridge?.cpAuth;
  const [view, setView] = useState<MyAdsView>("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MyAdsFilterState>(initialMyAdsFilters);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [
    areAdvertisementSourceColumnsCollapsed,
    setAreAdvertisementSourceColumnsCollapsed,
  ] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [workflowDetailsOpen, setWorkflowDetailsOpen] = useState(false);
  const [actionDrafts, setActionDrafts] = useState<AdvertisementActionDraft[]>(
    [],
  );
  const [actionRationale, setActionRationale] = useState("");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  /**
   * 인라인 편집 상태 — 선택한 행의 광고가를 표에서 바로 고친다.
   * 값은 광고 id 별로 들고 있으며, 원래 값과 다른 항목만 수정안으로 제출한다.
   * (다이얼로그를 열지 않고도 랭킹·경쟁 최저가를 같은 줄에서 보며 판단)
   */
  const [inlineEdits, setInlineEdits] = useState<
    Record<string, InlinePriceEdit>
  >({});
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["listing-advertisements", "my-ads", search],
    queryFn: () =>
      api.listingAdvertisements.findAll({
        search: search.trim() || undefined,
        status: "active",
        page: 1,
        limit: LOAD_LIMIT,
        sortBy: "updatedAt",
        sortOrder: "desc",
      }),
  });
  const syncStatusQuery = useQuery({
    queryKey: FULL_SYNC_QUERY_KEY,
    queryFn: () => api.listingAdvertisements.getFullSyncStatus(),
    refetchInterval: 10_000,
  });
  const actionRequestsQuery = useQuery({
    queryKey: ACTION_REQUESTS_QUERY_KEY,
    queryFn: () => api.agentActionRequests.list({ limit: 200 }),
    refetchInterval: 30_000,
  });
  const cpCredentialsQuery = useQuery({
    queryKey: [...CP_CREDENTIAL_QUERY_KEY, officeId],
    queryFn: () => {
      if (!officeId || !cpAuthBridge) {
        throw new Error("데스크톱 로컬 계정 저장소를 사용할 수 없습니다.");
      }
      return cpAuthBridge.getStatus({ officeId });
    },
    enabled: Boolean(officeId && cpAuthBridge),
    staleTime: 5_000,
  });

  const advertisements = data?.items ?? [];
  const latestActionByAdvertisement = useMemo(() => {
    const requests = [...(actionRequestsQuery.data ?? [])].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
    const result = new Map<string, AgentActionRequest>();
    for (const request of requests) {
      if (!result.has(request.listingAdvertisementId)) {
        result.set(request.listingAdvertisementId, request);
      }
    }
    return result;
  }, [actionRequestsQuery.data]);
  const siteFilterOptions = useMemo<MultiSelectOption[]>(() => {
    const sites = new Map<
      string,
      {
        label: string;
        description: string | undefined;
        advertisementCount: number;
      }
    >();
    for (const advertisement of advertisements) {
      const site = advertisement.listing?.property?.site;
      if (!site) continue;
      const current = sites.get(site.id);
      sites.set(site.id, {
        label: site.name,
        description: site.roadAddress ?? site.jibunAddress ?? undefined,
        advertisementCount: (current?.advertisementCount ?? 0) + 1,
      });
    }
    return [...sites.entries()]
      .map(([value, site]) => ({
        value,
        label: site.label,
        description: site.description,
        meta: `${site.advertisementCount.toLocaleString()}건`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "ko"));
  }, [advertisements]);
  const filterScopedAdvertisements = useMemo(
    () =>
      advertisements.filter((advertisement) =>
        advertisementMatchesFilters(advertisement, filters),
      ),
    [advertisements, filters],
  );
  const filteredAdvertisements = useMemo(
    () =>
      filterScopedAdvertisements.filter((advertisement) =>
        advertisementMatchesView(advertisement, view),
      ),
    [filterScopedAdvertisements, view],
  );
  const sortedAdvertisements = useMemo(
    () => sortAdvertisements(filteredAdvertisements, sorting),
    [filteredAdvertisements, sorting],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(sortedAdvertisements.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const visibleAdvertisements = sortedAdvertisements.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        viewTabs.map((tab) => [
          tab.value,
          filterScopedAdvertisements.filter((advertisement) =>
            advertisementMatchesView(advertisement, tab.value),
          ).length,
        ]),
      ) as Record<MyAdsView, number>,
    [filterScopedAdvertisements],
  );

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!officeId || !cpAuthBridge) {
        throw new Error(
          "CP 광고 동기화는 계정이 저장된 데스크톱 앱에서 실행할 수 있습니다.",
        );
      }
      const vaultStatus = await cpAuthBridge.getStatus({ officeId });
      queryClient.setQueryData(
        [...CP_CREDENTIAL_QUERY_KEY, officeId],
        vaultStatus,
      );
      const savedProviders = vaultStatus.providers
        .filter((provider) => provider.hasCredentials)
        .map((provider) => provider.provider);
      const missingProviders = CP_PROVIDERS.filter(
        (provider) => !savedProviders.includes(provider),
      );
      if (!vaultStatus.available || missingProviders.length > 0) {
        setCredentialDialogOpen(true);
        throw new Error(
          !vaultStatus.available
            ? "운영체제 보안 저장소를 사용할 수 없습니다."
            : "이실장과 부동산뱅크 계정을 모두 이 PC에 저장해 주세요.",
        );
      }

      const prepared = await Promise.all(
        CP_PROVIDERS.map((provider) =>
          cpAuthBridge.prepareSession({ officeId, provider }),
        ),
      );
      const blocked = prepared.filter(
        (result) => result.status !== "authenticated",
      );
      const refreshedVaultStatus = await cpAuthBridge.getStatus({ officeId });
      queryClient.setQueryData(
        [...CP_CREDENTIAL_QUERY_KEY, officeId],
        refreshedVaultStatus,
      );
      if (blocked.length > 0) {
        setCredentialDialogOpen(true);
        throw new Error(blocked.map((result) => result.message).join(" "));
      }

      return api.listingAdvertisements.requestFullSync({
        executionTarget: "local",
        runnerDeviceId: vaultStatus.deviceId,
        credentialProviders: [...CP_PROVIDERS],
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(FULL_SYNC_QUERY_KEY, result);
      toast.success(
        result.created
          ? "전체 광고 동기화를 Skill에 요청했습니다"
          : "이미 진행 중인 전체 동기화 요청에 합쳤습니다",
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const retrySyncMutation = useMutation({
    mutationFn: async (stepIds: string[]) => {
      let latest: MyAdvertisementsSyncStatus | null = null;
      for (const stepId of stepIds) {
        latest = await api.listingAdvertisements.retryFullSyncStep(stepId);
      }
      if (!latest) throw new Error("재시도할 동기화 단계가 없습니다.");
      return latest;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(FULL_SYNC_QUERY_KEY, result);
      toast.success("막힌 단계부터 다시 실행합니다.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      drafts,
      rationale,
    }: {
      drafts: AdvertisementActionDraft[];
      rationale: string;
    }) => {
      if (!user) throw new Error("로그인 사용자 정보를 확인할 수 없습니다.");
      const results = await Promise.allSettled(
        drafts.map(async (draft) => {
          const context = draft.advertisement.actionContext;
          if (!context?.comparisonGroupId) {
            throw new Error("최신 네이버 비교 근거가 없습니다.");
          }
          return api.agentActionRequests.create({
            reviewerId: user.id,
            listingAdvertisementId: draft.advertisement.id,
            capability: "advertisement.terms.set",
            rationale:
              rationale.trim() ||
              `${getCanonicalLocation(draft.advertisement).site} 네이버 비교 분석을 검토해 CP 광고 조건을 조정합니다.`,
            payload: {
              advertisedPrice: parseManwon(draft.advertisedPrice),
              advertisedDeposit: parseManwon(draft.advertisedDeposit),
              advertisedMonthlyRent: parseManwon(draft.advertisedMonthlyRent),
              republishAfterSave: draft.republishAfterSave,
            },
            sourceSkillKey: "naver-real-estate-reader",
            sourceSkillVersion: "0.3.0",
            executorSkillVersion: "computer-use-v1",
          });
        }),
      );
      const created = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failed = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (created.length === 0) {
        throw failed[0] ?? new Error("수정안을 만들지 못했습니다.");
      }
      return { created, failed };
    },
    onSuccess: ({ created, failed }) => {
      void queryClient.invalidateQueries({
        queryKey: ACTION_REQUESTS_QUERY_KEY,
      });
      const submittedAdvertisementIds = new Set(
        created.map((request) => request.listingAdvertisementId),
      );
      setActionDialogOpen(false);
      setActionDrafts([]);
      setActionRationale("");
      setInlineEdits((current) => {
        const next = { ...current };
        for (const advertisementId of submittedAdvertisementIds) {
          delete next[advertisementId];
        }
        return next;
      });
      toast.success(
        failed.length > 0
          ? `${created.length}건의 수정안을 만들었습니다 · ${failed.length}건 실패`
          : `${created.length}건의 수정안을 만들었습니다. 검토·승인 후 CP Skill이 실행합니다.`,
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openActionEditor = useCallback(
    (rows: ListingAdvertisementWithListing[]) => {
      const actionable = rows.filter(
        (advertisement) =>
          getActionBlockReason(
            advertisement,
            latestActionByAdvertisement.get(advertisement.id),
          ) === null,
      );
      if (actionable.length === 0) {
        toast.error(
          rows.length === 1
            ? (getActionBlockReason(
                rows[0],
                latestActionByAdvertisement.get(rows[0].id),
              ) ?? "이 광고는 수정안을 만들 수 없습니다.")
            : "선택한 광고에 수정 가능한 최신 네이버 비교 근거가 없습니다.",
        );
        return;
      }
      if (actionable.length < rows.length) {
        toast.info(
          `진행 중 요청 또는 실행 Skill이 없는 ${rows.length - actionable.length}건은 제외했습니다.`,
        );
      }
      // 표에서 이미 고친 값이 있으면 그대로 이어받는다 — 다이얼로그를 열었다고
      // 원래 가격으로 되돌아가면 사용자가 수정한 줄 알고 원가로 제출하게 된다.
      setActionDrafts(
        actionable.map((advertisement) => {
          const draft = createActionDraft(advertisement);
          const edit = inlineEdits[advertisement.id];
          return edit ? { ...draft, ...edit } : draft;
        }),
      );
      setActionRationale("");
      setActionDialogOpen(true);
    },
    [inlineEdits, latestActionByAdvertisement],
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const updateInlineEdit = useCallback(
    (
      advertisement: ListingAdvertisementWithListing,
      patch: Partial<InlinePriceEdit>,
    ) => {
      setInlineEdits((current) => {
        const base = current[advertisement.id] ?? inlineEditBase(advertisement);
        const nextEdit = { ...base, ...patch };
        if (!isInlineEditDirty(advertisement, nextEdit)) {
          if (!(advertisement.id in current)) return current;
          const next = { ...current };
          delete next[advertisement.id];
          return next;
        }
        return { ...current, [advertisement.id]: nextEdit };
      });
    },
    [],
  );

  const resetInlineEdits = useCallback((advertisementIds: string[]) => {
    const resetIds = new Set(advertisementIds);
    setInlineEdits((current) => {
      if (!Object.keys(current).some((id) => resetIds.has(id))) return current;
      const next = { ...current };
      for (const id of resetIds) delete next[id];
      return next;
    });
  }, []);

  const columns = useMemo(
    () =>
      buildColumns({
        areAdvertisementSourceColumnsCollapsed,
        expandedIds,
        onToggleExpanded: toggleExpanded,
        latestActionByAdvertisement,
        selectedRowIds,
        inlineEdits,
        onInlineEditChange: updateInlineEdit,
        onInlineEditReset: (advertisementId) =>
          resetInlineEdits([advertisementId]),
      }),
    [
      areAdvertisementSourceColumnsCollapsed,
      expandedIds,
      inlineEdits,
      latestActionByAdvertisement,
      selectedRowIds,
      resetInlineEdits,
      updateInlineEdit,
    ],
  );

  const analyzedCount = advertisements.filter(
    (advertisement) =>
      advertisement.officeAdvertisementGroup?.lastSyncedAt != null,
  ).length;
  const comparisonTargetCount = advertisements.filter(
    (advertisement) => advertisement.naverArticleNo != null,
  ).length;
  const attentionCount = counts.attention;
  const latestActions = Array.from(latestActionByAdvertisement.values());
  const pendingReviewCount = latestActions.filter(
    (request) => request.reviewStatus === "pending",
  ).length;
  const pendingReviewRequest =
    latestActions.find((request) => request.reviewStatus === "pending") ?? null;
  const approvedActionCount = latestActions.filter(
    (request) => request.reviewStatus === "approved",
  ).length;
  const activeExecutionCount = latestActions.filter(
    (request) =>
      request.reviewStatus === "approved" &&
      ["awaiting_manual", "queued", "running"].includes(
        request.executionStatus,
      ),
  ).length;
  const executionNeedsInputCount = latestActions.filter(
    (request) =>
      request.reviewStatus === "approved" &&
      request.executionStatus === "needs_input",
  ).length;
  const failedExecutionCount = latestActions.filter(
    (request) =>
      request.reviewStatus === "approved" &&
      (request.executionStatus === "failed" ||
        request.verificationStatus === "mismatch"),
  ).length;
  const completedActionCount = latestActions.filter(
    (request) => request.executionStatus === "succeeded",
  ).length;
  const latestSyncAt = latestAdvertisementSync(advertisements);
  const total = data?.pagination.total ?? advertisements.length;
  const cpVaultStatus = cpCredentialsQuery.data;
  const cpReadyCount =
    cpVaultStatus?.providers.filter((provider) => provider.hasCredentials)
      .length ?? 0;
  const syncStatus = getFullSyncStatusMeta(syncStatusQuery.data);
  const syncWorkflow = getSyncWorkflowPresentation(syncStatusQuery.data, {
    advertisementCount: advertisements.length,
    analyzedCount,
    comparisonTargetCount,
    attentionCount,
    legacyCpDescription: syncStatus.shortLabel,
  });
  const reviewWorkflowState: WorkflowVisualState =
    pendingReviewCount > 0
      ? "needs_input"
      : approvedActionCount > 0 || completedActionCount > 0
        ? "succeeded"
        : syncWorkflow.compare.state === "succeeded"
          ? "ready"
          : "blocked";
  const executionWorkflowState: WorkflowVisualState =
    failedExecutionCount > 0
      ? "failed"
      : executionNeedsInputCount > 0
        ? "needs_input"
        : activeExecutionCount > 0
          ? "running"
          : completedActionCount > 0
            ? "succeeded"
            : "blocked";
  const executionWorkflowDescription =
    failedExecutionCount > 0
      ? `적용 오류 ${failedExecutionCount}건`
      : executionNeedsInputCount > 0
        ? `직원 확인 ${executionNeedsInputCount}건`
        : activeExecutionCount > 0
          ? `적용 중 ${activeExecutionCount}건`
          : `적용 확인 ${completedActionCount}건`;
  const reviewWorkflowDescription =
    pendingReviewCount > 0
      ? `AI 요청함에서 ${pendingReviewCount}건 검토 대기`
      : approvedActionCount > 0
        ? `${approvedActionCount}건 승인 완료`
        : "생성된 수정안 없음";
  const reviewWorkflowTiming = {
    startedAt: earliestWorkflowTimestamp(
      latestActions.map((request) => request.createdAt),
    ),
    finishedAt: latestWorkflowTimestamp(
      latestActions.map((request) => request.decidedAt),
    ),
    updatedAt: latestWorkflowTimestamp(
      latestActions.map((request) => request.updatedAt),
    ),
  };
  const executionWorkflowTiming = {
    startedAt: earliestWorkflowTimestamp(
      latestActions.map((request) => request.decidedAt),
    ),
    finishedAt: latestWorkflowTimestamp(
      latestActions.map((request) => request.verifiedAt ?? request.executedAt),
    ),
    updatedAt: latestWorkflowTimestamp(
      latestActions.map((request) => request.updatedAt),
    ),
  };
  const advertisementResultsReady =
    syncWorkflow.cp.state === "succeeded" &&
    syncWorkflow.resolve.state === "succeeded" &&
    syncWorkflow.compare.state === "succeeded";
  const workflowStages = [
    {
      title: "CP 전체 가져오기",
      state: syncWorkflow.cp.state,
      owner: "agent" as const,
      kind: "automation" as const,
    },
    {
      title: "매물·호실 확정",
      state: syncWorkflow.resolve.state,
      owner: "agent" as const,
      kind: "automation" as const,
    },
    {
      title: "전체 네이버 비교",
      state: syncWorkflow.compare.state,
      owner: "agent" as const,
      kind: "automation" as const,
    },
    {
      title: "수정안 검토·승인",
      state: reviewWorkflowState,
      owner: "human" as const,
      kind: "approval" as const,
    },
    {
      title: "CP 수정·재광고",
      state: executionWorkflowState,
      owner:
        executionNeedsInputCount > 0 ? ("human" as const) : ("agent" as const),
      kind: "execution" as const,
    },
  ];
  const actionableWorkflowStageIndex = workflowStages.findIndex((stage) =>
    ["failed", "needs_input", "running", "queued", "ready"].includes(
      stage.state,
    ),
  );
  const pendingWorkflowStageIndex = workflowStages.findIndex((stage) =>
    ["idle", "blocked"].includes(stage.state),
  );
  const currentWorkflowStageIndex =
    actionableWorkflowStageIndex >= 0
      ? actionableWorkflowStageIndex
      : pendingWorkflowStageIndex >= 0
        ? pendingWorkflowStageIndex
        : workflowStages.length - 1;
  const currentWorkflowStage = workflowStages[currentWorkflowStageIndex];
  const currentWorkflowMeta = getWorkflowVisualStateMeta(
    currentWorkflowStage.state,
  );
  const currentWorkflowOwner = getWorkflowOwnerMeta(
    currentWorkflowStage.owner,
    currentWorkflowStage.kind,
  );
  const currentWorkflowStateLabel = getWorkflowStageStateLabel(
    currentWorkflowStage.state,
    currentWorkflowStage.kind,
  );
  const workflowRun = syncStatusQuery.data?.run ?? null;
  const workflowRunDuration = formatWorkflowDuration(
    workflowRun?.startedAt,
    workflowRun?.completedAt,
  );
  const showWorkflowDetails = !advertisementResultsReady || workflowDetailsOpen;
  const syncBusy =
    syncMutation.isPending ||
    retrySyncMutation.isPending ||
    syncStatusQuery.data?.run?.status === "queued" ||
    syncStatusQuery.data?.run?.status === "running" ||
    syncStatusQuery.data?.wakeup?.status === "queued" ||
    syncStatusQuery.data?.wakeup?.status === "claimed" ||
    syncStatusQuery.data?.session?.status === "active";

  const hasActiveFilters =
    view !== "all" ||
    search.trim().length > 0 ||
    filters.siteIds.length > 0 ||
    filters.dongSearch.trim().length > 0 ||
    filters.unitSearch.trim().length > 0 ||
    filters.transactionType !== "all" ||
    filters.channel !== "all" ||
    filters.primaryAmountMin !== "" ||
    filters.primaryAmountMax !== "" ||
    filters.monthlyRentMin !== "" ||
    filters.monthlyRentMax !== "" ||
    filters.verification !== "all" ||
    filters.floorExposure !== "all" ||
    filters.exposurePeriod !== "all" ||
    filters.comparison !== "all" ||
    sorting.length > 0;

  const updateMyAdsFilter = useCallback(
    <K extends keyof MyAdsFilterState>(
      field: K,
      value: MyAdsFilterState[K],
    ) => {
      setFilters((current) => ({ ...current, [field]: value }));
      setPage(1);
      setExpandedIds(new Set());
      setSelectedRowIds([]);
    },
    [],
  );

  const updateMyAdsRangeFilter = useCallback(
    (kind: "primary" | "monthlyRent", minValue: string, maxValue: string) => {
      setFilters((current) =>
        kind === "primary"
          ? {
              ...current,
              primaryAmountMin: minValue,
              primaryAmountMax: maxValue,
            }
          : {
              ...current,
              monthlyRentMin: minValue,
              monthlyRentMax: maxValue,
            },
      );
      setPage(1);
      setExpandedIds(new Set());
      setSelectedRowIds([]);
    },
    [],
  );

  const handleViewChange = (next: MyAdsView) => {
    setView(next);
    setPage(1);
    setExpandedIds(new Set());
    setSelectedRowIds([]);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    setExpandedIds(new Set());
    setSelectedRowIds([]);
  };

  const handleFiltersReset = () => {
    setView("all");
    setSearch("");
    setFilters({ ...initialMyAdsFilters, siteIds: [] });
    setPage(1);
    setSorting([]);
    setExpandedIds(new Set());
    setSelectedRowIds([]);
  };

  const updateActionDraft = (
    advertisementId: string,
    patch: Partial<AdvertisementActionDraft>,
  ) => {
    setActionDrafts((current) =>
      current.map((draft) =>
        draft.advertisement.id === advertisementId
          ? { ...draft, ...patch }
          : draft,
      ),
    );
  };

  const submitActionDrafts = () => {
    const validationError = validateActionDrafts(actionDrafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    actionMutation.mutate({
      drafts: actionDrafts,
      rationale: actionRationale,
    });
  };

  /** 선택은 편집 모드만 제어한다. 작성한 변경 초안은 명시적으로 취소할 때까지 유지한다. */
  const handleRowSelectionChange = useCallback((ids: string[]) => {
    setSelectedRowIds(ids);
  }, []);

  const draftAdvertisements = useMemo(
    () =>
      advertisements.filter((advertisement) => {
        const edit = inlineEdits[advertisement.id];
        return edit ? isInlineEditDirty(advertisement, edit) : false;
      }),
    [advertisements, inlineEdits],
  );

  const visibleDraftAdvertisements = useMemo(
    () =>
      visibleAdvertisements.filter((advertisement) => {
        const edit = inlineEdits[advertisement.id];
        return edit ? isInlineEditDirty(advertisement, edit) : false;
      }),
    [inlineEdits, visibleAdvertisements],
  );

  /**
   * 원래 값과 실제로 달라진 행만 수정안 대상이다.
   * 지금 화면에 보이고(visibleAdvertisements) 선택된 행으로 한정한다 —
   * 페이지·탭·검색이 바뀌어 보이지 않게 된 행의 수정값이 제출에 섞이면
   * 사용자가 확인하지 못한 광고가 변경될 수 있다.
   */
  const dirtyAdvertisements = useMemo(() => {
    const selected = new Set(selectedRowIds);
    return visibleDraftAdvertisements.filter((advertisement) =>
      selected.has(advertisement.id),
    );
  }, [selectedRowIds, visibleDraftAdvertisements]);

  const submitInlineEdits = () => {
    const blocked: string[] = [];
    const drafts: AdvertisementActionDraft[] = [];
    for (const advertisement of dirtyAdvertisements) {
      const reason = getActionBlockReason(
        advertisement,
        latestActionByAdvertisement.get(advertisement.id),
      );
      if (reason) {
        blocked.push(getCanonicalLocation(advertisement).site);
        continue;
      }
      const edit = inlineEdits[advertisement.id];
      drafts.push({ advertisement, ...edit });
    }
    if (drafts.length === 0) {
      toast.error(
        blocked.length > 0
          ? "수정한 광고에 진행 중 요청이 있거나 최신 네이버 비교 근거가 없습니다."
          : "변경된 광고가 없습니다.",
      );
      return;
    }
    const validationError = validateActionDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (blocked.length > 0) {
      toast.info(`${blocked.length}건은 수정안을 만들 수 없어 제외했습니다.`);
    }
    actionMutation.mutate({ drafts, rationale: "" });
  };

  return (
    <div
      data-canonical-advertisement-source="listing-advertisements"
      className="-mx-4 -mb-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"
    >
      <header className="flex items-start justify-between gap-4 border-b px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-foreground">
              내 광고 관리
            </h1>
            {advertisementResultsReady && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {total.toLocaleString()}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            CP 광고 전체를 가져온 뒤 전부 네이버와 비교하고, 승인한 수정안을 CP
            Skill로 다시 반영합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden text-right lg:block">
            <p className={cn("text-[11px] font-medium", syncStatus.className)}>
              {syncStatus.label}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {latestSyncAt
                ? `CP ${formatDateTime(latestSyncAt)}`
                : "CP 동기화 이력 없음"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={!cpAuthBridge || !officeId}
            onClick={() => setCredentialDialogOpen(true)}
            aria-label="CP 자동 로그인 계정 관리"
          >
            <KeyRound className="size-3.5" />
            CP 계정
            <span
              className={cn(
                "rounded px-1.5 py-px text-[10px] font-semibold tabular-nums",
                cpReadyCount === CP_PROVIDERS.length
                  ? "bg-success-soft text-success"
                  : "bg-warning-soft text-warning",
              )}
            >
              {cpCredentialsQuery.isLoading ? "—" : `${cpReadyCount}/2`}
            </span>
          </Button>
          {advertisementResultsReady && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={() => void refetch()}
              aria-label="목록 새로고침"
            >
              <RefreshCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              목록
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
            disabled={syncBusy}
            onClick={() => syncMutation.mutate()}
          >
            {syncBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {syncBusy ? "전체 동기화 중" : "전체 광고 동기화"}
          </Button>
        </div>
      </header>

      <section
        data-my-ads-workflow
        data-workflow-style="run-ledger"
        data-workflow-current={currentWorkflowStageIndex + 1}
        data-workflow-run-id={workflowRun?.id}
        data-advertisement-results-ready={
          advertisementResultsReady ? "true" : "false"
        }
        aria-label="내 광고 관리 흐름"
        aria-busy={!advertisementResultsReady}
        className={cn(
          "bg-muted/15",
          advertisementResultsReady
            ? "border-b"
            : "flex min-h-0 flex-1 overflow-y-auto px-6 py-5",
        )}
      >
        <div
          className={cn(
            "w-full overflow-hidden bg-background",
            !advertisementResultsReady &&
              "mx-auto max-w-4xl self-start rounded-lg border shadow-sm",
          )}
        >
          <div
            className={cn(
              "flex min-h-[62px] items-center justify-between gap-4 px-5 py-3",
              showWorkflowDetails && "border-b border-border/70",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-info">
                <Bot className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[12px] font-semibold text-foreground">
                    광고 자동화 실행
                  </span>
                  {workflowRun && (
                    <span className="truncate font-mono text-[9.5px] text-muted-foreground">
                      Run {workflowRun.id.slice(0, 8)}
                    </span>
                  )}
                  {workflowRun &&
                    ["queued", "running"].includes(workflowRun.status) && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-info-soft px-1.5 py-0.5 text-[9px] font-semibold text-info">
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-info" />
                        </span>
                        Live
                      </span>
                    )}
                </div>
                <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {workflowRun
                    ? `${formatDateTime(workflowRun.createdAt)} 요청`
                    : "아직 실행 기록 없음"}
                  {workflowRunDuration
                    ? ` · ${
                        workflowRun?.completedAt ? "총" : "경과"
                      } ${workflowRunDuration}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <div
                aria-live="polite"
                className="flex min-w-0 items-center justify-end gap-1.5 text-[10.5px]"
              >
                <span className="hidden text-muted-foreground lg:inline">
                  현재
                </span>
                <span className="truncate font-semibold text-foreground">
                  {String(currentWorkflowStageIndex + 1).padStart(2, "0")}{" "}
                  {currentWorkflowStage.title}
                </span>
                <span
                  data-workflow-owner={currentWorkflowStage.owner}
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-semibold",
                    currentWorkflowOwner.className,
                  )}
                >
                  {currentWorkflowOwner.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-semibold",
                    currentWorkflowMeta.badgeClassName,
                  )}
                >
                  {currentWorkflowStateLabel}
                </span>
              </div>
              {advertisementResultsReady && pendingReviewRequest && (
                <WorkflowReviewLink
                  requestId={pendingReviewRequest.id}
                  count={pendingReviewCount}
                />
              )}
              {advertisementResultsReady && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
                  aria-expanded={showWorkflowDetails}
                  aria-controls="my-ads-workflow-steps"
                  onClick={() => setWorkflowDetailsOpen((open) => !open)}
                >
                  {showWorkflowDetails ? "흐름 접기" : "상세 흐름"}
                  {showWorkflowDetails ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
          {showWorkflowDetails && (
            <ol
              id="my-ads-workflow-steps"
              aria-label="작업 흐름 단계"
              className="list-none divide-y divide-border/70"
            >
              <WorkflowStep
                number="1"
                icon={<ServerCog className="size-3.5" />}
                title="CP 전체 가져오기"
                description={syncWorkflow.cp.description}
                state={syncWorkflow.cp.state}
                owner="agent"
                kind="automation"
                current={currentWorkflowStageIndex === 0}
                startedAt={syncWorkflow.cp.startedAt}
                finishedAt={syncWorkflow.cp.finishedAt}
                updatedAt={syncWorkflow.cp.updatedAt}
                retrying={retrySyncMutation.isPending}
                onRetry={
                  syncWorkflow.cp.retryStepIds.length > 0
                    ? () =>
                        retrySyncMutation.mutate(syncWorkflow.cp.retryStepIds)
                    : undefined
                }
              />
              <WorkflowStep
                number="2"
                icon={<DoorOpen className="size-3.5" />}
                title="매물·호실 확정"
                description={syncWorkflow.resolve.description}
                state={syncWorkflow.resolve.state}
                owner="agent"
                kind="automation"
                current={currentWorkflowStageIndex === 1}
                startedAt={syncWorkflow.resolve.startedAt}
                finishedAt={syncWorkflow.resolve.finishedAt}
                updatedAt={syncWorkflow.resolve.updatedAt}
                retrying={retrySyncMutation.isPending}
                onRetry={
                  syncWorkflow.resolve.retryStepIds.length > 0
                    ? () =>
                        retrySyncMutation.mutate(
                          syncWorkflow.resolve.retryStepIds,
                        )
                    : undefined
                }
              />
              <WorkflowStep
                number="3"
                icon={<FileSearch className="size-3.5" />}
                title="전체 네이버 비교"
                description={syncWorkflow.compare.description}
                state={syncWorkflow.compare.state}
                owner="agent"
                kind="automation"
                current={currentWorkflowStageIndex === 2}
                startedAt={syncWorkflow.compare.startedAt}
                finishedAt={syncWorkflow.compare.finishedAt}
                updatedAt={syncWorkflow.compare.updatedAt}
                retrying={retrySyncMutation.isPending}
                onRetry={
                  syncWorkflow.compare.retryStepIds.length > 0
                    ? () =>
                        retrySyncMutation.mutate(
                          syncWorkflow.compare.retryStepIds,
                        )
                    : undefined
                }
              />
              <WorkflowStep
                number="4"
                icon={<ClipboardCheck className="size-3.5" />}
                title="수정안 검토·승인"
                description={reviewWorkflowDescription}
                state={reviewWorkflowState}
                owner="human"
                kind="approval"
                current={currentWorkflowStageIndex === 3}
                startedAt={reviewWorkflowTiming.startedAt}
                finishedAt={reviewWorkflowTiming.finishedAt}
                updatedAt={reviewWorkflowTiming.updatedAt}
              />
              <WorkflowStep
                number="5"
                icon={<Bot className="size-3.5" />}
                title="CP 수정·재광고"
                description={executionWorkflowDescription}
                state={executionWorkflowState}
                owner={executionNeedsInputCount > 0 ? "human" : "agent"}
                kind="execution"
                current={currentWorkflowStageIndex === 4}
                startedAt={executionWorkflowTiming.startedAt}
                finishedAt={executionWorkflowTiming.finishedAt}
                updatedAt={executionWorkflowTiming.updatedAt}
                last
              />
            </ol>
          )}
        </div>
      </section>

      {advertisementResultsReady && (
        <>
          <section
            data-my-ads-results-toolbar
            className="shrink-0 overflow-x-auto border-b border-border bg-white px-6 py-2"
          >
            <div className="flex w-full min-w-max items-center gap-2">
              <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/80 bg-[#f5f4f1] p-0.5">
                {viewTabs.map((tab) => {
                  const active = view === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => handleViewChange(tab.value)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium",
                        active
                          ? "border border-[#d9d9d6] bg-white text-slate-950 shadow-sm"
                          : "border border-transparent text-muted-foreground hover:bg-white/70 hover:text-foreground",
                      )}
                    >
                      {tab.label}
                      <span className="tabular-nums text-muted-foreground/70">
                        {counts[tab.value]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

              <MultiSelect
                options={siteFilterOptions}
                selected={filters.siteIds}
                onChange={(values) => updateMyAdsFilter("siteIds", values)}
                ariaLabel="내 광고 단지 필터"
                placeholder="단지 전체"
                searchPlaceholder="단지명 또는 주소 검색"
                emptyText="일치하는 단지가 없습니다."
                maxCount={1}
                className={cn(
                  "h-8 min-w-[150px] max-w-[280px] shrink-0 border-transparent bg-[#f7f6f3] px-2.5 text-[13px] shadow-none hover:border-border",
                  filters.siteIds.length > 0 &&
                    "border-foreground/25 bg-foreground/[0.06]",
                )}
                badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
                popoverClassName="w-[360px]"
              />

              <MyAdsFilterTextInput
                value={filters.dongSearch}
                onChange={(value) => updateMyAdsFilter("dongSearch", value)}
                placeholder="동"
                ariaLabel="내 광고 동 필터"
                clearAriaLabel="동 필터 지우기"
                className="w-20"
              />
              <MyAdsFilterTextInput
                value={filters.unitSearch}
                onChange={(value) => updateMyAdsFilter("unitSearch", value)}
                placeholder="호"
                ariaLabel="내 광고 호 필터"
                clearAriaLabel="호 필터 지우기"
                className="w-20"
              />

              <div className="relative min-w-[240px] max-w-[420px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => handleSearch(event.target.value)}
                  placeholder="CP·네이버 광고번호, 메모 검색"
                  aria-label="내 광고 검색"
                  className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="내 광고 검색어 지우기"
                    onClick={() => handleSearch("")}
                    className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <p className="ml-auto hidden text-[11px] text-muted-foreground 2xl:block">
                동기화 실패는 상단에 표시하고, 행에는 현재 CP 광고만 보여줍니다.
              </p>
            </div>
          </section>

          <section
            data-my-ads-filter-rail
            aria-label="내 광고 상세 필터"
            className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6] px-6 py-2"
          >
            <div className="flex w-full min-w-max items-center gap-1.5">
              <MyAdsFilterSelect
                ariaLabel="거래 필터"
                value={filters.transactionType}
                onChange={(value) =>
                  updateMyAdsFilter(
                    "transactionType",
                    value as MyAdsTransactionFilter,
                  )
                }
                options={transactionFilterOptions}
                active={filters.transactionType !== "all"}
                className="w-[116px]"
              />
              <MyAdsFilterSelect
                ariaLabel="CP사 필터"
                value={filters.channel}
                onChange={(value) =>
                  updateMyAdsFilter("channel", value as MyAdsChannelFilter)
                }
                options={channelFilterOptions}
                active={filters.channel !== "all"}
                className="w-[138px]"
              />

              <MyAdsAmountRangeFilter
                label="가격/보증금"
                minValue={filters.primaryAmountMin}
                maxValue={filters.primaryAmountMax}
                onApply={(minValue, maxValue) =>
                  updateMyAdsRangeFilter("primary", minValue, maxValue)
                }
                onClear={() => updateMyAdsRangeFilter("primary", "", "")}
              />
              <MyAdsAmountRangeFilter
                label="월세"
                minValue={filters.monthlyRentMin}
                maxValue={filters.monthlyRentMax}
                onApply={(minValue, maxValue) =>
                  updateMyAdsRangeFilter("monthlyRent", minValue, maxValue)
                }
                onClear={() => updateMyAdsRangeFilter("monthlyRent", "", "")}
                compact
              />

              <div
                className="mx-0.5 h-5 w-px shrink-0 bg-border"
                aria-hidden="true"
              />

              <MyAdsFilterSelect
                ariaLabel="검증방식 필터"
                value={filters.verification}
                onChange={(value) =>
                  updateMyAdsFilter(
                    "verification",
                    value as MyAdsVerificationFilter,
                  )
                }
                options={verificationFilterOptions}
                active={filters.verification !== "all"}
                className="w-[144px]"
              />
              <MyAdsFilterSelect
                ariaLabel="층수노출 필터"
                value={filters.floorExposure}
                onChange={(value) =>
                  updateMyAdsFilter(
                    "floorExposure",
                    value as MyAdsFloorExposureFilter,
                  )
                }
                options={floorExposureFilterOptions}
                active={filters.floorExposure !== "all"}
                className="w-[140px]"
              />
              <MyAdsFilterSelect
                ariaLabel="노출기간 필터"
                value={filters.exposurePeriod}
                onChange={(value) =>
                  updateMyAdsFilter(
                    "exposurePeriod",
                    value as MyAdsExposurePeriodFilter,
                  )
                }
                options={exposurePeriodFilterOptions}
                active={filters.exposurePeriod !== "all"}
                className="w-[140px]"
              />
              <MyAdsFilterSelect
                ariaLabel="경쟁 대비 필터"
                value={filters.comparison}
                onChange={(value) =>
                  updateMyAdsFilter(
                    "comparison",
                    value as MyAdsComparisonFilter,
                  )
                }
                options={comparisonFilterOptions}
                active={filters.comparison !== "all"}
                className="w-[164px]"
              />

              <div className="ml-auto flex items-center gap-1.5 pl-3">
                <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                  {isFetching && <Loader2 className="size-3 animate-spin" />}
                  필터 결과
                  <span className="font-medium tabular-nums text-foreground">
                    {sortedAdvertisements.length.toLocaleString()}
                  </span>
                  /{" "}
                  {(
                    data?.pagination.total ?? advertisements.length
                  ).toLocaleString()}
                  건
                </span>
                {hasActiveFilters && (
                  <>
                    <div className="mx-0.5 h-4 w-px bg-border" />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="내 광고 필터 초기화"
                      className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                      onClick={handleFiltersReset}
                    >
                      <RotateCcw className="size-3.5" />
                      초기화
                    </Button>
                  </>
                )}
              </div>
            </div>
          </section>

          <section
            data-my-ads-results
            data-my-ads-table-style="property-list"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            {isError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                <CircleAlert className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  내 광고 목록을 불러오지 못했습니다.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                >
                  <RefreshCw className="size-3.5" />
                  다시 시도
                </Button>
              </div>
            ) : (
              <DataTable
                key={myAdsTableFilterScopeKey(view, search, filters)}
                columns={columns}
                data={visibleAdvertisements}
                layout="full-height"
                variant="notion"
                rowHeight={40}
                pinnedColumns={["site", "dong", "floor", "ho"]}
                columnGroupControls={[
                  {
                    collapsed: areAdvertisementSourceColumnsCollapsed,
                    onToggle: () =>
                      setAreAdvertisementSourceColumnsCollapsed(
                        (collapsed) => !collapsed,
                      ),
                    anchorColumnId: "monthlyRent",
                    columnIds: [
                      "channel",
                      "naver",
                      "verification",
                      "exposurePeriod",
                    ],
                    label: "광고 정보",
                  },
                ]}
                sorting={sorting}
                onSortingChange={setSorting}
                enableRowSelection
                onRowSelectionChange={handleRowSelectionChange}
                renderBulkActions={(selectedRows) => (
                  <div className="flex items-center gap-1">
                    <span className="text-[11.5px] text-muted-foreground">
                      {dirtyAdvertisements.length > 0
                        ? `변경 초안 ${dirtyAdvertisements.length}건 · AI 요청 전`
                        : "가격·월세를 직접 수정하세요"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11.5px]"
                      disabled={
                        dirtyAdvertisements.length === 0 ||
                        actionMutation.isPending
                      }
                      onClick={submitInlineEdits}
                    >
                      {actionMutation.isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Send className="size-3" />
                      )}
                      {dirtyAdvertisements.length > 0
                        ? `${dirtyAdvertisements.length}건 검토 요청`
                        : "검토 요청"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11.5px] text-muted-foreground"
                      disabled={dirtyAdvertisements.length === 0}
                      onClick={() =>
                        resetInlineEdits(
                          dirtyAdvertisements.map(
                            (advertisement) => advertisement.id,
                          ),
                        )
                      }
                    >
                      <RotateCcw className="size-3" />
                      변경 취소
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11.5px] text-muted-foreground"
                      onClick={() => openActionEditor(selectedRows)}
                    >
                      <Pencil className="size-3" />
                      상세 편집
                    </Button>
                  </div>
                )}
                expandedRowIds={expandedIds}
                renderExpandedRow={(advertisement) => (
                  <AdvertisementAnalysisPanel
                    advertisement={advertisement}
                    onEditAdvertisement={() =>
                      openActionEditor([advertisement])
                    }
                  />
                )}
                isLoading={isLoading}
                emptyMessage={
                  search.trim() || view !== "all"
                    ? "조건에 맞는 광고가 없습니다."
                    : "전체 광고 동기화를 실행하면 CP 광고를 가져오고 전부 네이버와 비교합니다."
                }
                renderStatusBar={() => (
                  <>
                    <span className="tabular-nums">
                      표시 {visibleAdvertisements.length.toLocaleString()} /
                      검색 결과 {sortedAdvertisements.length.toLocaleString()}건
                    </span>
                    {draftAdvertisements.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 font-medium text-warning">
                        <Pencil className="size-3" />
                        변경 초안 {draftAdvertisements.length}건
                      </span>
                    )}
                    <span className="ml-2 hidden items-center gap-1 lg:inline-flex">
                      <span className="size-1.5 rounded-full bg-success" />
                      CP 광고 {counts.all}
                    </span>
                    <span className="hidden items-center gap-1 lg:inline-flex">
                      <span className="size-1.5 rounded-full bg-warning" />
                      비교 대기 {counts.comparison_pending}
                    </span>
                    {pageCount > 1 && (
                      <div className="ml-auto flex items-center gap-1">
                        <span className="mr-1 tabular-nums">
                          {currentPage} / {pageCount}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1"
                          disabled={currentPage <= 1}
                          onClick={() =>
                            setPage((current) => Math.max(1, current - 1))
                          }
                        >
                          <ChevronLeft className="size-3" />
                          <span className="sr-only">이전 페이지</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1"
                          disabled={currentPage >= pageCount}
                          onClick={() => setPage((current) => current + 1)}
                        >
                          <ChevronRight className="size-3" />
                          <span className="sr-only">다음 페이지</span>
                        </Button>
                      </div>
                    )}
                  </>
                )}
              />
            )}
          </section>
        </>
      )}
      {officeId && cpAuthBridge && (
        <CpCredentialDialog
          open={credentialDialogOpen}
          officeId={officeId}
          bridge={cpAuthBridge}
          status={cpVaultStatus}
          isStatusLoading={cpCredentialsQuery.isLoading}
          onOpenChange={setCredentialDialogOpen}
          onStatusChange={(status) =>
            queryClient.setQueryData(
              [...CP_CREDENTIAL_QUERY_KEY, officeId],
              status,
            )
          }
        />
      )}
      <AdvertisementActionDialog
        open={actionDialogOpen}
        drafts={actionDrafts}
        rationale={actionRationale}
        isSubmitting={actionMutation.isPending}
        onOpenChange={(open) => {
          if (actionMutation.isPending) return;
          setActionDialogOpen(open);
          if (!open) {
            setActionDrafts([]);
            setActionRationale("");
          }
        }}
        onDraftChange={updateActionDraft}
        onRationaleChange={setActionRationale}
        onSubmit={submitActionDrafts}
      />
    </div>
  );
}

const CP_PROVIDER_META: Record<
  CpProvider,
  { label: string; description: string }
> = {
  esiljang: {
    label: "이실장",
    description: "aipartner.com 광고 전체 수집",
  },
  budongsanbank: {
    label: "부동산뱅크",
    description: "neonet.co.kr 광고 전체 수집",
  },
};

type CpCredentialDraft = {
  username: string;
  password: string;
};

function CpCredentialDialog({
  open,
  officeId,
  bridge,
  status,
  isStatusLoading,
  onOpenChange,
  onStatusChange,
}: {
  open: boolean;
  officeId: string;
  bridge: CpAuthRendererBridge;
  status: CpVaultStatus | undefined;
  isStatusLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (status: CpVaultStatus) => void;
}) {
  const [drafts, setDrafts] = useState<Record<CpProvider, CpCredentialDraft>>({
    esiljang: { username: "", password: "" },
    budongsanbank: { username: "", password: "" },
  });
  const [visiblePasswords, setVisiblePasswords] = useState<
    ReadonlySet<CpProvider>
  >(new Set());
  const [busyProvider, setBusyProvider] = useState<CpProvider | null>(null);
  const [removalProvider, setRemovalProvider] = useState<CpProvider | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setVisiblePasswords(new Set());
      setDrafts({
        esiljang: { username: "", password: "" },
        budongsanbank: { username: "", password: "" },
      });
    }
  }, [open]);

  const updateDraft = (
    provider: CpProvider,
    patch: Partial<CpCredentialDraft>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [provider]: { ...current[provider], ...patch },
    }));
  };

  const handleSave = async (provider: CpProvider) => {
    const draft = drafts[provider];
    if (!draft.username.trim() || !draft.password) {
      toast.error(
        `${CP_PROVIDER_META[provider].label} 아이디와 비밀번호를 입력해 주세요.`,
      );
      return;
    }
    setBusyProvider(provider);
    try {
      const nextStatus = await bridge.save({
        officeId,
        provider,
        username: draft.username,
        password: draft.password,
      });
      onStatusChange(nextStatus);
      updateDraft(provider, { username: "", password: "" });
      setVisiblePasswords((current) => {
        const next = new Set(current);
        next.delete(provider);
        return next;
      });
      toast.success(
        `${CP_PROVIDER_META[provider].label} 계정을 이 PC의 보안 저장소에 저장했습니다.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyProvider(null);
    }
  };

  const handlePrepare = async (provider: CpProvider) => {
    setBusyProvider(provider);
    try {
      const result = await bridge.prepareSession({ officeId, provider });
      onStatusChange(await bridge.getStatus({ officeId }));
      if (result.status === "authenticated") {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyProvider(null);
    }
  };

  const handleRemove = async () => {
    if (!removalProvider) return;
    const provider = removalProvider;
    setBusyProvider(provider);
    try {
      onStatusChange(await bridge.remove({ officeId, provider }));
      toast.success(
        `${CP_PROVIDER_META[provider].label} 계정과 로그인 세션을 이 PC에서 삭제했습니다.`,
      );
      setRemovalProvider(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
                <LockKeyhole className="size-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base">
                  CP 자동 로그인 계정
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-5">
                  아이디와 비밀번호는 서버로 전송하지 않고 이 PC에서만
                  암호화합니다. Skill에는 평문 대신 로그인 준비 결과만
                  전달됩니다.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-3 bg-muted/25 p-5 md:grid-cols-2">
            {CP_PROVIDERS.map((provider) => {
              const meta = CP_PROVIDER_META[provider];
              const providerStatus = status?.providers.find(
                (item) => item.provider === provider,
              );
              const saved = providerStatus?.hasCredentials === true;
              const busy = busyProvider === provider;
              const passwordVisible = visiblePasswords.has(provider);
              const draft = drafts[provider];
              return (
                <form
                  key={provider}
                  data-cp-credential-provider={provider}
                  className="flex min-w-0 flex-col rounded-lg border bg-background"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave(provider);
                  }}
                >
                  <div className="flex min-h-16 items-start justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-semibold text-foreground">
                          {meta.label}
                        </h3>
                        <span
                          className={cn(
                            "rounded px-1.5 py-px text-[10px] font-semibold",
                            saved
                              ? "bg-success-soft text-success"
                              : "bg-warning-soft text-warning",
                          )}
                        >
                          {saved ? "저장됨" : "미저장"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    <MonitorCog className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  </div>

                  <div className="flex min-h-[62px] items-center justify-between gap-3 border-b bg-muted/20 px-4 py-2.5">
                    {isStatusLoading ? (
                      <span className="text-xs text-muted-foreground">
                        저장 상태 확인 중…
                      </span>
                    ) : saved ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {providerStatus?.maskedUsername}
                        </p>
                        <p className="mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">
                          {providerStatus?.lastVerifiedAt
                            ? `로그인 확인 ${formatDateTime(providerStatus.lastVerifiedAt)}`
                            : providerStatus?.updatedAt
                              ? `저장 ${formatDateTime(providerStatus.updatedAt)}`
                              : "이 PC에 암호화 저장됨"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        무인 동기화를 위해 계정을 저장해 주세요.
                      </span>
                    )}
                    {saved && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive-soft hover:text-destructive"
                        disabled={busy}
                        onClick={() => setRemovalProvider(provider)}
                      >
                        <Trash2 className="size-3" />
                        삭제
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3 px-4 py-3.5">
                    <div>
                      <Label
                        htmlFor={`${provider}-credential-username`}
                        className="text-[11px] text-muted-foreground"
                      >
                        아이디
                      </Label>
                      <Input
                        id={`${provider}-credential-username`}
                        value={draft.username}
                        autoComplete="off"
                        disabled={busy}
                        placeholder={
                          saved ? "변경할 아이디" : `${meta.label} 아이디`
                        }
                        className="mt-1 h-8 bg-muted/30 text-xs"
                        onChange={(event) =>
                          updateDraft(provider, {
                            username: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`${provider}-credential-password`}
                        className="text-[11px] text-muted-foreground"
                      >
                        비밀번호
                      </Label>
                      <div className="relative mt-1">
                        <Input
                          id={`${provider}-credential-password`}
                          type={passwordVisible ? "text" : "password"}
                          value={draft.password}
                          autoComplete="off"
                          disabled={busy}
                          placeholder={
                            saved ? "변경할 비밀번호" : `${meta.label} 비밀번호`
                          }
                          className="h-8 bg-muted/30 pr-9 text-xs"
                          onChange={(event) =>
                            updateDraft(provider, {
                              password: event.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={
                            passwordVisible
                              ? `${meta.label} 비밀번호 숨기기`
                              : `${meta.label} 비밀번호 보기`
                          }
                          className="absolute right-0 top-0 flex size-8 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() =>
                            setVisiblePasswords((current) => {
                              const next = new Set(current);
                              if (next.has(provider)) next.delete(provider);
                              else next.add(provider);
                              return next;
                            })
                          }
                        >
                          {passwordVisible ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-2 border-t px-4 py-3">
                    {saved && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={busy}
                        onClick={() => void handlePrepare(provider)}
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="size-3.5" />
                        )}
                        로그인 확인
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={
                        busy || !draft.username.trim() || !draft.password
                      }
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="size-3.5" />
                      )}
                      {saved ? "계정 변경" : "계정 저장"}
                    </Button>
                  </div>
                </form>
              );
            })}
          </div>

          <div className="flex items-start gap-2 border-t bg-background px-6 py-3 text-[11px] leading-4 text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
            <span>
              저장 위치: 이 기기의{" "}
              {status?.encryptionBackend ?? "OS 보안 저장소"} · 로컬 실행기{" "}
              <span className="font-mono">
                {status?.deviceId
                  ? `${status.deviceId.slice(0, 8)}…`
                  : "확인 중"}
              </span>
            </span>
          </div>

          {!status?.available && status && (
            <div className="border-t bg-destructive-soft px-6 py-3 text-xs text-destructive">
              운영체제 보안 저장소를 사용할 수 없어 계정을 저장할 수 없습니다.
            </div>
          )}

          <DialogFooter className="border-t px-6 py-4">
            <Button
              variant="outline"
              size="sm"
              disabled={busyProvider !== null}
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removalProvider !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && busyProvider === null) setRemovalProvider(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {removalProvider
                ? `${CP_PROVIDER_META[removalProvider].label} 계정을 삭제할까요?`
                : "CP 계정을 삭제할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-5">
              이 PC에 저장된 암호화 자격증명과 브라우저 로그인 세션이 함께
              삭제됩니다. 서버의 광고 데이터와 실행 이력은 삭제되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyProvider !== null}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyProvider !== null}
              onClick={(event) => {
                event.preventDefault();
                void handleRemove();
              }}
            >
              {busyProvider ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-3.5" />
              )}
              이 PC에서 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AdvertisementActionDialog({
  open,
  drafts,
  rationale,
  isSubmitting,
  onOpenChange,
  onDraftChange,
  onRationaleChange,
  onSubmit,
}: {
  open: boolean;
  drafts: AdvertisementActionDraft[];
  rationale: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (
    advertisementId: string,
    patch: Partial<AdvertisementActionDraft>,
  ) => void;
  onRationaleChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88svh,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Pencil className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-base">CP 광고 수정안</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                네이버 비교 근거를 보면서 최종 조건을 편집합니다. 수정안은 바로
                실행되지 않고 검토·승인 후 CP Skill에 전달됩니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(200px,1fr)_minmax(240px,auto)_132px] items-center gap-4 border-b bg-[#f7f7f5] px-6 py-2 text-[11px] font-medium text-slate-500">
            <span>광고</span>
            <span>승인할 최종 조건 · 만원</span>
            <span className="text-right">저장 후 재광고</span>
          </div>
          {drafts.map((draft) => {
            const advertisement = draft.advertisement;
            const location = getCanonicalLocation(advertisement);
            const transactionType =
              advertisement.listing?.transactionType ?? "sale";
            const recommendedMin =
              transactionType === "monthly"
                ? null
                : advertisement.officeAdvertisementGroup?.relatedPriceMin;
            return (
              <div
                key={advertisement.id}
                className="grid grid-cols-[minmax(200px,1fr)_minmax(240px,auto)_132px] items-center gap-4 border-b px-6 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-slate-900">
                      {location.site}
                    </span>
                    <StatusBadge
                      kind="transactionType"
                      status={transactionType}
                      size="sm"
                    />
                    <span className="truncate text-xs text-slate-600">
                      {[location.dong, location.floor, location.ho]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate text-[11px] text-muted-foreground"
                    title={`${cpChannelLabel(advertisement.channel)} ${advertisement.externalAdId ?? "광고번호 없음"} · 네이버 ${advertisement.naverArticleNo ?? "연결 대기"}`}
                  >
                    네이버 관측 {observedAdvertisementPriceLabel(advertisement)}
                    {" · "}
                    {cpChannelLabel(advertisement.channel)}{" "}
                    {advertisement.externalAdId ?? "광고번호 없음"}
                  </p>
                </div>

                <div className="min-w-0">
                  {transactionType === "monthly" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <MoneyDraftField
                        id={`${advertisement.id}-deposit`}
                        label="보증금"
                        value={draft.advertisedDeposit}
                        onChange={(value) =>
                          onDraftChange(advertisement.id, {
                            advertisedDeposit: value,
                          })
                        }
                      />
                      <MoneyDraftField
                        id={`${advertisement.id}-monthly-rent`}
                        label="월세"
                        value={draft.advertisedMonthlyRent}
                        onChange={(value) =>
                          onDraftChange(advertisement.id, {
                            advertisedMonthlyRent: value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <MoneyDraftField
                      id={`${advertisement.id}-primary-price`}
                      label={transactionType === "jeonse" ? "전세가" : "매매가"}
                      value={
                        transactionType === "jeonse"
                          ? draft.advertisedDeposit
                          : draft.advertisedPrice
                      }
                      onChange={(value) =>
                        onDraftChange(
                          advertisement.id,
                          transactionType === "jeonse"
                            ? { advertisedDeposit: value }
                            : { advertisedPrice: value },
                        )
                      }
                    />
                  )}
                  {recommendedMin != null && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] font-medium text-info hover:underline"
                      onClick={() =>
                        onDraftChange(
                          advertisement.id,
                          transactionType === "sale"
                            ? { advertisedPrice: String(recommendedMin) }
                            : { advertisedDeposit: String(recommendedMin) },
                        )
                      }
                    >
                      비교 최저가 {formatMoney(recommendedMin)} 적용
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <Switch
                    id={`${advertisement.id}-republish`}
                    size="sm"
                    checked={draft.republishAfterSave}
                    onCheckedChange={(checked) =>
                      onDraftChange(advertisement.id, {
                        republishAfterSave: checked,
                      })
                    }
                    aria-label={`${location.site} 저장 후 재광고`}
                    title={
                      draft.republishAfterSave
                        ? "조건 저장 후 이실장의 바로 재광고까지 승인"
                        : "조건만 저장하고 현재 광고 순서는 유지"
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t bg-[#fbfbfa] px-6 py-3">
          <Label htmlFor="my-ads-action-rationale" className="text-xs">
            수정 사유
          </Label>
          <Textarea
            id="my-ads-action-rationale"
            value={rationale}
            onChange={(event) => onRationaleChange(event.target.value)}
            placeholder="예: 동일 호실 최저가와 맞추고 오늘자로 재광고"
            className="mt-1.5 min-h-12 resize-none bg-white text-xs"
          />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>
              광고별로 독립된 승인 요청이 만들어집니다. 승인 전에는 이실장
              화면을 수정하지 않으며, 승인 후 저장값을 다시 읽어 일치할 때만
              완료 처리합니다.
            </span>
          </p>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={isSubmitting || drafts.length === 0}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {drafts.length}건 검토 요청 만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoneyDraftField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor={id}
        className="w-12 shrink-0 text-[11px] text-muted-foreground"
      >
        {label}
      </Label>
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 bg-white pr-10 text-right text-xs tabular-nums"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-muted-foreground">
          만원
        </span>
      </div>
    </div>
  );
}

function WorkflowReviewLink({
  requestId,
  count,
}: {
  requestId: string;
  count: number;
}) {
  return (
    <Button asChild size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs">
      <Link
        to="/ai-requests"
        search={{ requestId, origin: "my-ads" }}
        data-workflow-review-link
        aria-label={`AI 요청함에서 수정안 ${count}건 검토`}
      >
        <ClipboardCheck className="size-3.5" />
        수정안 {count}건 검토
        <ChevronRight className="size-3.5" />
      </Link>
    </Button>
  );
}

function WorkflowStep({
  number,
  icon,
  title,
  description,
  state = "idle",
  owner,
  kind,
  current,
  startedAt,
  finishedAt,
  updatedAt,
  retrying = false,
  onRetry,
  last = false,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  state?: WorkflowVisualState;
  owner: "agent" | "human";
  kind: "automation" | "approval" | "execution";
  current: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  retrying?: boolean;
  onRetry?: () => void;
  last?: boolean;
}) {
  const meta = getWorkflowVisualStateMeta(state);
  const ownerMeta = getWorkflowOwnerMeta(owner, kind);
  const stateLabel = getWorkflowStageStateLabel(state, kind);
  const timing = getWorkflowTimingPresentation({
    state,
    kind,
    startedAt,
    finishedAt,
    updatedAt,
  });
  return (
    <li
      data-workflow-state={state}
      data-workflow-owner={owner}
      data-workflow-current={current ? "true" : undefined}
      aria-current={current ? "step" : undefined}
      className={cn(
        "relative min-w-0",
        current && "bg-info-soft/20",
        current && state === "needs_input" && "bg-warning-soft/25",
        current && state === "failed" && "bg-destructive-soft/20",
      )}
    >
      {!last && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -bottom-8 left-[33px] top-9 z-0 w-px bg-border",
            state === "succeeded" && "bg-success/40",
          )}
        />
      )}
      <div className="relative z-[1] flex min-h-[58px] min-w-0 items-center gap-3 px-5 py-2.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm",
            meta.iconClassName,
          )}
        >
          {state === "running" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : state === "succeeded" ? (
            <CircleCheck className="size-3.5" />
          ) : state === "failed" ? (
            <CircleAlert className="size-3.5" />
          ) : state === "needs_input" ? (
            <CircleAlert className="size-3.5" />
          ) : (
            icon
          )}
        </span>
        <span className="w-5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {String(number).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold text-foreground">
              {title}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1 py-px text-[9px] font-semibold",
                ownerMeta.className,
              )}
            >
              {ownerMeta.label}
            </span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span
              className="block min-w-0 truncate text-[10.5px] leading-4 text-muted-foreground"
              title={description}
            >
              {description}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground md:hidden">
            <time
              title={
                timing.timestamp
                  ? new Date(timing.timestamp).toLocaleString("ko-KR")
                  : undefined
              }
            >
              {timing.primary}
            </time>
            {timing.secondary && <span>· {timing.secondary}</span>}
          </span>
        </span>
        <span className="hidden w-[128px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground md:block">
          <time
            className="block"
            title={
              timing.timestamp
                ? new Date(timing.timestamp).toLocaleString("ko-KR")
                : undefined
            }
          >
            {timing.primary}
          </time>
          {timing.secondary && (
            <span className="mt-0.5 block text-[9.5px]">
              {timing.secondary}
            </span>
          )}
        </span>
        <span
          className={cn(
            "w-[62px] shrink-0 rounded px-1.5 py-0.5 text-center text-[9.5px] font-semibold",
            meta.badgeClassName,
          )}
        >
          {stateLabel}
        </span>
        {onRetry && (
          <button
            type="button"
            className="w-11 shrink-0 text-[10px] font-semibold text-destructive hover:underline disabled:opacity-50"
            disabled={retrying}
            onClick={onRetry}
          >
            재시도
          </button>
        )}
      </div>
    </li>
  );
}

function MyAdsFilterTextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearAriaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearAriaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 border-transparent bg-[#f7f6f3] px-2 pr-7 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
      />
      {value && (
        <button
          type="button"
          aria-label={clearAriaLabel}
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function MyAdsFilterSelect({
  ariaLabel,
  value,
  onChange,
  options,
  active,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: MyAdsFilterOption[];
  active: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn(
          "h-8 shrink-0 border-border bg-white px-2.5 text-xs text-muted-foreground shadow-none",
          active && "border-foreground/25 bg-foreground/[0.06] text-foreground",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="text-[13px]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MyAdsAmountRangeFilter({
  label,
  minValue,
  maxValue,
  onApply,
  onClear,
  compact = false,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onApply: (minValue: string, maxValue: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(minValue);
  const [draftMax, setDraftMax] = useState(maxValue);
  const active = minValue !== "" || maxValue !== "";
  const parsedMin = parseAmountFilterValue(draftMin);
  const parsedMax = parseAmountFilterValue(draftMax);
  const hasInvalidRange =
    parsedMin != null && parsedMax != null && parsedMin > parsedMax;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftMin(minValue);
      setDraftMax(maxValue);
    }
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${label} 필터`}
          className={cn(
            "h-8 shrink-0 justify-between gap-1.5 border border-border bg-white px-2.5 text-xs font-normal text-muted-foreground shadow-none hover:bg-white",
            active &&
              "border-foreground/25 bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.09]",
            compact ? "w-[118px]" : "w-[158px]",
          )}
        >
          <span className="min-w-0 truncate">
            {active
              ? myAdsAmountRangeSummary(minValue, maxValue)
              : `${label} 전체`}
          </span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              CP 광고가 기준 · 만원 단위
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${label}-min`} className="text-xs">
                최소
              </Label>
              <Input
                id={`${label}-min`}
                type="number"
                inputMode="numeric"
                min={0}
                value={draftMin}
                onChange={(event) => setDraftMin(event.target.value)}
                placeholder="제한 없음"
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${label}-max`} className="text-xs">
                최대
              </Label>
              <Input
                id={`${label}-max`}
                type="number"
                inputMode="numeric"
                min={0}
                value={draftMax}
                onChange={(event) => setDraftMax(event.target.value)}
                placeholder="제한 없음"
                className="h-8 text-xs tabular-nums"
              />
            </div>
          </div>
          {hasInvalidRange && (
            <p className="text-xs text-destructive">
              최대값은 최소값보다 크거나 같아야 합니다.
            </p>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              disabled={!active && draftMin === "" && draftMax === ""}
              onClick={() => {
                setDraftMin("");
                setDraftMax("");
                onClear();
                setOpen(false);
              }}
            >
              초기화
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={hasInvalidRange}
              onClick={() => {
                onApply(draftMin.trim(), draftMax.trim());
                setOpen(false);
              }}
            >
              적용
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function parseAmountFilterValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function myAdsAmountRangeSummary(minValue: string, maxValue: string): string {
  const min = parseAmountFilterValue(minValue);
  const max = parseAmountFilterValue(maxValue);
  if (min != null && max != null) {
    return `${formatMyAdsFilterAmount(min)}~${formatMyAdsFilterAmount(max)}`;
  }
  if (min != null) return `${formatMyAdsFilterAmount(min)} 이상`;
  if (max != null) return `${formatMyAdsFilterAmount(max)} 이하`;
  return "전체";
}

function formatMyAdsFilterAmount(value: number): string {
  return value === 0 ? "0" : formatMoney(value);
}

function buildColumns({
  areAdvertisementSourceColumnsCollapsed,
  expandedIds,
  onToggleExpanded,
  latestActionByAdvertisement,
  selectedRowIds,
  inlineEdits,
  onInlineEditChange,
  onInlineEditReset,
}: {
  areAdvertisementSourceColumnsCollapsed: boolean;
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  latestActionByAdvertisement: ReadonlyMap<string, AgentActionRequest>;
  selectedRowIds: string[];
  inlineEdits: Record<string, InlinePriceEdit>;
  onInlineEditChange: (
    advertisement: ListingAdvertisementWithListing,
    patch: Partial<InlinePriceEdit>,
  ) => void;
  onInlineEditReset: (advertisementId: string) => void;
}): ColumnDef<ListingAdvertisementWithListing, unknown>[] {
  return [
    {
      id: "site",
      size: 156,
      header: () => (
        <TableHeaderLabel
          icon={<Building2 className="size-4" />}
          label="단지"
        />
      ),
      cell: ({ row }) => {
        const advertisement = row.original;
        const siteName = getCanonicalLocation(advertisement).site;
        return advertisement.listing ? (
          <Link
            to="/properties/$id"
            params={{ id: advertisement.listing.propertyId }}
            onClick={(event) => event.stopPropagation()}
            className="block truncate text-[14px] font-semibold text-slate-900 hover:text-info hover:underline"
          >
            {siteName}
          </Link>
        ) : (
          <span className="block truncate text-[14px] font-semibold text-slate-900">
            {siteName}
          </span>
        );
      },
    },
    {
      id: "dong",
      size: 58,
      header: () => (
        <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />
      ),
      cell: ({ row }) => (
        <CellText className="font-medium text-slate-900">
          {getCanonicalLocation(row.original).dong ?? "—"}
        </CellText>
      ),
    },
    {
      id: "floor",
      size: 58,
      header: () => (
        <TableHeaderLabel icon={<Layers3 className="size-4" />} label="층" />
      ),
      cell: ({ row }) => (
        <CellText className="tabular-nums">
          {getCanonicalLocation(row.original).floor ?? "—"}
        </CellText>
      ),
    },
    {
      id: "ho",
      size: 58,
      header: () => (
        <TableHeaderLabel icon={<DoorOpen className="size-4" />} label="호" />
      ),
      cell: ({ row }) => (
        <CellText className="font-medium text-slate-900">
          {getCanonicalLocation(row.original).ho ?? "—"}
        </CellText>
      ),
    },
    {
      id: "type",
      size: 64,
      header: () => (
        <TableHeaderLabel icon={<Ruler className="size-4" />} label="타입" />
      ),
      cell: ({ row }) => (
        <CellText>{getCanonicalLocation(row.original).type ?? "—"}</CellText>
      ),
    },
    {
      id: "transaction",
      size: 60,
      header: () => (
        <TableHeaderLabel
          icon={<BadgeCheck className="size-4" />}
          label="거래"
        />
      ),
      cell: ({ row }) =>
        row.original.listing?.transactionType ? (
          <PropertyTableTransactionBadge
            transactionType={row.original.listing.transactionType}
          />
        ) : (
          <CellText>—</CellText>
        ),
    },
    {
      id: "price",
      size: 155,
      header: () => (
        <TableHeaderLabel
          icon={<CircleDollarSign className="size-4" />}
          label="가격/보증금"
        />
      ),
      cell: ({ row }) => (
        <InlinePriceCell
          advertisement={row.original}
          selected={selectedRowIds.includes(row.original.id)}
          edit={inlineEdits[row.original.id]}
          request={latestActionByAdvertisement.get(row.original.id)}
          onChange={(patch) => onInlineEditChange(row.original, patch)}
          onReset={() => onInlineEditReset(row.original.id)}
        />
      ),
    },
    {
      id: "monthlyRent",
      size: 82,
      header: () => (
        <TableHeaderLabel
          icon={<CircleDollarSign className="size-4" />}
          label="월세"
        />
      ),
      cell: ({ row }) => (
        <InlineMonthlyRentCell
          advertisement={row.original}
          selected={selectedRowIds.includes(row.original.id)}
          edit={inlineEdits[row.original.id]}
          onChange={(patch) => onInlineEditChange(row.original, patch)}
        />
      ),
    },
    ...(!areAdvertisementSourceColumnsCollapsed
      ? ([
          {
            id: "channel",
            size: 90,
            header: () => (
              <TableHeaderLabel
                icon={<ServerCog className="size-4" />}
                label="CP사"
              />
            ),
            cell: ({ row }) => (
              <CpAdvertisementCell advertisement={row.original} />
            ),
          },
          {
            id: "naver",
            size: 90,
            enableSorting: false,
            header: () => (
              <TableHeaderLabel
                icon={<Megaphone className="size-4" />}
                label="링크"
              />
            ),
            cell: ({ row }) => (
              <NaverAdvertisementCell advertisement={row.original} />
            ),
          },
          {
            id: "verification",
            size: 96,
            header: () => (
              <TableHeaderLabel
                icon={<ShieldCheck className="size-4" />}
                label="검증방식"
              />
            ),
            cell: ({ row }) => (
              <VerificationMethodCell advertisement={row.original} />
            ),
          },
          {
            id: "exposurePeriod",
            size: 108,
            header: () => (
              <TableHeaderLabel
                icon={<CalendarCheck className="size-4" />}
                label="노출기간"
              />
            ),
            cell: ({ row }) => (
              <AdvertisementExposurePeriodCell advertisement={row.original} />
            ),
          },
        ] satisfies ColumnDef<ListingAdvertisementWithListing, unknown>[])
      : []),
    {
      id: "ranking",
      size: 96,
      header: () => (
        <TableHeaderLabel
          icon={<BarChart3 className="size-4" />}
          label="랭킹·중복"
        />
      ),
      cell: ({ row }) => {
        const advertisement = row.original;
        const group = advertisement.officeAdvertisementGroup;
        const ranking = group?.mainAdvertisement?.ranking;
        const comparison = analyzeOfficeAdvertisementComparison(advertisement);
        const expanded = expandedIds.has(advertisement.id);
        return (
          <button
            type="button"
            aria-label={`${getCanonicalLocation(advertisement).site} 네이버 비교 상세`}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded(advertisement.id);
            }}
            className={cn(
              PROPERTY_TABLE_PILL_CLASS_NAME,
              "gap-1 whitespace-nowrap tabular-nums transition-colors",
              rankTone(ranking),
            )}
          >
            {ranking != null
              ? `${ranking}/${comparison.totalCount ?? "?"}위`
              : "분석 대기"}
            {expanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
        );
      },
    },
    {
      id: "floorExposure",
      size: 104,
      header: () => (
        <TableHeaderLabel icon={<Eye className="size-4" />} label="층수노출" />
      ),
      cell: ({ row }) => <FloorExposureCell advertisement={row.original} />,
    },
    {
      id: "checkedAt",
      size: 84,
      header: () => (
        <TableHeaderLabel
          icon={<ClipboardCheck className="size-4" />}
          label="확인일"
        />
      ),
      cell: ({ row }) => (
        <CellText className="text-[11.5px] tabular-nums">
          {formatYmd(
            row.original.officeAdvertisementGroup?.mainAdvertisement
              ?.articleConfirmYmd,
          ) ?? formatDate(row.original.lastCheckedAt)}
        </CellText>
      ),
    },
    {
      id: "analysis",
      size: 152,
      minSize: 152,
      enableResizing: false,
      meta: { fill: true },
      header: () => (
        <TableHeaderLabel
          icon={<Sparkles className="size-4" />}
          label="경쟁 대비"
        />
      ),
      // 판단("가격을 내려라")이 아니라 관측된 사실만 보여준다 — 가격 결정은
      // 소유자 사정에 달려 있어 사람이 한다.
      cell: ({ row }) => <ComparisonSignalCell advertisement={row.original} />,
    },
  ];
}

function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span
      data-my-ads-header-label
      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground"
    >
      <span className="shrink-0 [&>svg]:size-3 [&>svg]:text-muted-foreground/70">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function CellText({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "block truncate whitespace-nowrap text-[13px] text-slate-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

function PropertyTableTransactionBadge({
  transactionType,
}: {
  transactionType: string;
}) {
  const meta = PROPERTY_TABLE_TRANSACTION_META[transactionType];
  return (
    <span
      className={cn(
        PROPERTY_TABLE_PILL_CLASS_NAME,
        meta?.className ?? PROPERTY_TABLE_PILL_TONES.neutral,
      )}
    >
      {meta?.label ?? transactionType}
    </span>
  );
}

function CpAdvertisementCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const provider = cpChannelLabel(advertisement.channel);

  return (
    <span
      title={
        advertisement.externalAdId
          ? `${provider} · ${advertisement.externalAdId}`
          : provider
      }
      className="inline-flex max-w-full items-center whitespace-nowrap"
    >
      <span
        className={cn(
          PROPERTY_TABLE_PILL_CLASS_NAME,
          "max-w-[82px]",
          PROPERTY_TABLE_PILL_TONES.neutralStrong,
        )}
      >
        <span className="truncate">{provider}</span>
      </span>
    </span>
  );
}

function NaverAdvertisementCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  if (!advertisement.naverArticleNo || !advertisement.naverUrl) {
    return <span className="text-[11.5px] text-muted-foreground">—</span>;
  }

  const isActive =
    advertisement.officeAdvertisementGroup?.mainAdvertisement?.isActive ?? true;

  return (
    <a
      href={advertisement.naverUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`네이버 광고 ${advertisement.naverArticleNo} 새 창에서 열기`}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        PROPERTY_TABLE_PILL_CLASS_NAME,
        "h-6 gap-1 whitespace-nowrap border text-slate-700 transition-colors hover:border-info/40 hover:bg-info-soft hover:text-info",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isActive ? "bg-success" : "bg-muted-foreground/50",
        )}
      />
      네이버
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function VerificationMethodCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const code =
    advertisement.officeAdvertisementGroup?.mainAdvertisement
      ?.verificationTypeCode;
  if (!code) {
    return <span className="text-[11.5px] text-muted-foreground">—</span>;
  }

  const presentation = verificationMethodPresentation(code);
  return (
    <span
      title={`${presentation.label} · 네이버 검증 코드 ${code}`}
      className={cn(PROPERTY_TABLE_PILL_CLASS_NAME, presentation.className)}
    >
      <span className="truncate">{presentation.label}</span>
    </span>
  );
}

function AdvertisementExposurePeriodCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  if (!advertisement.startedAt && !advertisement.endedAt) {
    return <span className="text-[11.5px] text-muted-foreground">—</span>;
  }

  const start = compactAdvertisementDate(advertisement.startedAt);
  const end = compactAdvertisementDate(advertisement.endedAt);
  return (
    <span
      title={`${formatDate(advertisement.startedAt)} ~ ${
        advertisement.endedAt ? formatDate(advertisement.endedAt) : "진행 중"
      } · CP 광고 원장 기준`}
      className="flex flex-col text-[10.5px] leading-[14px] tabular-nums"
    >
      <time className="text-slate-700">{start}</time>
      <span className="text-muted-foreground">
        ~ {advertisement.endedAt ? end : "진행 중"}
      </span>
    </span>
  );
}

function FloorExposureCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const main =
    advertisement.officeAdvertisementGroup?.mainAdvertisement ?? null;
  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  const exposureMode = main ? comparison.ownFloorExposureMode : "unknown";
  const exposed = exposureMode === "exact";
  const exposureLabel =
    exposureMode === "exact"
      ? "노출"
      : exposureMode === "band"
        ? "미노출"
        : "미확인";
  const disadvantage =
    exposureMode === "band" && comparison.exactFloorCompetitorCount > 0;
  const exposureDescription =
    exposureMode === "exact"
      ? "정확한 층 노출"
      : exposureMode === "band"
        ? "저·중·고 구간만 노출"
        : "층 노출 방식 미확인";

  return (
    <span
      title={`${exposureDescription}${
        disadvantage
          ? ` · 정확한 층을 공개한 경쟁 광고 ${comparison.exactFloorCompetitorCount}건`
          : ""
      }`}
      className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap"
    >
      <Switch
        size="sm"
        checked={exposed}
        disabled
        aria-label={`${getCanonicalLocation(advertisement).site} 층수 노출 ${exposureLabel}`}
        className="disabled:cursor-default disabled:opacity-100"
      />
      <span
        className={cn(
          "text-[10.5px] font-medium",
          exposed ? "text-info" : "text-muted-foreground",
        )}
      >
        {exposureLabel}
      </span>
      {disadvantage && (
        <span className="shrink-0 text-[10px] font-semibold text-destructive">
          불리
        </span>
      )}
    </span>
  );
}

function AdvertisementAnalysisPanel({
  advertisement,
  onEditAdvertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
  onEditAdvertisement: () => void;
}) {
  const group = advertisement.officeAdvertisementGroup;
  const main = group?.mainAdvertisement;
  const comparedAdvertisements = (group?.advertisements ?? []).filter(
    (comparedAdvertisement) => comparedAdvertisement.isActive,
  );
  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  const signal = getAnalysisSignal(advertisement);
  const location = getCanonicalLocation(advertisement);

  return (
    <div className="bg-[#fbfbfa] px-8 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              네이버 비교 분석
            </h3>
            <span className="text-xs text-muted-foreground">
              {location.site} {location.dong} {location.ho}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            현재 시점의 순위·가격·층 노출을 함께 비교합니다. 과거 순위 변화는
            저장하지 않습니다.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-[11.5px]"
            onClick={onEditAdvertisement}
          >
            <Pencil className="size-3" />
            가격 수정안 작성
          </Button>
          {advertisement.url && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11.5px]"
              asChild
            >
              <a
                href={advertisement.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ServerCog className="size-3" />
                CP 관리
              </a>
            </Button>
          )}
          {advertisement.naverUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11.5px]"
              asChild
            >
              <a
                href={advertisement.naverUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3" />
                네이버 원문
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3 grid max-w-[980px] grid-cols-4 overflow-hidden rounded-lg border bg-white">
        <AnalysisMetric
          label="노출 순위"
          value={
            comparison.ownRanking != null
              ? `${comparison.ownRanking}/${comparison.totalCount ?? "?"}위`
              : "분석 대기"
          }
          detail={
            comparison.aheadCount > 0
              ? `앞선 광고 ${comparison.aheadCount}건`
              : "앞선 광고 없음"
          }
        />
        <AnalysisMetric
          label="네이버 층 노출"
          value={comparison.ownFloorInfo ?? "확인 불가"}
          detail={
            comparison.ownFloorExposureMode === "exact"
              ? "정확한 층 공개"
              : comparison.ownFloorExposureMode === "band"
                ? comparison.exactFloorCompetitorCount > 0
                  ? `정확히 공개한 경쟁 광고 ${comparison.exactFloorCompetitorCount}건`
                  : "저·중·고 구간만 공개"
                : "층 노출 방식 미확인"
          }
        />
        <AnalysisMetric
          label="내 광고가"
          value={advertisementPriceLabel(advertisement)}
          detail={
            comparison.lowerPricedAheadCount > 0
              ? `더 낮고 앞선 광고 ${comparison.lowerPricedAheadCount}건`
              : comparison.lowerPricedCompetitorCount > 0
                ? "더 낮은 광고는 현재 뒤에 있음"
                : "더 낮은 비교 광고 없음"
          }
        />
        <AnalysisMetric
          label="네이버 확인"
          value={
            formatYmd(main?.articleConfirmYmd) ??
            formatDate(advertisement.lastCheckedAt)
          }
          detail={
            advertisement.lastCheckedAt
              ? `분석 ${formatDateTime(advertisement.lastCheckedAt)}`
              : "분석 이력 없음"
          }
          last
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(640px,1fr)_310px]">
        <div className="min-w-0 overflow-x-auto rounded-lg border bg-white">
          <div className="grid min-w-[770px] grid-cols-[58px_minmax(150px,1fr)_130px_82px_88px_110px_120px] border-b bg-[#f7f7f5]">
            {[
              "순위",
              "중개사",
              "가격",
              "층 노출",
              "확인일",
              "광고 옵션",
              "내 광고 대비",
            ].map((label) => (
              <div
                key={label}
                className="flex h-8 items-center px-3 text-[11px] font-medium text-slate-500"
              >
                {label}
              </div>
            ))}
          </div>
          {comparedAdvertisements.length > 0 ? (
            comparedAdvertisements.map((comparedAdvertisement) => (
              <CompetitorRow
                key={comparedAdvertisement.id}
                advertisement={advertisement}
                comparedAdvertisement={comparedAdvertisement}
              />
            ))
          ) : (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
              네이버 비교 데이터가 아직 없습니다.
            </div>
          )}
        </div>

        <aside
          className={cn(
            "rounded-lg border p-3",
            signal.tone === "warning"
              ? "bg-warning-soft/60 text-warning"
              : "bg-muted/40",
          )}
        >
          <div className="flex items-center gap-1.5">
            {signal.tone === "warning" ? (
              <CircleAlert className="size-4 shrink-0" />
            ) : (
              <BarChart3 className="size-4 shrink-0" />
            )}
            <h4 className="text-xs font-semibold">{signal.label}</h4>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-5">{signal.detail}</p>
          <dl className="mt-3 grid grid-cols-[78px_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-current/10 pt-2 text-[11px]">
            <dt className="text-current/60">현재 순위</dt>
            <dd className="truncate font-medium tabular-nums">
              {comparison.ownRanking != null
                ? `${comparison.ownRanking}/${comparison.totalCount ?? "?"}위 · 앞선 광고 ${comparison.aheadCount}건`
                : "확인되지 않음"}
            </dd>
            <dt className="text-current/60">층 노출</dt>
            <dd className="truncate font-medium">
              {floorExposureLabel(
                comparison.ownFloorInfo,
                comparison.ownFloorExposureMode,
              )}
            </dd>
            <dt className="text-current/60">가격 경쟁</dt>
            <dd className="truncate font-medium">
              {comparison.lowerPricedAheadCount > 0
                ? `더 낮고 앞선 광고 ${comparison.lowerPricedAheadCount}건`
                : comparison.higherPricedAheadCount > 0
                  ? `더 비싸지만 앞선 광고 ${comparison.higherPricedAheadCount}건`
                  : "가격 조건으로 앞선 광고 없음"}
            </dd>
            <dt className="text-current/60">CP사</dt>
            <dd className="truncate font-medium">
              {cpChannelLabel(advertisement.channel)}
            </dd>
            <dt className="text-current/60">CP 광고번호</dt>
            <dd className="truncate font-mono">
              {advertisement.externalAdId ?? "—"}
            </dd>
            <dt className="text-current/60">네이버 번호</dt>
            <dd className="truncate font-mono">
              {advertisement.naverArticleNo ?? "—"}
            </dd>
          </dl>
          {group?.memo && (
            <p className="mt-2 border-t border-current/10 pt-2 text-[11px] text-current/70">
              메모: {group.memo}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function AnalysisMetric({
  label,
  value,
  detail,
  last = false,
}: {
  label: string;
  value: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className={cn("px-3 py-2.5", !last && "border-r")}>
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function CompetitorRow({
  advertisement,
  comparedAdvertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
  comparedAdvertisement: OfficeAdvertisement;
}) {
  const rowAnalysis = analyzeOfficeAdvertisementRow(
    advertisement,
    comparedAdvertisement,
  );
  const overallAnalysis = analyzeOfficeAdvertisementComparison(advertisement);
  const comparison = competitorRowPresentation(rowAnalysis);
  const floorExposureWarning =
    !comparedAdvertisement.isMine &&
    overallAnalysis.ownFloorExposureMode === "band" &&
    rowAnalysis.hasExactFloorExposure;
  const priceLabel =
    advertisement.listing?.transactionType === "monthly"
      ? formatRent(
          comparedAdvertisement.deposit,
          comparedAdvertisement.monthlyRent,
        )
      : advertisement.listing?.transactionType === "jeonse"
        ? formatMoney(comparedAdvertisement.deposit)
        : formatMoney(comparedAdvertisement.price);

  return (
    <div
      className={cn(
        "grid min-w-[770px] grid-cols-[58px_minmax(150px,1fr)_130px_82px_88px_110px_120px] items-center border-b last:border-b-0",
        comparedAdvertisement.isMine && "bg-warning-soft/25",
        rowAnalysis.isAhead &&
          !comparedAdvertisement.isMine &&
          "bg-destructive-soft/10",
      )}
    >
      <div className="flex h-9 items-center px-3 text-xs font-semibold tabular-nums text-slate-800">
        {comparedAdvertisement.ranking != null
          ? `${comparedAdvertisement.ranking}위`
          : "—"}
      </div>
      <div className="flex h-9 min-w-0 items-center gap-1.5 px-3 text-xs text-slate-700">
        <span className="truncate">
          {comparedAdvertisement.realtorName ??
            comparedAdvertisement.articleName ??
            "중개사 미상"}
        </span>
        {comparedAdvertisement.isMine && (
          <span className="shrink-0 text-[10px] font-semibold text-warning">
            내 광고
          </span>
        )}
        {rowAnalysis.isAhead && !comparedAdvertisement.isMine && (
          <span className="shrink-0 text-[10px] font-semibold text-destructive">
            앞섬
          </span>
        )}
      </div>
      <div className="flex h-9 items-center px-3 text-xs font-semibold tabular-nums text-slate-900">
        {priceLabel}
      </div>
      <div className="flex h-9 items-center px-3">
        <span
          className={cn(
            PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME,
            "tabular-nums",
            floorExposureWarning
              ? PROPERTY_TABLE_PILL_TONES.warning
              : comparedAdvertisement.floorExposureMode === "exact"
                ? PROPERTY_TABLE_PILL_TONES.info
                : PROPERTY_TABLE_PILL_TONES.neutral,
          )}
          title={floorExposureDescription(comparedAdvertisement)}
        >
          {comparedAdvertisement.floorInfo ?? "—"}
        </span>
      </div>
      <div className="flex h-9 items-center px-3 text-[11px] tabular-nums text-slate-600">
        {formatYmd(comparedAdvertisement.articleConfirmYmd) ?? "—"}
      </div>
      <div className="flex h-9 items-center gap-1 px-3">
        {comparedAdvertisement.seango && (
          <span
            className={cn(
              PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME,
              PROPERTY_TABLE_PILL_TONES.violet,
            )}
          >
            선광고
          </span>
        )}
        {comparedAdvertisement.epju && (
          <span
            className={cn(
              PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME,
              PROPERTY_TABLE_PILL_TONES.info,
            )}
          >
            e편주
          </span>
        )}
        {!comparedAdvertisement.seango && !comparedAdvertisement.epju && (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex h-9 items-center px-3">
        <span
          className={cn(
            PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME,
            "tabular-nums",
            comparison.className,
          )}
        >
          {comparison.label}
        </span>
      </div>
    </div>
  );
}

function getCanonicalLocation(advertisement: ListingAdvertisementWithListing) {
  const property = advertisement.listing?.property;
  const unit = property?.unit;
  return {
    site: property?.site?.name ?? "단지 미상",
    dong: unit?.dong?.name ?? null,
    floor: unit?.floor != null ? `${unit.floor}층` : null,
    ho: unit?.name ?? null,
    type: unit?.siteUnitType?.name ?? null,
  };
}

function advertisementPriceLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const transactionType = advertisement.listing?.transactionType;
  if (transactionType === "monthly") {
    return formatRent(
      advertisement.advertisedDeposit,
      advertisement.advertisedMonthlyRent,
    );
  }
  if (transactionType === "jeonse") {
    return formatMoney(advertisement.advertisedDeposit);
  }
  return formatMoney(advertisement.advertisedPrice);
}

function advertisementPrimaryAmountLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const transactionType = advertisement.listing?.transactionType;
  return formatMoney(
    transactionType === "monthly" || transactionType === "jeonse"
      ? advertisement.advertisedDeposit
      : advertisement.advertisedPrice,
  );
}

function advertisementMonthlyRentLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  if (advertisement.listing?.transactionType !== "monthly") return "—";
  return formatMoney(advertisement.advertisedMonthlyRent);
}

function observedAdvertisementPriceLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const context = advertisement.actionContext;
  if (!context) return "—";
  if (advertisement.listing?.transactionType === "monthly") {
    return formatRent(context.deposit, context.monthlyRent);
  }
  if (advertisement.listing?.transactionType === "jeonse") {
    return formatMoney(context.deposit);
  }
  return formatMoney(context.price);
}

/**
 * 가격/보증금 셀. 행을 선택하면 입력칸이 열리고, 원래 값과 달라지면 노란
 * 배경으로 표시한다 (이실장과 같은 조작감이되 셀마다 확인창을 띄우지는 않는다).
 */
function InlinePriceCell({
  advertisement,
  selected,
  edit,
  request,
  onChange,
  onReset,
}: {
  advertisement: ListingAdvertisementWithListing;
  selected: boolean;
  edit: InlinePriceEdit | undefined;
  request: AgentActionRequest | undefined;
  onChange: (patch: Partial<InlinePriceEdit>) => void;
  onReset: () => void;
}) {
  // 진행 중이거나 사람이 봐야 하는 수정안 상태는 가격 옆 아이콘으로 표시한다.
  // 이 상태는 곧 "광고 조건의 변경 상태"라 이 칸이 의미상 맞는 자리다.
  // 선택(인라인 편집) 중에도 유지한다 — 편집하려는 바로 그 순간에
  // "이미 진행 중/불일치" 경고가 사라지면 안 된다. (클릭 시 AI 요청함으로)
  const attention = request ? isActionAttentionState(request) : false;
  const showStatus = request && (attention || isActionInProgress(request));
  const statusIcon = showStatus ? (
    <a
      href={agentActionRequestHref(request.id)}
      onClick={(event) => event.stopPropagation()}
      title={`${getActionStatusMeta(request).label} · AI 요청함에서 확인`}
      aria-label={`수정안 ${getActionStatusMeta(request).label}`}
      className="shrink-0"
    >
      {attention ? (
        <CircleAlert className="size-3.5 text-destructive" />
      ) : (
        <ShieldCheck className="size-3.5 text-info" />
      )}
    </a>
  ) : null;

  const base = inlineEditBase(advertisement);
  const current = edit ?? base;
  const transactionType = advertisement.listing?.transactionType ?? "sale";
  const primaryKey =
    transactionType === "monthly" || transactionType === "jeonse"
      ? "advertisedDeposit"
      : "advertisedPrice";
  const draftChanged = edit ? isInlineEditDirty(advertisement, edit) : false;
  const primaryChanged = current[primaryKey] !== base[primaryKey];

  if (!selected) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "min-w-0 truncate whitespace-nowrap text-sm font-medium tabular-nums text-slate-950",
            primaryChanged &&
              "rounded-md bg-warning-soft/70 px-1.5 py-0.5 ring-1 ring-inset ring-warning/25",
          )}
        >
          {edit
            ? inlineMoneyEditLabel(current[primaryKey])
            : advertisementPrimaryAmountLabel(advertisement)}
        </span>
        {draftChanged && (
          <InlineDraftResetButton
            advertisement={advertisement}
            onReset={onReset}
          />
        )}
        {statusIcon}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {statusIcon}
      <InlineMoneyInput
        value={current[primaryKey]}
        changed={current[primaryKey] !== base[primaryKey]}
        ariaLabel={`${getCanonicalLocation(advertisement).site} ${
          transactionType === "sale" ? "가격" : "보증금"
        }`}
        onChange={(value) => onChange({ [primaryKey]: value })}
      />
      {draftChanged && (
        <InlineDraftResetButton
          advertisement={advertisement}
          onReset={onReset}
        />
      )}
    </div>
  );
}

function InlineMonthlyRentCell({
  advertisement,
  selected,
  edit,
  onChange,
}: {
  advertisement: ListingAdvertisementWithListing;
  selected: boolean;
  edit: InlinePriceEdit | undefined;
  onChange: (patch: Partial<InlinePriceEdit>) => void;
}) {
  if (advertisement.listing?.transactionType !== "monthly") {
    return <span className="text-[11.5px] text-muted-foreground">—</span>;
  }

  const current = edit ?? inlineEditBase(advertisement);
  const base = inlineEditBase(advertisement);
  const changed = current.advertisedMonthlyRent !== base.advertisedMonthlyRent;

  if (!selected) {
    return (
      <span
        className={cn(
          "inline-flex whitespace-nowrap text-sm font-medium tabular-nums text-slate-950",
          changed &&
            "rounded-md bg-warning-soft/70 px-1.5 py-0.5 ring-1 ring-inset ring-warning/25",
        )}
      >
        {edit
          ? inlineMoneyEditLabel(current.advertisedMonthlyRent)
          : advertisementMonthlyRentLabel(advertisement)}
      </span>
    );
  }

  return (
    <InlineMoneyInput
      value={current.advertisedMonthlyRent}
      changed={current.advertisedMonthlyRent !== base.advertisedMonthlyRent}
      ariaLabel={`${getCanonicalLocation(advertisement).site} 월세`}
      onChange={(value) => onChange({ advertisedMonthlyRent: value })}
    />
  );
}

function InlineDraftResetButton({
  advertisement,
  onReset,
}: {
  advertisement: ListingAdvertisementWithListing;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      title="이 행의 변경 초안 취소"
      aria-label={`${getCanonicalLocation(advertisement).site} 변경 초안 취소`}
      onClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
      className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-[4px] border border-warning/30 bg-[#fbf3db] px-1.5 text-[10px] font-medium leading-5 text-[#8f6b1f] hover:bg-warning-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
    >
      <RotateCcw className="size-2.5" />
      변경 초안
    </button>
  );
}

function InlineMoneyInput({
  value,
  changed,
  ariaLabel,
  onChange,
}: {
  value: string;
  changed: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={value}
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-7 w-full min-w-0 px-1.5 text-right text-[12px] tabular-nums",
        changed && "border-warning bg-warning-soft font-semibold",
      )}
    />
  );
}

function inlineMoneyEditLabel(value: string): string {
  const amount = parseManwon(value);
  if (amount === 0) return "0";
  return formatMoney(amount);
}

/** 인라인 편집의 시작값 — createActionDraft 와 같은 소스를 쓴다. */
function inlineEditBase(
  advertisement: ListingAdvertisementWithListing,
): InlinePriceEdit {
  const { advertisement: _ignored, ...rest } = createActionDraft(advertisement);
  return rest;
}

function isInlineEditDirty(
  advertisement: ListingAdvertisementWithListing,
  edit: InlinePriceEdit,
): boolean {
  const base = inlineEditBase(advertisement);
  return (
    base.advertisedPrice !== edit.advertisedPrice ||
    base.advertisedDeposit !== edit.advertisedDeposit ||
    base.advertisedMonthlyRent !== edit.advertisedMonthlyRent ||
    base.republishAfterSave !== edit.republishAfterSave
  );
}

function createActionDraft(
  advertisement: ListingAdvertisementWithListing,
): AdvertisementActionDraft {
  const context = advertisement.actionContext;
  return {
    advertisement,
    advertisedPrice: nullableMoneyInput(
      advertisement.advertisedPrice ??
        advertisement.listing?.price ??
        context?.price,
    ),
    advertisedDeposit: nullableMoneyInput(
      advertisement.advertisedDeposit ??
        advertisement.listing?.deposit ??
        context?.deposit,
    ),
    advertisedMonthlyRent: nullableMoneyInput(
      advertisement.advertisedMonthlyRent ??
        advertisement.listing?.monthlyRent ??
        context?.monthlyRent,
    ),
    republishAfterSave: true,
  };
}

function nullableMoneyInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseManwon(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isValidManwonInput(value: string): boolean {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

function validateActionDrafts(
  drafts: AdvertisementActionDraft[],
): string | null {
  if (drafts.length === 0) return "수정할 광고를 선택해 주세요.";
  for (const draft of drafts) {
    const location = getCanonicalLocation(draft.advertisement);
    const values = [
      draft.advertisedPrice,
      draft.advertisedDeposit,
      draft.advertisedMonthlyRent,
    ];
    if (!values.every(isValidManwonInput)) {
      return `${location.site} ${location.ho ?? ""}: 금액은 0 이상의 만원 단위 정수로 입력해 주세요.`;
    }

    const transactionType =
      draft.advertisement.listing?.transactionType ?? "sale";
    const price = parseManwon(draft.advertisedPrice);
    const deposit = parseManwon(draft.advertisedDeposit);
    const monthlyRent = parseManwon(draft.advertisedMonthlyRent);
    if (transactionType === "sale" && (!price || price <= 0)) {
      return `${location.site} ${location.ho ?? ""}: 매매가를 입력해 주세요.`;
    }
    if (transactionType === "jeonse" && (!deposit || deposit <= 0)) {
      return `${location.site} ${location.ho ?? ""}: 전세가를 입력해 주세요.`;
    }
    if (
      transactionType === "monthly" &&
      (deposit == null || !monthlyRent || monthlyRent <= 0)
    ) {
      return `${location.site} ${location.ho ?? ""}: 보증금과 월세를 입력해 주세요.`;
    }

    const context = draft.advertisement.actionContext;
    const termsChanged =
      price !== (context?.price ?? null) ||
      deposit !== (context?.deposit ?? null) ||
      monthlyRent !== (context?.monthlyRent ?? null);
    if (!termsChanged && !draft.republishAfterSave) {
      return `${location.site} ${location.ho ?? ""}: 변경된 조건이 없거나 재광고를 선택하지 않았습니다.`;
    }
  }
  return null;
}

function getActionBlockReason(
  advertisement: ListingAdvertisementWithListing,
  latestRequest: AgentActionRequest | undefined,
): string | null {
  if (advertisement.channel !== "esiljang") {
    return `${cpChannelLabel(advertisement.channel)} 수정·재광고 Skill은 아직 연결 전입니다.`;
  }
  if (!advertisement.naverArticleNo) {
    return "네이버 광고번호를 먼저 전체 동기화로 가져와 주세요.";
  }
  const context = advertisement.actionContext;
  if (!context?.comparisonGroupId || !context.observedAt) {
    return "전체 네이버 비교를 실행해 최신 광고 근거를 만들어 주세요.";
  }
  if (context.isActive === false) {
    return "네이버에서 현재 게재 중인 내 광고가 확인되지 않습니다.";
  }
  const observedAt = new Date(context.observedAt).getTime();
  if (
    !Number.isFinite(observedAt) ||
    observedAt + ACTION_EVIDENCE_TTL_MS <= Date.now()
  ) {
    return "네이버 비교 근거가 2시간을 지났습니다. 전체 동기화를 다시 실행해 주세요.";
  }
  if (latestRequest && isActionInProgress(latestRequest)) {
    return "이미 검토 또는 실행 중인 수정안이 있습니다.";
  }
  return null;
}

/**
 * 사람이 봐야 하는 종결 상태 — 실행 실패, 저장값 불일치, 직원 확인 필요.
 * 진행 중이 아니어도 이 상태면 관리 칸에서 수정안 버튼 대신 경고 배지를 보인다
 * (PRD: 저장값 불일치 같은 예외는 사람이 처리한다).
 */
function isActionAttentionState(request: AgentActionRequest): boolean {
  return (
    request.executionStatus === "failed" ||
    request.executionStatus === "needs_input" ||
    ["mismatch", "not_found", "blocked"].includes(request.verificationStatus)
  );
}

function isActionInProgress(request: AgentActionRequest): boolean {
  if (request.reviewStatus === "pending") return true;
  return (
    request.reviewStatus === "approved" &&
    !["succeeded", "failed", "cancelled"].includes(request.executionStatus)
  );
}

function getActionStatusMeta(request: AgentActionRequest): {
  label: string;
  className: string;
} {
  if (request.executionStatus === "needs_input") {
    return {
      label: "직원 확인 필요",
      className: "bg-warning-soft text-warning",
    };
  }
  if (
    request.executionStatus === "failed" ||
    request.verificationStatus === "mismatch"
  ) {
    return {
      label: "적용 불일치",
      className: "bg-destructive-soft text-destructive",
    };
  }
  if (request.executionStatus === "succeeded") {
    return {
      label: "CP 적용 확인",
      className: "bg-success-soft text-success",
    };
  }
  if (request.reviewStatus === "pending") {
    return { label: "검토 대기", className: "bg-info-soft text-info" };
  }
  if (request.reviewStatus === "approved") {
    return {
      label:
        request.executionStatus === "running"
          ? "CP 실행 중"
          : "승인 · 실행 대기",
      className: "bg-success-soft text-success",
    };
  }
  const labels: Record<string, string> = {
    rejected: "반려",
    withdrawn: "철회",
    expired: "근거 만료",
    stale: "근거 변경",
    superseded: "새 요청으로 대체",
  };
  return {
    label: labels[request.reviewStatus] ?? request.reviewStatus,
    className: "bg-muted text-muted-foreground",
  };
}

type SyncWorkflowStep = NonNullable<
  MyAdvertisementsSyncStatus["run"]
>["steps"][number];

function getSyncWorkflowPresentation(
  status: MyAdvertisementsSyncStatus | undefined,
  fallback: {
    advertisementCount: number;
    analyzedCount: number;
    comparisonTargetCount: number;
    attentionCount: number;
    legacyCpDescription: string;
  },
): {
  cp: WorkflowStagePresentation;
  resolve: WorkflowStagePresentation;
  compare: WorkflowStagePresentation;
} {
  const steps = status?.run?.steps ?? [];
  const cpSteps = steps.filter((step) => step.kind === "cp_full_import");
  const resolveStep = steps.filter(
    (step) => step.stepKey === "resolve_exact_listing_and_unit",
  );
  const compareStep = steps.filter(
    (step) => step.stepKey === "naver_compare_all",
  );

  return {
    cp: summarizeSyncWorkflowStage(
      cpSteps,
      fallback.legacyCpDescription,
      cpSteps.length > 0
        ? cpSteps
            .map(
              (step) =>
                `${getCpChannelLabel(step.channel)} ${getSyncStepShortLabel(step.status)}`,
            )
            .join(" · ")
        : undefined,
    ),
    resolve: summarizeSyncWorkflowStage(
      resolveStep,
      `광고 원장 ${fallback.advertisementCount}건`,
    ),
    compare: summarizeSyncWorkflowStage(
      compareStep,
      `가져온 광고 전부 ${fallback.analyzedCount}/${fallback.comparisonTargetCount}건`,
    ),
  };
}

function summarizeSyncWorkflowStage(
  steps: SyncWorkflowStep[],
  fallbackDescription: string,
  explicitDescription?: string,
): WorkflowStagePresentation {
  if (steps.length === 0) {
    return {
      state: "idle",
      description: fallbackDescription,
      retryStepIds: [],
      startedAt: null,
      finishedAt: null,
      updatedAt: null,
    };
  }

  const statuses = steps.map((step) => step.status);
  const state: WorkflowVisualState = statuses.includes("failed")
    ? "failed"
    : statuses.includes("needs_input")
      ? "needs_input"
      : statuses.includes("running")
        ? "running"
        : statuses.includes("queued")
          ? "queued"
          : statuses.includes("ready")
            ? "ready"
            : statuses.every((value) =>
                  ["succeeded", "skipped"].includes(value),
                )
              ? "succeeded"
              : statuses.includes("blocked")
                ? "blocked"
                : statuses.includes("cancelled")
                  ? "cancelled"
                  : "idle";
  const retryStepIds = steps
    .filter((step) => ["failed", "needs_input"].includes(step.status))
    .map((step) => step.id);
  const progressTotal = steps.reduce(
    (total, step) => total + step.progressTotal,
    0,
  );
  const progressComplete = steps.reduce(
    (total, step) => total + step.progressComplete,
    0,
  );
  const problemStep = steps.find((step) =>
    ["failed", "needs_input"].includes(step.status),
  );
  const description =
    explicitDescription ??
    (state === "failed"
      ? problemStep?.error || "Skill 실행 오류 · 재시도 필요"
      : state === "needs_input"
        ? problemStep?.waitingReason || "사용자 확인이 필요합니다"
        : progressTotal > 0 && ["running", "succeeded"].includes(state)
          ? `${progressComplete}/${progressTotal}건 ${
              state === "running" ? "처리 중" : "처리 완료"
            }`
          : state === "running"
            ? "Skill 실행 중"
            : state === "queued"
              ? "Skill 실행 대기"
              : state === "ready"
                ? "실행 준비"
                : state === "blocked"
                  ? "앞 단계 완료 후 자동 시작"
                  : state === "cancelled"
                    ? "실행 취소"
                    : fallbackDescription);

  return {
    state,
    description,
    retryStepIds,
    startedAt: earliestWorkflowTimestamp(steps.map((step) => step.startedAt)),
    finishedAt: latestWorkflowTimestamp(steps.map((step) => step.finishedAt)),
    updatedAt: latestWorkflowTimestamp(steps.map((step) => step.updatedAt)),
  };
}

function getCpChannelLabel(channel: string | null): string {
  if (channel === "esiljang") return "이실장";
  if (channel === "budongsanbank") return "부동산뱅크";
  return "CP";
}

function getSyncStepShortLabel(status: SyncWorkflowStep["status"]): string {
  return getWorkflowVisualStateMeta(status).label;
}

function earliestWorkflowTimestamp(
  values: ReadonlyArray<string | null | undefined>,
): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length > 0
    ? new Date(Math.min(...timestamps)).toISOString()
    : null;
}

function latestWorkflowTimestamp(
  values: ReadonlyArray<string | null | undefined>,
): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length > 0
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
}

function formatWorkflowDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const totalSeconds = Math.max(0, Math.round((end - start) / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}시간 ${remainingMinutes}분`
    : `${hours}시간`;
}

function getWorkflowTimingPresentation({
  state,
  kind,
  startedAt,
  finishedAt,
  updatedAt,
}: {
  state: WorkflowVisualState;
  kind: "automation" | "approval" | "execution";
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
}): {
  timestamp: string | null;
  primary: string;
  secondary: string | null;
} {
  if (["idle", "blocked"].includes(state) && !startedAt) {
    return { timestamp: null, primary: "실행 전", secondary: null };
  }

  const terminal = ["succeeded", "failed", "skipped", "cancelled"].includes(
    state,
  );
  const timestamp = terminal
    ? (finishedAt ?? updatedAt ?? startedAt)
    : (startedAt ?? updatedAt);
  if (!timestamp) {
    return {
      timestamp: null,
      primary: state === "ready" ? "실행 준비" : "실행 전",
      secondary: null,
    };
  }

  const action =
    kind === "approval" && state === "needs_input"
      ? "요청"
      : kind === "approval" && state === "succeeded"
        ? "승인"
        : kind === "execution" && state === "succeeded"
          ? "적용"
          : state === "failed"
            ? "오류"
            : state === "running"
              ? "시작"
              : state === "queued" || state === "ready"
                ? "대기"
                : state === "needs_input"
                  ? "확인 필요"
                  : state === "cancelled"
                    ? "취소"
                    : "완료";
  const duration = formatWorkflowDuration(
    startedAt,
    terminal ? finishedAt : null,
  );
  const durationPrefix =
    state === "running"
      ? "경과"
      : state === "needs_input"
        ? "대기"
        : terminal
          ? "소요"
          : null;

  return {
    timestamp,
    primary: `${formatDateTime(timestamp)} ${action}`,
    secondary:
      duration && durationPrefix ? `${durationPrefix} ${duration}` : null,
  };
}

function getWorkflowOwnerMeta(
  owner: "agent" | "human",
  kind: "automation" | "approval" | "execution",
): {
  label: string;
  className: string;
} {
  return owner === "human"
    ? {
        label: kind === "approval" ? "직원 승인" : "직원 확인",
        className: "bg-warning-soft text-warning",
      }
    : {
        label: "Agent 실행",
        className: "bg-info-soft text-info",
      };
}

function getWorkflowStageStateLabel(
  state: WorkflowVisualState,
  kind: "automation" | "approval" | "execution",
): string {
  if (kind === "approval") {
    if (state === "ready") return "승인 준비";
    if (state === "needs_input") return "승인 대기";
    if (state === "running") return "검토 중";
    if (state === "succeeded") return "승인 완료";
  }
  if (kind === "execution") {
    if (["ready", "queued"].includes(state)) return "적용 대기";
    if (state === "running") return "적용 중";
    if (state === "needs_input") return "직원 확인";
    if (state === "succeeded") return "적용 완료";
    if (state === "failed") return "적용 오류";
  }
  return getWorkflowVisualStateMeta(state).label;
}

function getWorkflowVisualStateMeta(state: WorkflowVisualState): {
  label: string;
  badgeClassName: string;
  iconClassName: string;
} {
  const values: Record<
    WorkflowVisualState,
    {
      label: string;
      badgeClassName: string;
      iconClassName: string;
    }
  > = {
    idle: {
      label: "이력 없음",
      badgeClassName: "bg-muted text-muted-foreground",
      iconClassName: "border-border text-muted-foreground",
    },
    blocked: {
      label: "대기",
      badgeClassName: "bg-muted text-muted-foreground",
      iconClassName: "border-border text-muted-foreground",
    },
    ready: {
      label: "준비",
      badgeClassName: "bg-info-soft text-info",
      iconClassName: "border-info/30 bg-info-soft text-info",
    },
    queued: {
      label: "실행 대기",
      badgeClassName: "bg-info-soft text-info",
      iconClassName: "border-info/30 bg-info-soft text-info",
    },
    running: {
      label: "실행 중",
      badgeClassName: "bg-info-soft text-info",
      iconClassName: "border-info/30 bg-info-soft text-info",
    },
    succeeded: {
      label: "완료",
      badgeClassName: "bg-success-soft text-success",
      iconClassName: "border-success/30 bg-success-soft text-success",
    },
    failed: {
      label: "오류",
      badgeClassName: "bg-destructive-soft text-destructive",
      iconClassName:
        "border-destructive/30 bg-destructive-soft text-destructive",
    },
    needs_input: {
      label: "확인 필요",
      badgeClassName: "bg-warning-soft text-warning",
      iconClassName: "border-warning/30 bg-warning-soft text-warning",
    },
    skipped: {
      label: "건너뜀",
      badgeClassName: "bg-muted text-muted-foreground",
      iconClassName: "border-border text-muted-foreground",
    },
    cancelled: {
      label: "취소",
      badgeClassName: "bg-muted text-muted-foreground",
      iconClassName: "border-border text-muted-foreground",
    },
  };
  return values[state];
}

function getFullSyncStatusMeta(
  status: MyAdvertisementsSyncStatus | undefined,
): { label: string; shortLabel: string; className: string } {
  if (status?.run) {
    const runMeta: Record<
      NonNullable<MyAdvertisementsSyncStatus["run"]>["status"],
      { label: string; shortLabel: string; className: string }
    > = {
      queued: {
        label: "전체 동기화 실행 대기",
        shortLabel: "Skill 실행 대기",
        className: "text-info",
      },
      running: {
        label: "전체 수집·비교 중",
        shortLabel: "단계 자동 진행 중",
        className: "text-info",
      },
      awaiting_input: {
        label: "전체 동기화 확인 필요",
        shortLabel: "사용자 확인 대기",
        className: "text-warning",
      },
      completed: {
        label: "전체 동기화 완료",
        shortLabel: "모든 단계 완료",
        className: "text-success",
      },
      failed: {
        label: "전체 동기화 확인 필요",
        shortLabel: "실행 오류",
        className: "text-destructive",
      },
      cancelled: {
        label: "전체 동기화 취소",
        shortLabel: "실행 취소",
        className: "text-muted-foreground",
      },
    };
    return runMeta[status.run.status];
  }
  if (!status?.session) {
    return {
      label: "전체 동기화 준비",
      shortLabel: "실행 이력 없음",
      className: "text-muted-foreground",
    };
  }
  if (
    status.wakeup?.status === "queued" ||
    status.session.status === "pending"
  ) {
    return {
      label: "Skill 실행 대기",
      shortLabel: "전체 수집 요청됨",
      className: "text-info",
    };
  }
  if (
    status.wakeup?.status === "claimed" ||
    status.session.status === "active"
  ) {
    return {
      label: "전체 수집·비교 중",
      shortLabel: "Skill 실행 중",
      className: "text-info",
    };
  }
  if (status.wakeup?.status === "failed" || status.session.status === "error") {
    return {
      label: "전체 동기화 확인 필요",
      shortLabel: "실행 오류",
      className: "text-destructive",
    };
  }
  if (
    status.wakeup?.status === "completed" ||
    status.session.status === "complete"
  ) {
    return {
      label: "전체 동기화 완료",
      shortLabel: "최근 실행 완료",
      className: "text-success",
    };
  }
  return {
    label: "전체 동기화 상태 확인",
    shortLabel: status.session.status,
    className: "text-muted-foreground",
  };
}

function agentActionRequestHref(requestId: string, origin?: "my-ads"): string {
  const params = new URLSearchParams({ requestId });
  if (origin) params.set("origin", origin);
  const path = `/ai-requests/?${params.toString()}`;
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return `#${path}`;
  }
  return path;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "요청을 처리하지 못했습니다.";
}

function cpChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    esiljang: "이실장",
    budongsanbank: "부동산뱅크",
  };
  return labels[channel] ?? channel;
}

function rankTone(ranking: number | null | undefined): string {
  if (ranking == null) return PROPERTY_TABLE_PILL_TONES.neutral;
  if (ranking <= 3) return PROPERTY_TABLE_PILL_TONES.success;
  if (ranking <= 10) return PROPERTY_TABLE_PILL_TONES.info;
  return PROPERTY_TABLE_PILL_TONES.warning;
}

function formatYmd(value: string | null | undefined): string | null {
  if (!value || value.length !== 8) return null;
  return `${value.slice(2, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function compactAdvertisementDate(value: string | null | undefined): string {
  const formatted = formatDate(value);
  return formatted === "—" ? formatted : formatted.slice(2);
}

function verificationMethodPresentation(code: string): {
  label: string;
  className: string;
} {
  const normalized = code.trim().toUpperCase();
  if (normalized.startsWith("OWNER")) {
    return {
      label: "소유자 확인",
      className: PROPERTY_TABLE_PILL_TONES.success,
    };
  }
  if (normalized.startsWith("NDOC") || normalized.includes("DOCUMENT")) {
    return {
      label: "홍보확인서",
      className: PROPERTY_TABLE_PILL_TONES.violet,
    };
  }
  if (normalized.includes("PHONE")) {
    return {
      label: "전화 확인",
      className: PROPERTY_TABLE_PILL_TONES.info,
    };
  }
  if (normalized.includes("AGENT")) {
    return {
      label: "중개사 확인",
      className: PROPERTY_TABLE_PILL_TONES.neutral,
    };
  }
  return {
    label: code,
    className: PROPERTY_TABLE_PILL_TONES.neutral,
  };
}

function latestAdvertisementSync(
  advertisements: ListingAdvertisementWithListing[],
): string | null {
  const timestamps = advertisements
    .map((advertisement) => advertisement.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function primaryAmount(
  advertisement: ListingAdvertisementWithListing,
  amounts: { price: number | null; deposit: number | null },
): number | null {
  if (
    advertisement.listing?.transactionType === "monthly" ||
    advertisement.listing?.transactionType === "jeonse"
  ) {
    return amounts.deposit;
  }
  return amounts.price;
}

type AnalysisSignal = {
  kind:
    | "naver_link_pending"
    | "comparison_pending"
    | "own_ad_inactive"
    | "floor_exposure"
    | "price"
    | "rank"
    | "complete";
  tone: "normal" | "warning";
  label: string;
  detail: string;
  className: string;
};

function ComparisonSignalCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const signal = getAnalysisSignal(advertisement);
  return (
    <span
      title={signal.detail}
      className={cn(PROPERTY_TABLE_PILL_CLASS_NAME, "gap-1", signal.className)}
    >
      {signal.tone === "warning" ? (
        <CircleAlert className="size-3 shrink-0" />
      ) : (
        <CircleCheck className="size-3 shrink-0" />
      )}
      <span className="truncate">{signal.label}</span>
    </span>
  );
}

function getAnalysisSignal(
  advertisement: ListingAdvertisementWithListing,
): AnalysisSignal {
  if (!advertisement.naverArticleNo || !advertisement.naverUrl) {
    return {
      kind: "naver_link_pending",
      tone: "warning",
      label: "네이버 링크 대기",
      detail: "CP 동기화에서 네이버 광고 링크를 아직 가져오지 못했습니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  if (comparison.primarySignal === "comparison_pending") {
    return {
      kind: "comparison_pending",
      tone: "warning",
      label: "네이버 비교 대기",
      detail: "네이버 광고 링크를 읽어 현재 중복과 순위를 확인해야 합니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "own_ad_inactive") {
    return {
      kind: "own_ad_inactive",
      tone: "warning",
      label: "내 광고 미노출",
      detail:
        "CP 광고는 활성 상태지만 네이버 비교에서 내 광고가 현재 게재 중인 것으로 확인되지 않았습니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "floor_exposure_disadvantage") {
    const aheadDetail =
      comparison.exactFloorAheadCount > 0
        ? ` 그중 ${comparison.exactFloorAheadCount}건이 내 광고보다 앞서 있습니다.`
        : "";
    return {
      kind: "floor_exposure",
      tone: "warning",
      label: "층 노출 불리",
      detail: `내 광고는 ${floorExposureLabel(
        comparison.ownFloorInfo,
        comparison.ownFloorExposureMode,
      )}이고, 정확한 층을 공개한 경쟁 광고가 ${comparison.exactFloorCompetitorCount}건 있습니다.${aheadDetail}`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "lower_price_competitor") {
    const gapDetail =
      comparison.priceGapAgainstLowest != null
        ? ` 최저 광고는 ${formatMoney(comparison.priceGapAgainstLowest)} 낮습니다.`
        : " 월세는 보증금과 월세를 함께 비교했습니다.";
    const rankDetail =
      comparison.lowerPricedAheadCount > 0
        ? ` 그중 ${comparison.lowerPricedAheadCount}건이 내 광고보다 앞서 있습니다.`
        : " 더 싼 광고는 현재 내 광고보다 뒤에 있습니다.";
    return {
      kind: "price",
      tone: "warning",
      label: "더 싼 광고 있음",
      detail: `내 광고보다 가격 조건이 낮은 광고가 ${comparison.lowerPricedCompetitorCount}건 있습니다.${gapDetail}${rankDetail}`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "rank_disadvantage") {
    return {
      kind: "rank",
      tone: "warning",
      label: `${comparison.ownRanking}/${comparison.totalCount ?? "?"}위`,
      detail: `앞선 광고가 ${comparison.aheadCount}건 있습니다. 더 낮은 가격이 직접 원인으로 확인되지 않아 층 노출과 광고 확인 조건을 함께 살펴보세요.`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.higherPricedAheadCount > 0) {
    return {
      kind: "complete",
      tone: "normal",
      label: "가격 외 요인",
      detail: `내 광고보다 비싼 광고 ${comparison.higherPricedAheadCount}건이 앞서 있습니다. 가격 인하보다 층 노출과 광고 확인 조건을 먼저 확인하세요.`,
      className: PROPERTY_TABLE_PILL_TONES.info,
    };
  }
  return {
    kind: "complete",
    tone: "normal",
    label: "특이사항 없음",
    detail: "현재 순위·가격·층 노출에서 바로 검토할 불리한 조건이 없습니다.",
    className: PROPERTY_TABLE_PILL_TONES.success,
  };
}

function competitorRowPresentation(
  analysis: ReturnType<typeof analyzeOfficeAdvertisementRow>,
): { label: string; className: string } {
  if (analysis.priceRelation === "mine") {
    return { label: "내 광고", className: PROPERTY_TABLE_PILL_TONES.info };
  }
  const prefix = analysis.isAhead ? "앞섬 · " : "";
  if (analysis.priceRelation === "lower") {
    return {
      label: `${prefix}더 낮음`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.danger
        : PROPERTY_TABLE_PILL_TONES.warning,
    };
  }
  if (analysis.priceRelation === "higher") {
    return {
      label: `${prefix}더 높음`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.info
        : PROPERTY_TABLE_PILL_TONES.success,
    };
  }
  if (analysis.priceRelation === "same") {
    return {
      label: `${prefix}동일`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.warning
        : PROPERTY_TABLE_PILL_TONES.neutral,
    };
  }
  if (analysis.priceRelation === "incomparable") {
    return {
      label: `${prefix}조건 다름`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.warning
        : PROPERTY_TABLE_PILL_TONES.neutral,
    };
  }
  return {
    label: "비교 불가",
    className: PROPERTY_TABLE_PILL_TONES.neutral,
  };
}

function floorExposureLabel(
  floorInfo: string | null,
  mode: OfficeAdvertisement["floorExposureMode"],
): string {
  if (mode === "exact") return `${floorInfo ?? "층 정보"} · 정확한 층 공개`;
  if (mode === "band") return `${floorInfo ?? "층 정보"} · 구간만 공개`;
  return floorInfo ? `${floorInfo} · 방식 미확인` : "확인되지 않음";
}

function floorExposureDescription(advertisement: OfficeAdvertisement): string {
  return floorExposureLabel(
    advertisement.floorInfo,
    advertisement.floorExposureMode,
  );
}

function myAdsTableFilterScopeKey(
  view: MyAdsView,
  search: string,
  filters: MyAdsFilterState,
): string {
  return JSON.stringify([view, search, filters]);
}

function advertisementMatchesFilters(
  advertisement: ListingAdvertisementWithListing,
  filters: MyAdsFilterState,
): boolean {
  const location = getCanonicalLocation(advertisement);
  const siteId = advertisement.listing?.property?.site?.id ?? null;

  if (filters.siteIds.length > 0 && !filters.siteIds.includes(siteId ?? "")) {
    return false;
  }
  if (
    filters.dongSearch.trim() &&
    !normalizeFilterToken(location.dong).includes(
      normalizeFilterToken(filters.dongSearch),
    )
  ) {
    return false;
  }
  if (
    filters.unitSearch.trim() &&
    !normalizeFilterToken(location.ho).includes(
      normalizeFilterToken(filters.unitSearch),
    )
  ) {
    return false;
  }
  if (
    filters.transactionType !== "all" &&
    advertisement.listing?.transactionType !== filters.transactionType
  ) {
    return false;
  }
  if (filters.channel !== "all" && advertisement.channel !== filters.channel) {
    return false;
  }

  const primaryAdvertisementAmount = primaryAmount(advertisement, {
    price: advertisement.advertisedPrice,
    deposit: advertisement.advertisedDeposit,
  });
  if (
    !advertisementAmountMatchesRange(
      primaryAdvertisementAmount,
      filters.primaryAmountMin,
      filters.primaryAmountMax,
    )
  ) {
    return false;
  }
  if (
    !advertisementAmountMatchesRange(
      advertisement.listing?.transactionType === "monthly"
        ? advertisement.advertisedMonthlyRent
        : null,
      filters.monthlyRentMin,
      filters.monthlyRentMax,
    )
  ) {
    return false;
  }

  const main =
    advertisement.officeAdvertisementGroup?.mainAdvertisement ?? null;
  if (
    filters.verification !== "all" &&
    verificationMethodFilterKey(main?.verificationTypeCode ?? null) !==
      filters.verification
  ) {
    return false;
  }

  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  if (filters.floorExposure !== "all") {
    const mode = comparison.ownFloorExposureMode;
    const matchesFloorExposure =
      (filters.floorExposure === "exact" && mode === "exact") ||
      (filters.floorExposure === "band" && mode === "band") ||
      (filters.floorExposure === "unknown" && mode === "unknown") ||
      (filters.floorExposure === "disadvantage" &&
        mode === "band" &&
        comparison.exactFloorCompetitorCount > 0);
    if (!matchesFloorExposure) return false;
  }

  if (
    filters.exposurePeriod !== "all" &&
    advertisementExposurePeriodBucket(advertisement) !== filters.exposurePeriod
  ) {
    return false;
  }

  if (filters.comparison !== "all") {
    const comparisonFilter = advertisementComparisonFilterKey(
      advertisement,
      comparison.primarySignal,
    );
    if (comparisonFilter !== filters.comparison) return false;
  }

  return true;
}

function advertisementAmountMatchesRange(
  amount: number | null,
  minValue: string,
  maxValue: string,
): boolean {
  const min = parseAmountFilterValue(minValue);
  const max = parseAmountFilterValue(maxValue);
  if (min == null && max == null) return true;
  if (amount == null) return false;
  if (min != null && amount < min) return false;
  if (max != null && amount > max) return false;
  return true;
}

function normalizeFilterToken(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("ko");
}

function verificationMethodFilterKey(
  code: string | null,
): Exclude<MyAdsVerificationFilter, "all"> {
  if (!code?.trim()) return "unknown";
  const normalized = code.trim().toUpperCase();
  if (normalized.startsWith("OWNER")) return "owner";
  if (normalized.startsWith("NDOC") || normalized.includes("DOCUMENT")) {
    return "document";
  }
  if (normalized.includes("PHONE")) return "phone";
  if (normalized.includes("AGENT")) return "agent";
  return "unknown";
}

function advertisementExposurePeriodBucket(
  advertisement: ListingAdvertisementWithListing,
): Exclude<MyAdsExposurePeriodFilter, "all"> {
  if (!advertisement.startedAt) return "unknown";
  const startedAt = new Date(advertisement.startedAt).getTime();
  const endedAt = advertisement.endedAt
    ? new Date(advertisement.endedAt).getTime()
    : Date.now();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return "unknown";
  }
  const elapsedDays = Math.max(
    0,
    Math.floor((endedAt - startedAt) / 86_400_000),
  );
  if (elapsedDays <= 7) return "within_7_days";
  if (elapsedDays <= 30) return "within_30_days";
  return "over_30_days";
}

function advertisementComparisonFilterKey(
  advertisement: ListingAdvertisementWithListing,
  primarySignal: ReturnType<
    typeof analyzeOfficeAdvertisementComparison
  >["primarySignal"],
): Exclude<MyAdsComparisonFilter, "all"> {
  if (!advertisement.naverArticleNo || !advertisement.naverUrl) {
    return "pending";
  }
  const signalMap: Record<
    ReturnType<typeof analyzeOfficeAdvertisementComparison>["primarySignal"],
    Exclude<MyAdsComparisonFilter, "all">
  > = {
    comparison_pending: "pending",
    own_ad_inactive: "own_inactive",
    floor_exposure_disadvantage: "floor_disadvantage",
    lower_price_competitor: "lower_price",
    rank_disadvantage: "rank_disadvantage",
    competitive: "clear",
  };
  return signalMap[primarySignal];
}

function advertisementMatchesView(
  advertisement: ListingAdvertisementWithListing,
  view: MyAdsView,
): boolean {
  if (view === "all") return true;

  const signal = getAnalysisSignal(advertisement);
  if (view === "comparison_pending") {
    return ["naver_link_pending", "comparison_pending"].includes(signal.kind);
  }
  return analyzeOfficeAdvertisementComparison(advertisement).hasReviewSignal;
}

function sortAdvertisements(
  advertisements: ListingAdvertisementWithListing[],
  sorting: SortingState,
): ListingAdvertisementWithListing[] {
  const sort = sorting[0];
  if (!sort) return advertisements;

  return [...advertisements].sort((left, right) => {
    const leftValue = advertisementSortValue(left, sort.id);
    const rightValue = advertisementSortValue(right, sort.id);
    const direction = sort.desc ? -1 : 1;

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    // [등급, 크기] 튜플 — 등급을 먼저 비교하고 같을 때만 크기를 본다.
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      const tierDiff = leftValue[0] - rightValue[0];
      if (tierDiff !== 0) return tierDiff * direction;
      return (leftValue[1] - rightValue[1]) * direction;
    }
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * direction;
    }
    return (
      String(leftValue).localeCompare(String(rightValue), "ko", {
        numeric: true,
      }) * direction
    );
  });
}

/** 정렬 키. [등급, 크기] 튜플은 등급 우선 비교를 뜻한다. */
type AdvertisementSortValue = string | number | [number, number] | null;

function advertisementSortValue(
  advertisement: ListingAdvertisementWithListing,
  columnId: string,
): AdvertisementSortValue {
  const location = getCanonicalLocation(advertisement);
  switch (columnId) {
    case "site":
      return location.site;
    case "dong":
      return location.dong;
    case "floor":
      return Number.parseInt(location.floor ?? "", 10) || null;
    case "ho":
      return location.ho;
    case "type":
      return location.type;
    case "transaction":
      return advertisement.listing?.transactionType ?? null;
    case "price":
      return primaryAmount(advertisement, {
        price: advertisement.advertisedPrice,
        deposit: advertisement.advertisedDeposit,
      });
    case "monthlyRent":
      return advertisement.listing?.transactionType === "monthly"
        ? advertisement.advertisedMonthlyRent
        : null;
    case "channel":
      return cpChannelLabel(advertisement.channel);
    case "naver":
      return advertisement.naverArticleNo;
    case "verification": {
      const code =
        advertisement.officeAdvertisementGroup?.mainAdvertisement
          ?.verificationTypeCode;
      return code ? verificationMethodPresentation(code).label : null;
    }
    case "exposurePeriod":
      return advertisement.startedAt ?? advertisement.endedAt;
    case "ranking":
      return (
        advertisement.officeAdvertisementGroup?.mainAdvertisement?.ranking ??
        null
      );
    case "floorExposure": {
      const main =
        advertisement.officeAdvertisementGroup?.mainAdvertisement ?? null;
      if (!main) return null;
      const comparison = analyzeOfficeAdvertisementComparison(advertisement);
      const disadvantage =
        comparison.ownFloorExposureMode === "band" &&
        comparison.exactFloorCompetitorCount > 0;
      const tier = disadvantage
        ? 3
        : comparison.ownFloorExposureMode === "exact"
          ? 2
          : comparison.ownFloorExposureMode === "band"
            ? 1
            : 0;
      return [tier, comparison.exactFloorCompetitorCount];
    }
    case "checkedAt":
      return (
        advertisement.officeAdvertisementGroup?.mainAdvertisement
          ?.articleConfirmYmd ??
        advertisement.lastCheckedAt ??
        null
      );
    case "analysis": {
      // 서로 단위가 다른 경고를 합산하지 않고, 판단 우선순위와 각 경고
      // 내부의 크기를 튜플로 분리한다.
      //   4: CP 광고는 활성이나 네이버에서 내 광고 미노출
      //   3: 층 노출 불리
      //   2: 더 낮은 가격 조건의 광고가 존재
      //   1: 상대적 순위가 하위권
      //   0: 즉시 검토할 불리한 조건 없음
      const comparison = analyzeOfficeAdvertisementComparison(advertisement);
      if (comparison.primarySignal === "own_ad_inactive") {
        return [4, 0];
      }
      if (comparison.primarySignal === "floor_exposure_disadvantage") {
        return [3, comparison.exactFloorCompetitorCount];
      }
      if (comparison.primarySignal === "lower_price_competitor") {
        return [
          2,
          comparison.priceGapAgainstLowest ??
            comparison.lowerPricedCompetitorCount,
        ];
      }
      if (comparison.primarySignal === "rank_disadvantage") {
        return [
          1,
          Math.round((comparison.positionRatio ?? 0) * 10_000) +
            (comparison.ownRanking ?? 0),
        ];
      }
      if (comparison.primarySignal === "competitive") return [0, 0];
      return null;
    }
    default:
      return null;
  }
}
