export { createApiClient } from "./client.js";
export type { ApiClient, RequestFn } from "./client.js";
export { ApiError } from "./types.js";
export type {
  ApiClientConfig,
  AuthFailureContext,
  PaginatedResponse,
} from "./types.js";

// Module types
export type { MeResponse } from "./modules/auth.js";
export type {
  Property,
  PropertyListing,
  PropertiesFilter,
  CreatePropertyDto,
  UpdatePropertyDto,
} from "./modules/properties.js";
export type {
  ListingIntake,
  ListingIntakeListing,
  ListingIntakeConfirmResult,
  ListingIntakeConfirmChannel,
  ListingIntakesFilter,
  CreateListingForIntakeDto,
  CreateListingIntakeDto,
  UpdateListingIntakeDto,
  ConfirmListingIntakeDto,
} from "./modules/listing-intakes.js";
export type {
  Listing,
  ListingIntakeState,
  ListingIntakeSummary,
  ListingOccupyingDeal,
  ListingAdvertisement,
  ListingAdvertisementSource,
  ListingAdvertisementStatus,
  ListingPriceHistory,
  ListingFilterSite,
  ListingsFilter,
  CreateListingDto,
  UpdateListingDto,
} from "./modules/listings.js";
export type {
  ListingAdvertisementsFilter,
  ListingAdvertisementWithListing,
  ListingAdvertisementActionContext,
  ListingAdvertisementPriceHistory,
  CreateListingAdvertisementDto,
  UpdateListingAdvertisementDto,
} from "./modules/listing-advertisements.js";
export type {
  OfficeAdvertisement,
  OfficeAdvertisementGroup,
  OfficeAdvertisementGroupsFilter,
  OfficeAdvertisementBatchItemDto,
  OfficeAdvertisementBatchGroupDto,
  OfficeAdvertisementBatchUpsertDto,
  OfficeAdvertisementBatchUpsertResult,
} from "./modules/office-advertisements.js";
export {
  analyzeOfficeAdvertisementComparison,
  analyzeOfficeAdvertisementRow,
} from "./modules/office-advertisement-analysis.js";
export type {
  OfficeAdvertisementComparisonAnalysis,
  OfficeAdvertisementCompetitorAnalysis,
  OfficeAdvertisementPriceRelation,
  OfficeAdvertisementPrimarySignal,
} from "./modules/office-advertisement-analysis.js";
export type {
  Contact,
  ContactCounts,
  ContactDetail,
  ContactsFilter,
  ContactPhone,
  ContactPhoneInput,
  ContactLatestConsultation,
  CreateContactDto,
  UpdateContactDto,
} from "./modules/contacts.js";
export type {
  Site,
  SiteDetail,
  SiteWard,
  CreateSiteDto,
} from "./modules/sites.js";
export type { Dong } from "./modules/dongs.js";
export type {
  SiteUnitType,
  Unit,
  UnitContact,
  UnitConsultation,
  UnitListing,
  UnitProperty,
  UnitPropertyContact,
  UnitTenant,
  CreateUnitDto,
  UpdateUnitDto,
} from "./modules/units.js";
export type {
  Task,
  TaskAssignee,
  TaskBuyerRequirementSummary,
  TaskContact,
  TaskConsultationSummary,
  TaskContractSummary,
  TaskDealSummary,
  TaskListingIntakeSummary,
  TaskListingSummary,
  TaskMatchSummary,
  TaskPropertySummary,
  CreateTaskDto,
  UpdateTaskDto,
  TasksFilter,
} from "./modules/tasks.js";
export type {
  Match,
  MatchDealLink,
  CreateMatchDto,
  UpdateMatchMemoDto,
} from "./modules/matches.js";
export type { Deal, CreateDealDto } from "./modules/deals.js";
export type {
  Contract,
  ContractClauseTemplate,
  ContractClauseTemplateFilter,
  ContractDateField,
  ContractDocument,
  ContractDocumentRevision,
  ContractDocumentStatus,
  ContractDocumentTemplate,
  ContractDocumentTemplateFilter,
  ContractDocumentType,
  ContractParty,
  ContractPartyAgentInput,
  ContractPartyIdType,
  ContractPartyInput,
  ContractPartySide,
  ContractPriceField,
  ContractSearchField,
  ContractsFilter,
  ContractsPaginatedFilter,
  CreateContractClauseTemplateDto,
  CreateContractDocumentDto,
  CreateContractDto,
  CreateOfficePrintTemplateDto,
  ApplyContractDocumentRevisionResult,
  OfficePrintTemplate,
  OfficePrintTemplateFilter,
  ReplaceContractPartiesDto,
  UpdateContractClauseTemplateDto,
  UpdateContractDocumentDto,
  UpdateContractDto,
  UpdateOfficePrintTemplateDto,
  PrepareSaleContractDraftDto,
  PrepareSaleContractDraftResult,
} from "./modules/contracts.js";
export type {
  Consultation,
  ConsultationsFilter,
  CreateConsultationDto,
  UpdateConsultationDto,
} from "./modules/consultations.js";
export type {
  DistrictOption,
  ProvinceOption,
  RegionLevel,
  RegionSearchResult,
  WardOption,
} from "./modules/regions.js";
export type {
  BuyerIntake,
  BuyerIntakeContact,
  BuyerIntakeContactInput,
  BuyerIntakeContactRole,
  BuyerIntakeLifecycleStatus,
  BuyerIntakesFilter,
  CreateBuyerIntakeDto,
  UpdateBuyerIntakeContactDto,
  UpdateBuyerIntakeDto,
} from "./modules/buyer-intakes.js";
export type {
  BrokerageCase,
  BrokerageCaseParticipant,
  BrokerageCaseDemandIntent,
  BrokerageCaseListingIntent,
  BrokerageCaseDependency,
  BrokerageCaseLedgerMode,
  BrokerageCaseLedgerSortField,
  BrokerageCaseLedgerFilter,
  BrokerageCaseLedgerResponse,
  CreateBrokerageCaseDependencyDto,
} from "./modules/brokerage-cases.js";
export type {
  BuyerRequirement,
  BuyerRequirementStatus,
  BuyerRequirementPreferredSite,
  BuyerRequirementPreferredRegion,
  BuyerRequirementMatch,
  BuyerRequirementConsultation,
  BuyerRequirementsFilter,
  CreateBuyerRequirementDto,
  UpdateBuyerRequirementDto,
} from "./modules/buyer-requirements.js";
export type {
  CalendarEvent,
  CalendarEventsFilter,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from "./modules/calendar-events.js";
export type {
  PropertyContact,
  CreatePropertyContactDto,
  CreatePropertyContactWithNewContactDto,
  UpdatePropertyContactDto,
} from "./modules/property-contacts.js";
export type {
  ContactRelation,
  ContactRelationsByContact,
  CreateContactRelationDto,
  CreateContactRelationWithNewContactDto,
  UpdateContactRelationDto,
} from "./modules/contact-relations.js";
export type {
  Tenant,
  CreateTenantDto,
  UpdateTenantDto,
} from "./modules/tenants.js";
export type { OfficeSite } from "./modules/office-sites.js";
export type {
  Employee,
  EmployeeDetail,
  EmployeeDealParticipant,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeePerformance,
} from "./modules/employees.js";
export type {
  OfficeProfile,
  OfficeUserSummary,
  UpdateOfficeDto,
  CommissionConfigDto,
} from "./modules/offices.js";
export type {
  ExternalListing,
  ExternalListingGroup,
  ExternalListingGroupsFilter,
  ExternalListingGroupStatus,
  ExternalListingDiscoveryStatus,
  ExternalListingTransactionType,
  UpdateExternalListingGroupDto,
  BatchListingItem,
  BatchUpsertDto,
  BatchUpsertResult,
  SnapshotSession,
  SnapshotSessionUserRef,
  CompleteSessionResult,
} from "./modules/external-listings.js";
export type {
  PublicDocument,
  PublicDocumentType,
  PublicDocumentStatus,
  PublicDocumentRequestMode,
  PublicDocumentProvider,
  PublicDocumentQuoteItem,
  PublicDocumentQuote,
  BatchPublicDocumentDto,
  CreatePublicDocumentDto,
} from "./modules/public-documents.js";
export type {
  PropertyPhoto,
  PhotoCategory,
} from "./modules/property-photos.js";
export type {
  SttStatus,
  AnalysisStatus,
  CallDirection,
  CallRecordingMessage,
  CallRecordingAnalysis,
  CallRecordingListItem,
  CallRecordingDetail,
  CallRecordingsListResponse,
  CallRecordingsListStats,
  CallRecordingsListParams,
  UpdateCallRecordingDto,
} from "./modules/call-recordings.js";
export type {
  McpApiKeyStatus,
  McpApiKeyGenerateResponse,
} from "./modules/mcp.js";
export type {
  ServiceVendor,
  VendorContact,
  VendorAdTier,
  VendorBusinessType,
  ServiceVendorFilter,
  CreateServiceVendorDto,
  UpdateServiceVendorDto,
  CreateVendorContactDto,
  UpdateVendorContactDto,
} from "./modules/service-vendors.js";
export type {
  CommissionPayment,
  CommissionPaymentStatus,
  CommissionClientSide,
  CommissionCollectedBy,
  CommissionDistribution,
  CommissionAdjustment,
  DistributionInput,
  TaxInvoiceStatus,
  OfficeExpenseTemplate,
  PartnerBroker,
  CreatePartnerBrokerDto,
  UpdatePartnerBrokerDto,
  PipelineDeal,
  PipelineDealPayment,
  PipelineDealParticipant,
  PipelineBucket,
  MonthlyTrend,
  CashflowSummary,
  LedgerView,
  LedgerPreset,
  LedgerDealGroup,
  LedgerDeal,
  LedgerPayment,
  LedgerPaymentDistribution,
} from "./modules/finance.js";
export type {
  AppNotification,
  NotificationsListFilter,
  NotificationsListResponse,
  NotificationCreatedEvent,
} from "./modules/notifications.js";
export type {
  DashboardSummary,
  DashboardThisMonth,
  DashboardCounts,
} from "./modules/dashboard.js";
export type {
  ActivityLog,
  ActivityLogAction,
  ActivityLogChange,
  ActivityLogsFilter,
} from "./modules/activity-logs.js";
export type {
  NetworkRoom,
  NetworkRoomDetail,
  NetworkRoomMember,
  NetworkRoomType,
  NetworkMemberRole,
  NetworkMemberStatus,
  NetworkRoomsFilter,
  CreateNetworkRoomDto,
  SharedPropertyListingView,
  NetworkSharedPropertyView,
  ShareListingDto,
  UpdateSharedPropertyDto,
  NetworkInquiry,
  NetworkInquiryStatus,
  NetworkInquiriesFilter,
  RespondNetworkInquiryDto,
  NetworkMessage,
  NetworkMessagesFilter,
  NetworkMessagesResponse,
  SendNetworkMessageDto,
  NetworkMessageCreatedEvent,
} from "./modules/network.js";
export type {
  CtiCallEventInput,
  CallLog,
  CallLogStatus,
  CallLogsFilter,
  CallLogsResponse,
  CtiLookupResult,
  CtiLookupVendorContact,
  CtiLookupProperty,
  IngestCallEventResult,
  UpdateCallLogDto,
} from "./modules/cti.js";
