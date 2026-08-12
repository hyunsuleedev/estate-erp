/**
 * MySpider DocuMngt `mnuCntr` / `mnuForm` 대응 카탈로그.
 *
 * 화면 메뉴뿐 아니라 레거시 분류코드·입력 폼·출력 리포트·저장 테이블까지
 * 한 항목에 묶는다. 문서 metadata.formRegistration 에 이 값을 스냅샷으로
 * 저장하므로 이후 레거시 데이터 이관과 출력 엔진 선택도 같은 매핑을 쓴다.
 */

export type FormPropertyClass =
  | 'apartment'
  | 'officetel'
  | 'real_estate'
  | 'commercial'
  | 'purchase_right'
  | 'right'
  | 'commercial_lease'
  | 'commercial_premium'
  | 'private_rental'
  | 'house_lease'
  | 'union_right'
  | 'form';

export type FormRegistrationSpec = {
  title: string;
  /** ContractDocument.kind / ContractDocumentTemplate.code */
  templateCode: string;
  /** Contract.transactionType */
  transactionType: string;
  /** 레거시 Cntr_Clsf 또는 확인설명서 코드 21 */
  cntrClsf: string;
  propertyClass: FormPropertyClass;
  groupLabel: string;
  tradeLabel: string;
  isAnnex?: boolean;
  menuSection?: 'confirmation' | 'add-form';
  /** 같은 계약에 같은 종류를 여러 장 만들 수 있음 (레거시 Cntr_Clsf_Orde) */
  repeatable?: boolean;
  mySpiderForm?: string;
  mySpiderWebForm?: string;
  mySpiderReport?: string;
  legacyTableName?: string;
  /** 범용 부동산 계약서의 목적물 종별 선택값 */
  subjectDefault?: string;
};

/** MySpider 범용 부동산 계약서의 목적물 종별 22개. */
export const REAL_ESTATE_SUBJECT_OPTIONS = [
  '직접입력',
  '부동산',
  '건물',
  '고급주택',
  '공장',
  '농가주택',
  '다가구',
  '다세대',
  '단독주택',
  '독채',
  '빌딩',
  '빌라',
  '사무실',
  '상가주택',
  '아파트형공장',
  '연립',
  '원룸',
  '임야',
  '전원주택',
  '창고',
  '토지',
  '투룸',
] as const;

const TRADE = {
  sale: { code: 'sale', label: '매매', legacyCode: '01' },
  jeonse: { code: 'jeonse', label: '전세', legacyCode: '02' },
  monthly: { code: 'monthly', label: '월세', legacyCode: '03' },
  yearly: { code: 'yearly', label: '연세', legacyCode: '08' },
  exchange: { code: 'exchange', label: '교환', legacyCode: '04' },
  sublease: { code: 'sublease', label: '전대', legacyCode: '05' },
  transfer: { code: 'transfer', label: '양도', legacyCode: '06' },
  succession: { code: 'succession', label: '승계', legacyCode: '07' },
} as const;

function baseContract(
  propertyClass: FormPropertyClass,
  groupLabel: string,
  cntrClsf: string,
  trades: Array<keyof typeof TRADE>,
): FormRegistrationSpec[] {
  return trades.map((key) => {
    const trade = TRADE[key];
    const templateCode =
      key === 'exchange'
        ? 'exchange_contract'
        : key === 'sublease'
          ? 'sublease_contract'
          : 'base_contract';

    return {
      title: `${groupLabel} ${trade.label} 계약서`,
      templateCode,
      transactionType: trade.code,
      cntrClsf,
      propertyClass,
      groupLabel,
      tradeLabel: trade.label,
      mySpiderForm:
        key === 'exchange'
          ? 'ChangeContractInputForm'
          : key === 'sublease'
            ? 'SubleaseContractInputForm'
            : 'ContractInputForm',
      mySpiderWebForm:
        key === 'exchange'
          ? 'ChangeWebForm'
          : key === 'sublease'
            ? 'SubleaseWebForm'
            : 'ContractWebForm',
      mySpiderReport:
        key === 'exchange'
          ? 'RealStateExchangeContractReport'
          : key === 'sublease'
            ? 'RealStateSubleaseContractReport'
            : 'ApartmentTradeContractReport',
      legacyTableName: 'TPCT01M',
      subjectDefault: groupLabel,
    };
  });
}

function dedicatedContract(
  spec: Omit<FormRegistrationSpec, 'isAnnex' | 'menuSection'>,
): FormRegistrationSpec {
  return spec;
}

/**
 * 계약서 등록 메뉴. 실측 기준 11개 종별, 총 30개 조합.
 * 순서는 MySpider 타입 선택창 순서를 그대로 따른다.
 */
export const CONTRACT_FORM_MENU: Array<{
  groupLabel: string;
  propertyClass: FormPropertyClass;
  items: FormRegistrationSpec[];
}> = [
  {
    groupLabel: '아파트',
    propertyClass: 'apartment',
    items: baseContract('apartment', '아파트', '01', [
      'sale',
      'jeonse',
      'monthly',
      'yearly',
    ]),
  },
  {
    groupLabel: '오피스텔',
    propertyClass: 'officetel',
    items: baseContract('officetel', '오피스텔', '02', [
      'sale',
      'jeonse',
      'monthly',
      'yearly',
    ]),
  },
  {
    groupLabel: '부동산',
    propertyClass: 'real_estate',
    items: baseContract('real_estate', '부동산', '03', [
      'sale',
      'jeonse',
      'monthly',
      'yearly',
      'exchange',
      'sublease',
    ]),
  },
  {
    groupLabel: '분양권',
    propertyClass: 'purchase_right',
    items: [
      dedicatedContract({
        title: '분양권 매매 계약서',
        templateCode: 'purchase_right_contract',
        transactionType: 'sale',
        cntrClsf: '04',
        propertyClass: 'purchase_right',
        groupLabel: '분양권',
        tradeLabel: '매매',
        mySpiderForm: 'SalesRightContractInputForm',
        mySpiderWebForm: 'SaleRightWebForm',
        mySpiderReport: 'PurchaseRightTradeContractReport',
        legacyTableName: 'TPCT01M',
        subjectDefault: '분양권',
      }),
    ],
  },
  {
    groupLabel: '상가',
    propertyClass: 'commercial',
    items: baseContract('commercial', '상가', '05', [
      'sale',
      'jeonse',
      'monthly',
      'yearly',
    ]),
  },
  {
    groupLabel: '권리',
    propertyClass: 'right',
    items: [
      dedicatedContract({
        title: '권리 양도 계약서',
        templateCode: 'right_transfer_contract',
        transactionType: 'transfer',
        cntrClsf: '06',
        propertyClass: 'right',
        groupLabel: '권리',
        tradeLabel: '양도',
        mySpiderForm: 'TransferContractInputForm',
        mySpiderWebForm: 'TransferWebForm',
        mySpiderReport: 'RightTransferContractReport',
        legacyTableName: 'TPCT01M',
        subjectDefault: '권리',
      }),
      dedicatedContract({
        title: '권리 의무 승계 계약서',
        templateCode: 'right_succession_contract',
        transactionType: 'succession',
        cntrClsf: '06',
        propertyClass: 'right',
        groupLabel: '권리',
        tradeLabel: '승계',
        mySpiderForm: 'SuccessionContractInputForm',
        mySpiderWebForm: 'SuccessionWebForm',
        mySpiderReport: 'RightSuccessionContractReport',
        legacyTableName: 'TPCT01M',
        subjectDefault: '권리',
      }),
    ],
  },
  {
    groupLabel: '상가 권리금',
    propertyClass: 'commercial_premium',
    items: (['jeonse', 'monthly'] as const).map((key) => {
      const trade = TRADE[key];
      return dedicatedContract({
        title: `상가건물 임대차 권리금계약서 (${trade.label})`,
        templateCode: 'commercial_premium_contract',
        transactionType: trade.code,
        cntrClsf: '11',
        propertyClass: 'commercial_premium',
        groupLabel: '상가 권리금',
        tradeLabel: trade.label,
        mySpiderForm: 'BuildingLeasePremiumContractInputForm',
        mySpiderWebForm: 'BuildingPremiumWebForm',
        mySpiderReport: 'BuildingLeasePremiumContractReport',
        legacyTableName: 'TPCT20S',
        subjectDefault: '상가',
      });
    }),
  },
  {
    groupLabel: '상가 표준',
    propertyClass: 'commercial_lease',
    items: (['jeonse', 'monthly'] as const).map((key) => {
      const trade = TRADE[key];
      return dedicatedContract({
        title: `상가건물 임대차 표준계약서 (${trade.label})`,
        templateCode: 'commercial_standard_lease_contract',
        transactionType: trade.code,
        cntrClsf: '12',
        propertyClass: 'commercial_lease',
        groupLabel: '상가 표준',
        tradeLabel: trade.label,
        mySpiderForm: 'BuildingLeaseStandardContractInputForm',
        mySpiderWebForm: 'BuildingStandardWebForm',
        mySpiderReport: 'BuildingLeaseStandardContractReport',
        legacyTableName: 'TPCT19S',
        subjectDefault: '상가',
      });
    }),
  },
  {
    groupLabel: '민간임대 표준',
    propertyClass: 'private_rental',
    items: (['jeonse', 'monthly'] as const).map((key) => {
      const trade = TRADE[key];
      return dedicatedContract({
        title: `표준임대차계약서 (민간임대주택 · ${trade.label})`,
        templateCode: 'private_rental_standard_lease_contract',
        transactionType: trade.code,
        cntrClsf: '13',
        propertyClass: 'private_rental',
        groupLabel: '민간임대 표준',
        tradeLabel: trade.label,
        mySpiderForm: 'StandardLeaseContractInputForm',
        mySpiderWebForm: 'StandardLeaseWebForm',
        mySpiderReport: 'StandardLeaseContractReport',
        legacyTableName: 'TPCT18S',
        subjectDefault: '주택',
      });
    }),
  },
  {
    groupLabel: '주택 표준',
    propertyClass: 'house_lease',
    items: (['jeonse', 'monthly'] as const).map((key) => {
      const trade = TRADE[key];
      return dedicatedContract({
        title: `주택임대차계약서 (${trade.label})`,
        templateCode: 'house_lease_contract',
        transactionType: trade.code,
        cntrClsf: '14',
        propertyClass: 'house_lease',
        groupLabel: '주택 표준',
        tradeLabel: trade.label,
        mySpiderForm: 'HouseLeaseContractInputForm',
        mySpiderWebForm: 'HouseStandardWebForm',
        mySpiderReport: 'HouseLeaseContractReport',
        legacyTableName: 'TPCT12S',
        subjectDefault: '주택',
      });
    }),
  },
  {
    groupLabel: '조합원 입주권',
    propertyClass: 'union_right',
    items: [
      dedicatedContract({
        title: '조합원 입주권 매매 계약서',
        templateCode: 'union_member_right_contract',
        transactionType: 'sale',
        cntrClsf: '15',
        propertyClass: 'union_right',
        groupLabel: '조합원 입주권',
        tradeLabel: '매매',
        mySpiderForm: 'HProjectMembersContractFrom',
        mySpiderWebForm: 'UnionWebForm',
        mySpiderReport: 'HProjectMembersContractReport',
        legacyTableName: 'TPCT32S',
        subjectDefault: '조합원입주권',
      }),
    ],
  },
];

function annex(
  title: string,
  templateCode: string,
  cntrClsf: string,
  groupLabel: string,
  tradeLabel: string,
  transactionType: string,
  legacy: {
    form: string;
    web?: string;
    report: string;
    table?: string;
    repeatable?: boolean;
  },
  menuSection: 'confirmation' | 'add-form' = 'add-form',
): FormRegistrationSpec {
  return {
    title,
    templateCode,
    transactionType,
    cntrClsf,
    propertyClass: 'form',
    groupLabel,
    tradeLabel,
    isAnnex: true,
    menuSection,
    repeatable: legacy.repeatable,
    mySpiderForm: legacy.form,
    mySpiderWebForm: legacy.web,
    mySpiderReport: legacy.report,
    legacyTableName: legacy.table,
  };
}

/** 확인·설명서 타입 선택창 4종. */
export const CONFIRMATION_FORM_MENU: FormRegistrationSpec[] = [
  annex(
    '중개대상물 확인·설명서 [Ⅰ] 주거용 건축물',
    'broker_explanation_residential',
    '21',
    '확인·설명서',
    '주거용',
    'sale',
    {
      form: 'ConfirmExplanationInputForm1',
      web: 'ConfirmExplanationWeb1',
      report: 'ConfExp1Report',
    },
    'confirmation',
  ),
  annex(
    '중개대상물 확인·설명서 [Ⅱ] 비주거용 건축물',
    'broker_explanation_non_residential',
    '21',
    '확인·설명서',
    '비주거용',
    'sale',
    {
      form: 'ConfirmExplanationInputForm2',
      web: 'ConfirmExplanationWeb2',
      report: 'MediationTargetConfrimExplanation2Report',
    },
    'confirmation',
  ),
  annex(
    '중개대상물 확인·설명서 [Ⅲ] 토지',
    'broker_explanation_land',
    '21',
    '확인·설명서',
    '토지',
    'sale',
    {
      form: 'ConfirmExplanationInputForm3',
      web: 'ConfirmExplanationWeb3',
      report: 'MediationTargetConfrimExplanation3Report',
    },
    'confirmation',
  ),
  annex(
    '중개대상물 확인·설명서 [Ⅳ] 입목·광업재단·공장재단',
    'broker_explanation_special',
    '21',
    '확인·설명서',
    '특수물건',
    'sale',
    {
      form: 'ConfirmExplanationInputForm4',
      web: 'ConfirmExplanationWeb4',
      report: 'MediationTargetConfrimExplanation4Report',
    },
    'confirmation',
  ),
];

/** MySpider `서식추가`의 현재 활성 항목 22개. */
export const ADD_FORM_MENU: FormRegistrationSpec[] = [
  annex(
    '상가건물 임대차 권리금계약서',
    'commercial_premium_contract',
    '11',
    '전용 계약서',
    '임대',
    'monthly',
    {
      form: 'BuildingLeasePremiumContractInputForm',
      web: 'BuildingPremiumWebForm',
      report: 'BuildingLeasePremiumContractReport',
      table: 'TPCT20S',
    },
  ),
  annex(
    '상가건물 임대차 표준계약서',
    'commercial_standard_lease_contract',
    '12',
    '전용 계약서',
    '임대',
    'monthly',
    {
      form: 'BuildingLeaseStandardContractInputForm',
      web: 'BuildingStandardWebForm',
      report: 'BuildingLeaseStandardContractReport',
      table: 'TPCT19S',
    },
  ),
  annex(
    '표준임대차계약서 (민간임대주택)',
    'private_rental_standard_lease_contract',
    '13',
    '전용 계약서',
    '임대',
    'monthly',
    {
      form: 'StandardLeaseContractInputForm',
      web: 'StandardLeaseWebForm',
      report: 'StandardLeaseContractReport',
      table: 'TPCT18S',
    },
  ),
  annex(
    '주택임대차계약서 (표준)',
    'house_lease_contract',
    '14',
    '전용 계약서',
    '임대',
    'monthly',
    {
      form: 'HouseLeaseContractInputForm',
      web: 'HouseStandardWebForm',
      report: 'HouseLeaseContractReport',
      table: 'TPCT12S',
    },
  ),
  annex(
    '조합원 입주권 매매 계약서',
    'union_member_right_contract',
    '15',
    '전용 계약서',
    '매매',
    'sale',
    {
      form: 'HProjectMembersContractFrom',
      web: 'UnionWebForm',
      report: 'HProjectMembersContractReport',
      table: 'TPCT32S',
    },
  ),
  annex(
    '부동산 거래위임장',
    'transaction_power_of_attorney',
    '31',
    '거래 신고·확인',
    '공통',
    'sale',
    {
      form: 'RealStateTradeProxyInputForm',
      web: 'DelegateWebForm',
      report: 'RealStateTradeProxyReport',
      table: 'TPCT24S',
      repeatable: true,
    },
  ),
  annex(
    '주택거래계약 신고서',
    'house_transaction_report',
    '32',
    '거래 신고·확인',
    '매매',
    'sale',
    {
      form: 'HouseTradeContractInputForm',
      web: 'HouseTradeReportWebForm',
      report: 'HouseTradeContractReport',
      table: 'TPCT23S',
    },
  ),
  annex(
    '주택취득자금 조달 및 입주계획서',
    'house_funds_and_occupancy_plan',
    '46',
    '거래 신고·확인',
    '매매',
    'sale',
    {
      form: 'HousFundsPlanInputForm',
      web: 'HousePlanWebForm',
      report: 'HouseFundsPlanReport',
      table: 'TPCT22S',
    },
  ),
  annex(
    '부동산거래계약 신고서',
    'real_estate_transaction_report',
    '34',
    '거래 신고·확인',
    '매매',
    'sale',
    {
      form: 'RealStateTradeContractInputForm',
      web: 'TradeReportWebForm',
      report: 'RealStateTradeContractReport',
      table: 'TPCT26S',
    },
  ),
  annex(
    '부동산거래계약 해제등 신고서',
    'real_estate_transaction_cancel_report',
    '35',
    '거래 신고·확인',
    '매매',
    'sale',
    {
      form: 'RealStateTradeContractRemoveInputForm',
      web: 'TradeCancelReportWebForm',
      report: 'RealStateTradeContractRemoveReport',
      table: 'TPCT25S',
    },
  ),
  annex(
    '거래사실확인원',
    'fact_confirmation',
    '36',
    '거래 신고·확인',
    '공통',
    'sale',
    {
      form: 'TradeFactConfirmInputForm',
      web: 'TradeFactWebForm',
      report: 'TradeFactConfirmReport',
      table: 'TPCT21S',
    },
  ),
  annex(
    '부동산 매매약정서',
    'trade_agreement',
    '37',
    '거래 신고·확인',
    '매매',
    'sale',
    {
      form: 'RealStateTradeAgreementInputForm',
      web: 'TradeAgreeWebForm',
      report: 'RealStateTradeAgreementReport',
      table: 'TPCT17S',
    },
  ),
  annex(
    '전대차 동의서',
    'sublease_agreement',
    '38',
    '거래 신고·확인',
    '전대',
    'sublease',
    {
      form: 'SubleaseAgreeInputForm',
      web: 'SubleaseAgreeWebForm',
      report: 'SubleaseAgreeReport',
      table: 'TPCT29S',
    },
  ),
  annex(
    '임대차계약 신고·변경신고서 (통합)',
    'lease_declaration',
    '47',
    '거래 신고·확인',
    '임대',
    'monthly',
    {
      form: 'LeaseForm',
      web: 'LeaseWebForm',
      report: 'LeaseContractReport',
      table: 'TPCT33S',
    },
  ),
  annex(
    '현금보관증',
    'cash_receipt_document',
    '41',
    '증빙·동의',
    '공통',
    'sale',
    {
      form: 'CashReceiptInputForm',
      web: 'CashWebForm',
      report: 'CashReceipReport',
      table: 'TPCT15S',
    },
  ),
  annex(
    '전속중개계약서',
    'exclusive_brokerage_contract',
    '42',
    '증빙·동의',
    '공통',
    'sale',
    {
      form: 'TransferMediationContractInputForm',
      web: 'ExclusiveWebForm',
      report: 'TransferMediationContractReport',
      table: 'TPCT11S',
    },
  ),
  annex(
    '개인정보 수집·이용 동의서',
    'privacy_agreement',
    '43',
    '증빙·동의',
    '공통',
    'sale',
    {
      form: 'PrivateInfoAgreeInputForm',
      web: 'PrivateWebForm',
      report: 'PrivateInfoAgreeReport',
      table: 'TPCT16S',
    },
  ),
  annex(
    '계약갱신요구권 행사 여부 확인서',
    'renewal_confirmation',
    '48',
    '증빙·동의',
    '매매',
    'sale',
    {
      form: 'RenewalInputForm',
      web: 'RenewalWebForm',
      report: 'RenewalReport',
      table: 'TPCT35S',
    },
  ),
  annex(
    '주택임대차계약 신고서',
    'house_lease_declaration',
    '49',
    '증빙·동의',
    '임대',
    'monthly',
    {
      form: 'HouseLeaseDeclarationInputForm',
      web: 'HouseReportWebForm',
      report: 'HouseLeaseDeclarationReport',
      table: 'TPCT36S',
    },
  ),
  annex(
    '임대보증 미가입 임차인 동의서',
    'guarantee_non_enrollment_agreement',
    '50',
    '증빙·동의',
    '임대',
    'monthly',
    {
      form: 'RenterAgreeInputForm',
      web: 'RenterAgreeWebForm',
      report: 'RenterAgreeReport',
      table: 'TPCT37S',
    },
  ),
  annex(
    '임대보증 일부가입 임차인 동의서',
    'guarantee_partial_enrollment_agreement',
    '52',
    '증빙·동의',
    '임대',
    'monthly',
    {
      form: 'RenterAgreeInputForm2',
      web: 'RenterAgreeWebForm2',
      report: 'RenterAgreeReport2',
      table: 'TPCT39S',
    },
  ),
  annex(
    '전세권설정 미요청 확인서',
    'jeonse_registration_not_requested',
    '51',
    '증빙·동의',
    '임대',
    'monthly',
    {
      form: 'NotRequestInputForm',
      web: 'NoRequestWebForm',
      report: 'NotRequestReport',
      table: 'TPCT38S',
    },
  ),
];

export const ANNEX_FORM_MENU_GROUPS = [
  { groupLabel: '확인·설명서', items: CONFIRMATION_FORM_MENU },
  ...['전용 계약서', '거래 신고·확인', '증빙·동의'].map((groupLabel) => ({
    groupLabel,
    items: ADD_FORM_MENU.filter((item) => item.groupLabel === groupLabel),
  })),
];

/** 하위 호환용 평탄 목록. */
export const ANNEX_FORM_MENU = [...CONFIRMATION_FORM_MENU, ...ADD_FORM_MENU];

export function findFormSpecByTemplate(
  templateCode: string,
  transactionType: string,
): FormRegistrationSpec | undefined {
  for (const group of CONTRACT_FORM_MENU) {
    const hit = group.items.find(
      (item) =>
        item.templateCode === templateCode &&
        item.transactionType === transactionType,
    );
    if (hit) return hit;
  }
  return ANNEX_FORM_MENU.find(
    (item) =>
      item.templateCode === templateCode &&
      (item.transactionType === transactionType || item.tradeLabel === '공통'),
  );
}

/** 문서 metadata.formRegistration 에 넣을 불변 스냅샷. */
export function toFormRegistrationMetadata(spec: FormRegistrationSpec) {
  return {
    propertyClass: spec.propertyClass,
    cntrClsf: spec.cntrClsf,
    transactionType: spec.transactionType,
    groupLabel: spec.groupLabel,
    tradeLabel: spec.tradeLabel,
    title: spec.title,
    repeatable: Boolean(spec.repeatable),
    subjectDefault: spec.subjectDefault,
    mySpiderForm: spec.mySpiderForm,
    mySpiderWebForm: spec.mySpiderWebForm,
    mySpiderReport: spec.mySpiderReport,
    legacyTableName: spec.legacyTableName,
  };
}
