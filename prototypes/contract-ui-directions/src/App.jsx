import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  Copy,
  FileCheck2,
  FilePenLine,
  FileText,
  Handshake,
  Home,
  IdCard,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Network,
  PanelLeft,
  PenLine,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  Settings,
  Sparkles,
  Users,
  WalletCards,
  X,
} from 'lucide-react';

const directions = [
  { id: 'hub', label: '시안 1', title: '문서 허브' },
  { id: 'workbench', label: '시안 2', title: '분할 작업대' },
  { id: 'wizard', label: '시안 3', title: '단계형 입력' },
];

const menuItems = [
  [LayoutDashboard, '대시보드'],
  [ClipboardCheck, 'AI 검토함'],
  [Sparkles, 'AI 채팅'],
  [Building2, '매물관리'],
  [IdCard, '연락처'],
  [Handshake, '거래관리'],
  [Network, '매칭'],
  [Users, '네트워크'],
  [MessageCircle, '상담기록'],
  [ReceiptText, '통화 관리'],
  [Users, '구매고객'],
  [ListChecks, '업무'],
  [CalendarDays, '캘린더'],
  [Home, '관리단지'],
  [FileText, '계약서 관리'],
  [WalletCards, '수수료/정산'],
  [Users, '직원관리'],
];

const contractDocuments = [
  { id: 'report', icon: AlertTriangle, title: '부동산 거래신고', category: '신고', status: 'urgent', updated: '-' },
  { id: 'contract', icon: FileText, title: '계약서', category: '계약', status: 'done', updated: '2026.07.15 09:20' },
  { id: 'explanation', icon: FileCheck2, title: '중개대상물 확인설명서', category: '확인', status: 'done', updated: '2026.07.15 09:18' },
  { id: 'identity', icon: IdCard, title: '신분증', category: '확인', status: 'done', updated: '2026.07.15 09:17' },
  { id: 'registry', icon: FileText, title: '등기 관련 서류', category: '등기', status: 'done', updated: '2026.07.11 17:36' },
];

const optionalDocuments = [
  { id: 'terms', icon: FileText, title: '기타 특약서', category: '참고', status: 'done', updated: '2026.07.14 16:05' },
  { id: 'receipt', icon: ReceiptText, title: '중개보수 영수증', category: '영수', status: 'waiting', updated: '-' },
];

function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark"><Building2 size={18} /></span>
      <span><strong>우리두나</strong><small>중개사무소</small></span>
      <span className="plan-badge">기본</span>
    </div>
  );
}

function Sidebar({ active = '계약서 관리' }) {
  return (
    <aside className="sidebar">
      <Logo />
      <p className="nav-label">메뉴</p>
      <nav className="nav-list">
        {menuItems.map(([Icon, label]) => (
          <button key={label} className={active === label ? 'nav-item active' : 'nav-item'}>
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
            {(label === '매물관리' || label === '수수료/정산') && <ChevronRight className="nav-arrow" size={15} />}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <p className="nav-label">즐겨찾기 단지</p>
      <button className="nav-item muted"><Plus size={17} /><span>단지를 추가하세요</span></button>
      <div className="user-row"><span className="avatar">k</span><strong>kimyoung</strong><ChevronDown size={14} /></div>
    </aside>
  );
}

function Topbar({ title = '계약서 관리', compact = false }) {
  return (
    <header className={compact ? 'topbar compact' : 'topbar'}>
      <div className="topbar-title"><PanelLeft size={18} /><span className="divider" />{title}</div>
      <div className="topbar-actions">
        {!compact && <button className="search-box"><Search size={16} /><span>전체 검색</span><kbd>⌘K</kbd></button>}
        {!compact && <button className="icon-button notification"><Bell size={18} /><b>2</b></button>}
        {!compact && <button className="primary small"><Plus size={16} />빠른 등록</button>}
      </div>
    </header>
  );
}

function DirectionSwitcher({ direction, onChange }) {
  return (
    <div className="direction-switcher" aria-label="시안 선택">
      <span className="switcher-label">HTML 시안</span>
      {directions.map((item) => (
        <button key={item.id} className={direction === item.id ? 'selected' : ''} onClick={() => onChange(item.id)}>
          <strong>{item.label}</strong><small>{item.title}</small>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'done') return <span className="badge blue">작성 완료</span>;
  if (status === 'urgent') return <span className="badge red">미작성 · 긴급</span>;
  return <span className="badge neutral">대기</span>;
}

function ContractHeader({ showTabs = true, activeTab = '문서 허브', onTabChange }) {
  const tabs = ['요약', '계약 정보', '당사자', '문서 허브', '거래 정보', '이력'];
  return (
    <>
      <section className="contract-head">
        <div>
          <div className="headline-row"><h1>고덕그라시움 101동 3503</h1><span className="badge blue">등기 완료</span><span className="badge blue soft">매매</span></div>
          <p>잔금일 2026.07.11 (D+4) · 업데이트 07.15 09:30</p>
          <div className="chip-row"><span className="chip"><Handshake size={14} />거래 · 잔금완료</span><span className="chip"><Building2 size={14} />고덕그라시움 101동 3503</span></div>
        </div>
        <div className="head-actions"><button className="secondary"><Printer size={16} />출력 미리보기</button><button className="secondary">업무 더보기<ChevronDown size={15} /></button></div>
      </section>
      {showTabs && (
        <div className="contract-tabs">
          {tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => onTabChange?.(tab)}>{tab}</button>)}
        </div>
      )}
    </>
  );
}

function ProgressSummary() {
  const stages = ['작성중', '서명완료', '계약금 완료', '잔금 완료', '등기 완료'];
  return (
    <section className="progress-summary">
      <div className="progress-track">
        {stages.map((stage, index) => (
          <div className={index === 4 ? 'stage current' : 'stage complete'} key={stage}>
            <span>{index === 4 ? <Check size={13} /> : ''}</span><small>{stage}</small>
          </div>
        ))}
      </div>
      <div className="summary-metrics">
        <div><small>전체 문서</small><strong>6 / 6</strong></div>
        <div><small>필수 문서</small><strong>5 / 5</strong></div>
        <div><small>작성된 문서</small><strong>6</strong></div>
        <div><small>미작성 필수</small><strong>0</strong></div>
      </div>
    </section>
  );
}

function DocumentTable({ rows, title, actionLabel = '수정', onAction }) {
  return (
    <section className="document-section">
      <div className="section-title"><h2>{title}</h2><span>{rows.filter((row) => row.status === 'done').length} / {rows.length}</span></div>
      <div className="document-table">
        <div className="document-row header"><span>문서명</span><span>상태</span><span>최종 업데이트</span><span>작업</span></div>
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div className="document-row" key={row.id}>
              <div className="doc-name"><Icon size={19} className={row.status === 'urgent' ? 'danger' : ''} /><span><strong>{row.title}</strong><small>{row.category}</small></span></div>
              <StatusBadge status={row.status} />
              <span className="update-time">{row.updated}</span>
              <div className="row-actions"><button className={row.status === 'urgent' ? 'primary compact' : 'secondary compact'} onClick={() => onAction?.(row)}>{row.status === 'urgent' ? '작성' : actionLabel}</button>{row.status !== 'urgent' && <button className="icon-button compact"><ChevronDown size={14} /></button>}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HubDirection() {
  const [tab, setTab] = useState('문서 허브');
  const [completedReport, setCompletedReport] = useState(false);
  const rows = useMemo(() => contractDocuments.map((row) => row.id === 'report' && completedReport ? { ...row, status: 'done', updated: '방금 전' } : row), [completedReport]);
  return (
    <div className="app-frame">
      <Sidebar />
      <main className="workspace">
        <Topbar />
        <ContractHeader activeTab={tab} onTabChange={setTab} />
        <div className="hub-content">
          <ProgressSummary />
          {tab !== '문서 허브' ? (
            <section className="placeholder-state"><CheckCircle2 size={38} /><h2>{tab}</h2><p>비교 시안에서는 문서 허브 흐름에 집중했습니다.</p><button className="primary" onClick={() => setTab('문서 허브')}>문서 허브로 이동</button></section>
          ) : (
            <div className="hub-grid">
              <div className="hub-main">
                <DocumentTable rows={rows} title="필수 문서" onAction={(row) => row.id === 'report' && setCompletedReport(true)} />
                <DocumentTable rows={optionalDocuments.slice(0, 1)} title="선택 문서" />
                <div className="hint-bar"><CheckCircle2 size={16} />{completedReport ? '필수 문서가 모두 준비되었습니다. 검토 후 출력할 수 있습니다.' : '필수 문서는 준비되었습니다. 거래신고 접수까지 진행을 완료해주세요.'}</div>
              </div>
              <aside className="hub-aside">
                <section className={completedReport ? 'side-card success-card' : 'side-card urgent-card'}>
                  <div className="side-card-kicker"><AlertTriangle size={15} />{completedReport ? '신고 작성 완료' : '긴급 신고 필요'}<span>{completedReport ? '완료' : 'D+17'}</span></div>
                  <h3>부동산 거래신고</h3><p>{completedReport ? '신고서를 검토하고 제출 상태로 변경하세요.' : '계약일 기준 30일 이내 신고가 필요합니다.'}</p><strong>{completedReport ? '작성 완료 · 방금 전' : '신고 마감일 2026.06.28 (D+17)'}</strong>
                </section>
                <section className="side-card"><h3>다음 할 일</h3><div className="next-task"><span><ClipboardCheck size={17} /></span><div><strong>{completedReport ? '문서 출력 검토' : '부동산 거래신고 작성'}</strong><small>{completedReport ? '완료된 문서를 한 번 더 확인하세요.' : '거래신고서를 작성하고 제출하세요.'}</small></div></div><button className="primary wide" onClick={() => setCompletedReport(true)}>{completedReport ? '출력 미리보기' : '작성하기'}</button></section>
                <section className="side-card contract-facts"><h3>계약 정보</h3><dl><dt>계약일</dt><dd>2026.05.29</dd><dt>잔금일</dt><dd>2026.07.11 (D+4)</dd><dt>거래금액</dt><dd>24억 2,000만원</dd><dt>매도인 / 매수인</dt><dd>강학군 / 이영희</dd></dl></section>
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const editorSections = [
  { id: 'contract', icon: FileText, label: '계약 내용', note: '필수 입력 4/4' },
  { id: 'payment', icon: CalendarDays, label: '대금 일정', note: '필수 입력 5/5' },
  { id: 'parties', icon: Users, label: '당사자', note: '필수 입력 3/4' },
  { id: 'terms', icon: FileText, label: '특약사항', note: '선택 입력' },
  { id: 'other', icon: ClipboardCheck, label: '기타 정보', note: '선택 입력' },
  { id: 'files', icon: FileCheck2, label: '첨부 문서', note: '선택 입력' },
];

function EditorHeader({ onSave, saved }) {
  return (
    <header className="editor-header"><div className="editor-title"><FileText size={18} /><span>계약서 입력</span><i /><strong>고덕그라시움 101동 3503</strong><span className="badge blue soft">매매</span><span className="badge neutral">등기 완료</span></div><div className="head-actions"><button className="secondary"><Printer size={16} />출력 미리보기</button><button className="primary" onClick={onSave}><Save size={16} />{saved ? '저장됨' : '저장'}</button><button className="icon-button"><MoreHorizontal size={18} /></button></div></header>
  );
}

function LabeledField({ label, required, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}{required && <b>*</b>}</span>{children}</label>;
}

function TextInput({ value, onChange, suffix, type = 'text' }) {
  return <div className="input-shell"><input type={type} value={value} onChange={(event) => onChange?.(event.target.value)} />{suffix && <span>{suffix}</span>}</div>;
}

function ContractForm({ activeSection }) {
  const [price, setPrice] = useState('2,420,000,000');
  const [deposit, setDeposit] = useState('242,000,000');
  const [middle, setMiddle] = useState('968,000,000');
  const [balance, setBalance] = useState('1,210,000,000');
  if (activeSection === 'payment') {
    return <div className="form-content"><div className="form-block"><div className="form-heading"><div><h2>대금 일정</h2><p>계약서에 인쇄될 금액과 지급일을 확인하세요.</p></div><span className="badge blue soft">만원 단위</span></div><div className="payment-form"><LabeledField label="매매대금" required><TextInput value={price} onChange={setPrice} suffix="원" /></LabeledField><LabeledField label="계약금" required><TextInput value={deposit} onChange={setDeposit} suffix="원" /></LabeledField><LabeledField label="계약금 지급일" required><TextInput type="date" value="2026-05-29" /></LabeledField><LabeledField label="중도금" required><TextInput value={middle} onChange={setMiddle} suffix="원" /></LabeledField><LabeledField label="중도금 지급일" required><TextInput type="date" value="2026-06-28" /></LabeledField><LabeledField label="잔금" required><TextInput value={balance} onChange={setBalance} suffix="원" /></LabeledField><LabeledField label="잔금 지급일" required><TextInput type="date" value="2026-07-11" /></LabeledField><LabeledField label="부동산 인도일" required><TextInput type="date" value="2026-07-11" /></LabeledField></div></div></div>;
  }
  if (activeSection === 'parties') {
    return <div className="form-content"><div className="form-block"><div className="form-heading"><div><h2>당사자</h2><p>계약서에 표시될 매도인과 매수인 정보를 확인하세요.</p></div><button className="secondary"><PenLine size={15} />당사자 관리</button></div><div className="party-grid"><div className="party-card"><span className="avatar large">강</span><div><small>매도인</small><strong>강학군</strong><p>서울특별시 강동구 고덕로 123</p></div><CheckCircle2 size={18} /></div><div className="party-card warning"><span className="avatar large">이</span><div><small>매수인</small><strong>이영희</strong><p>주민등록번호 입력 필요</p></div><AlertTriangle size={18} /></div></div></div></div>;
  }
  if (activeSection === 'terms') {
    return <div className="form-content"><div className="form-block"><div className="form-heading"><div><h2>특약사항</h2><p>계약 당사자가 합의한 추가 조건을 정리하세요.</p></div><button className="secondary">특약 불러오기<ChevronDown size={14} /></button></div><textarea className="terms-area" defaultValue={'1. 매도인은 매수인에게 위 부동산을 하자 없이 인도하며, 인도일은 잔금 지급일과 동일하게 한다.\n2. 중도금은 2026년 6월 28일까지 지급하며, 기한 내 미지급 시 계약은 자동 해제된다.\n3. 본 계약에 정하지 아니한 사항은 민법 및 관련 법령에 따른다.'} /><div className="editor-meta"><span>172 / 1,000</span><span>자동 저장됨</span></div></div></div>;
  }
  return <div className="form-content"><div className="form-block"><div className="form-heading"><div><h2>계약 내용</h2><p>계약의 기본 정보와 대상 부동산을 확인하세요.</p></div></div><div className="form-grid"><LabeledField label="문서 제목" required className="span-2"><TextInput value="부동산 매매계약서" /></LabeledField><LabeledField label="계약 유형" required><select defaultValue="sale"><option value="sale">매매</option><option>전세</option><option>월세</option></select></LabeledField><LabeledField label="계약일" required><TextInput type="date" value="2026-05-29" /></LabeledField><LabeledField label="부동산 표시" required className="span-2"><TextInput value="서울특별시 강동구 고덕로 123, 고덕그라시움 101동 3503호" /></LabeledField><LabeledField label="거래 유형" required><select defaultValue="private"><option value="private">개인 간 거래</option><option>공동중개</option></select></LabeledField><LabeledField label="목적물 종류" required><select defaultValue="apt"><option value="apt">아파트</option><option>오피스텔</option></select></LabeledField></div></div><div className="form-block compact-block"><div className="form-heading"><div><h2>특약사항</h2></div></div><textarea className="terms-area small" defaultValue="잔금일 이사 및 관리비 정산은 당사자 간 확인 후 진행한다." /></div></div>;
}

function ContractPreview() {
  return <div className="paper"><h2>부동산 매매계약서</h2><p className="paper-intro">매도인과 매수인은 아래 표시 부동산에 관하여 다음과 같이 매매계약을 체결한다.</p><h3>1. 부동산의 표시</h3><dl><dt>소재지</dt><dd>서울특별시 강동구 고덕로 123, 고덕그라시움 101동 3503호</dd><dt>종류</dt><dd>아파트</dd><dt>면적</dt><dd>전용 84.97㎡</dd></dl><h3>2. 계약 내용</h3><dl><dt>계약 유형</dt><dd>매매</dd><dt>계약일</dt><dd>2026년 05월 29일</dd><dt>거래 유형</dt><dd>개인 간 거래</dd></dl><h3>3. 대금 및 지급 일정</h3><table><thead><tr><th>구분</th><th>금액</th><th>비율</th><th>지급일</th></tr></thead><tbody><tr><td>매매대금</td><td>2,420,000,000원</td><td>-</td><td>-</td></tr><tr><td>계약금</td><td>242,000,000원</td><td>10%</td><td>2026.05.29</td></tr><tr><td>중도금</td><td>968,000,000원</td><td>40%</td><td>2026.06.28</td></tr><tr><td>잔금</td><td>1,210,000,000원</td><td>50%</td><td>2026.07.11</td></tr></tbody></table><h3>4. 인도일</h3><p>2026년 07월 11일</p><h3>5. 특약사항</h3><ol><li>매도인은 위 부동산을 하자 없이 인도한다.</li><li>잔금 수령과 동시에 소유권 이전 서류를 교부한다.</li><li>본 계약에 정하지 아니한 사항은 관련 법령에 따른다.</li></ol></div>;
}

function ValidationList() {
  return <div className="validation-list"><div className="validation-head"><strong>작성 점검</strong><span>1</span><small>저장 가능</small></div><div className="validation-row error"><AlertTriangle size={16} /><span>매수인 주민등록번호를 입력해주세요.</span><button>이동</button></div><div className="validation-row"><CheckCircle2 size={16} /><span>매매대금이 정확히 계산되었습니다.</span></div><div className="validation-row"><CheckCircle2 size={16} /><span>계약금·중도금·잔금 비율이 일치합니다.</span></div><div className="validation-row"><CheckCircle2 size={16} /><span>필수 일정이 모두 입력되었습니다.</span></div></div>;
}

function WorkbenchDirection() {
  const [activeSection, setActiveSection] = useState('contract');
  const [previewTab, setPreviewTab] = useState('preview');
  const [saved, setSaved] = useState(false);
  return <div className="editor-frame"><EditorHeader onSave={() => { setSaved(true); setTimeout(() => setSaved(false), 1400); }} saved={saved} /><div className="editor-subbar"><span>계약일 2026.05.29</span><span>잔금일 2026.07.11</span><span>업데이트 2026.07.13 17:36</span><button>계약 설정<ChevronDown size={14} /></button></div><div className="workbench-layout"><aside className="section-rail"><p>섹션</p>{editorSections.map(({ id, icon: Icon, label, note }) => <button key={id} className={activeSection === id ? 'active' : ''} onClick={() => setActiveSection(id)}><Icon size={18} /><span><strong>{label}</strong><small>{note}</small></span>{id === 'parties' ? <AlertTriangle className="danger" size={16} /> : activeSection === id ? <span className="rail-dot active" /> : <span className="rail-dot" />}</button>)}<div className="tip-card"><Sparkles size={17} /><strong>작성 팁</strong><p>왼쪽 섹션을 이동하며 필요한 정보를 완성하세요.</p></div></aside><ContractForm activeSection={activeSection} /><aside className="preview-panel"><div className="preview-tabs"><button className={previewTab === 'preview' ? 'active' : ''} onClick={() => setPreviewTab('preview')}>미리보기</button><button className={previewTab === 'check' ? 'active' : ''} onClick={() => setPreviewTab('check')}>작성 점검 <span>1</span></button></div>{previewTab === 'preview' ? <ContractPreview /> : <div className="preview-check"><h3>작성 점검</h3><p>문서 저장 전에 필요한 항목을 확인하세요.</p><ValidationList /></div>}<ValidationList /></aside></div></div>;
}

const wizardSteps = [
  ['기본 정보', 'contract'],
  ['계약 금액', 'amount'],
  ['지급 일정', 'schedule'],
  ['당사자', 'parties'],
  ['특약사항', 'terms'],
  ['검토 및 출력', 'review'],
];

function WizardStepContent({ step }) {
  if (step === 0) return <><div className="wizard-section-heading"><div><h2>기본 정보</h2><p>계약의 기본 정보를 입력하세요.</p></div><strong>* 필수 입력</strong></div><div className="wizard-grid"><LabeledField label="계약 유형" required><select defaultValue="sale"><option value="sale">매매</option><option>전세</option></select></LabeledField><LabeledField label="계약일" required><TextInput type="date" value="2026-05-29" /></LabeledField><h3 className="span-2">부동산 정보</h3><LabeledField label="단지/건물명" required><TextInput value="고덕그라시움" /></LabeledField><LabeledField label="동" required><TextInput value="101동" /></LabeledField><LabeledField label="호수" required><TextInput value="3503호" /></LabeledField><LabeledField label="소재지" required className="span-3"><TextInput value="서울특별시 강동구 고덕로 123" /></LabeledField><h3 className="span-3">거래 정보</h3><LabeledField label="거래 유형" required><select defaultValue="sale"><option value="sale">매매</option></select></LabeledField><LabeledField label="거래 목적물" required><select defaultValue="apt"><option value="apt">아파트</option></select></LabeledField><LabeledField label="면적"><TextInput value="84.95" suffix="㎡" /></LabeledField></div></>;
  if (step === 1) return <><div className="wizard-section-heading"><div><h2>계약 금액</h2><p>매매대금과 지급 비율을 입력하세요.</p></div><strong>* 필수 입력</strong></div><div className="wizard-amounts"><LabeledField label="매매대금" required><TextInput value="2,420,000,000" suffix="원" /></LabeledField><div className="ratio-card"><span>계약금</span><strong>242,000,000원</strong><small>10%</small></div><div className="ratio-card"><span>중도금</span><strong>968,000,000원</strong><small>40%</small></div><div className="ratio-card"><span>잔금</span><strong>1,210,000,000원</strong><small>50%</small></div><div className="ratio-total"><CheckCircle2 size={18} />대금 합계와 지급 비율이 일치합니다.</div></div></>;
  if (step === 2) return <><div className="wizard-section-heading"><div><h2>지급 일정</h2><p>계약금·중도금·잔금 지급일을 확인하세요.</p></div><strong>* 필수 입력</strong></div><div className="schedule-list">{[['계약금','242,000,000원','2026-05-29'],['중도금','968,000,000원','2026-06-28'],['잔금','1,210,000,000원','2026-07-11'],['부동산 인도','잔금일과 동일','2026-07-11']].map(([title, amount, date], index) => <div className="schedule-row" key={title}><span className="schedule-index">{index + 1}</span><div><strong>{title}</strong><small>{amount}</small></div><TextInput type="date" value={date} /><CheckCircle2 size={18} /></div>)}</div></>;
  if (step === 3) return <><div className="wizard-section-heading"><div><h2>당사자</h2><p>계약 당사자 정보를 확인하고 누락 항목을 보완하세요.</p></div><strong>* 필수 입력</strong></div><div className="party-grid"><div className="party-card"><span className="avatar large">강</span><div><small>매도인</small><strong>강학군</strong><p>본인 인증 완료</p></div><CheckCircle2 size={18} /></div><div className="party-card warning"><span className="avatar large">이</span><div><small>매수인</small><strong>이영희</strong><p>주민등록번호 확인 필요</p></div><AlertTriangle size={18} /></div></div><button className="secondary party-add"><Plus size={15} />당사자 추가</button></>;
  if (step === 4) return <><div className="wizard-section-heading"><div><h2>특약사항</h2><p>필요한 특약을 직접 작성하거나 저장된 문구를 불러오세요.</p></div><span className="badge neutral">선택 입력</span></div><div className="terms-toolbar"><button>기본 매매 특약</button><button>잔금일 이사</button><button>관리비 정산</button><button><Plus size={14} />직접 추가</button></div><textarea className="terms-area wizard-terms" defaultValue={'1. 매도인은 매수인에게 위 부동산을 하자 없이 인도하며, 인도일은 잔금 지급일과 동일하게 한다.\n2. 잔금일 기준 관리비와 공과금은 매도인이 정산한다.\n3. 본 계약에 정하지 아니한 사항은 민법 및 관련 법령에 따른다.'} /></>;
  return <><div className="wizard-section-heading"><div><h2>검토 및 출력</h2><p>입력한 정보를 확인하고 계약서를 저장하세요.</p></div><span className="badge blue">검토 준비</span></div><div className="review-layout"><div className="review-list"><div><CheckCircle2 /><span><strong>기본 정보</strong><small>필수 항목 입력 완료</small></span></div><div><CheckCircle2 /><span><strong>계약 금액</strong><small>24억 2,000만원 · 합계 일치</small></span></div><div><CheckCircle2 /><span><strong>지급 일정</strong><small>계약금·중도금·잔금 일정 완료</small></span></div><div className="warning"><AlertTriangle /><span><strong>당사자</strong><small>매수인 주민등록번호 확인 필요</small></span></div><div><CheckCircle2 /><span><strong>특약사항</strong><small>3개 조항 입력</small></span></div></div><button className="secondary wide"><Printer size={16} />출력 미리보기</button></div></>;
}

function WizardDirection() {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  return (
    <div className="wizard-frame wizard-shell">
      <Sidebar />
      <section className="wizard-workspace">
        <header className="wizard-header">
          <div className="wizard-title">계약서 작성</div>
          <button className="icon-button" aria-label="닫기"><X size={19} /></button>
        </header>
        <div className="wizard-progress">
          {wizardSteps.map(([label], index) => (
            <button key={label} className={step === index ? 'active' : index < step ? 'complete' : ''} onClick={() => setStep(index)}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              <small>{label}</small>
            </button>
          ))}
        </div>
        <div className="wizard-body">
          <main className="wizard-main">
            <WizardStepContent step={step} />
            <div className="wizard-actions">
              <button className="secondary" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1400); }}><Save size={16} />{saved ? '저장됨' : '임시 저장'}</button>
              <div>
                <button className="secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={16} />이전</button>
                <button className="primary" onClick={() => setStep((value) => Math.min(wizardSteps.length - 1, value + 1))}>{step === wizardSteps.length - 1 ? '저장 완료' : '다음'}<ChevronRight size={16} /></button>
              </div>
            </div>
          </main>
          <aside className="wizard-aside">
            <section className="summary-card">
              <h3>계약 요약</h3>
              <div className="summary-property"><span className="badge blue soft">매매</span><strong>고덕그라시움 101동 3503</strong><small>계약일 2026.05.29</small><small>작성자 kimyoung</small></div>
              <dl><dt>계약 금액</dt><dd>24억 2,000만원</dd><dt>계약금</dt><dd>2억 4,200만원</dd><dt>중도금</dt><dd>9억 6,800만원</dd><dt>잔금</dt><dd>12억 1,000만원</dd><dt>잔금 지급일</dt><dd>2026.07.11</dd></dl>
              <button className="secondary wide"><PenLine size={15} />요약 정보 편집</button>
            </section>
            <section className="input-status">
              <div><AlertTriangle size={17} /><strong>입력 상태</strong><span>필수 입력 1</span></div>
              {wizardSteps.slice(0, 5).map(([label], index) => <button key={label} onClick={() => setStep(index)}><span>{label}</span><b className={index === 3 ? 'required' : 'done'}>{index === 3 ? '필수' : '완료'}</b></button>)}
            </section>
            <section className="guide-card"><Sparkles size={17} /><div><strong>작성 가이드</strong><p>상단 단계를 클릭하면 언제든 다른 단계로 이동할 수 있습니다.</p></div></section>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [direction, setDirection] = useState('hub');
  return (
    <div className="prototype-root">
      <DirectionSwitcher direction={direction} onChange={setDirection} />
      <div className="prototype-canvas">
        {direction === 'hub' && <HubDirection />}
        {direction === 'workbench' && <WorkbenchDirection />}
        {direction === 'wizard' && <WizardDirection />}
      </div>
    </div>
  );
}
