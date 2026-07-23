import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * 앱 셸(사이드바 + 배경) 테마 변형 시스템.
 * - CSS는 app.css의 :root[data-shell-theme=...] 블록이 담당
 * - 구조(variant)와 폭은 여기 메타데이터가 담당
 * 각 테마는 생산성 도구 레퍼런스 조사(docs/OPEN_SOURCE_AND_COMMERCIAL_SAAS_UI_REFERENCE_REPORT)의
 * 사이드바/배경 스타일을 Estate ERP에 맞게 번안한 것.
 */

export type ShellThemeId = 'notion' | 'linear' | 'airtable'

export interface ShellThemeMeta {
  id: ShellThemeId
  label: string
  description: string
  /** shadcn Sidebar variant — inset은 본문을 떠 있는 라운드 패널로 만든다 (Linear 신 UI) */
  sidebarVariant: 'sidebar' | 'floating' | 'inset'
  /** SidebarProvider style로 주입 (인라인이라 CSS로 못 덮음) */
  sidebarWidth: string
  /** 전환 메뉴 미리보기 스와치 */
  swatch: { sidebar: string; canvas: string; accent: string }
}

export const SHELL_THEMES: ShellThemeMeta[] = [
  {
    id: 'notion',
    label: '노션 웜 + 경계',
    description: '따뜻한 중성색 + 헤어라인 경계 (확정 후보)',
    sidebarVariant: 'sidebar',
    sidebarWidth: '15rem',
    swatch: { sidebar: '#f9f8f7', canvas: '#ffffff', accent: '#37352f' },
  },
  {
    id: 'linear',
    label: '리니어 인셋',
    description: '쿨 그레이 캔버스 위 떠 있는 본문 패널',
    sidebarVariant: 'inset',
    sidebarWidth: '14.5rem',
    swatch: { sidebar: '#f3f3f4', canvas: '#f3f3f4', accent: '#6d78d5' },
  },
  {
    id: 'airtable',
    label: '에어테이블 크리스프',
    description: '흰 사이드바 · 뚜렷한 경계선 · 파랑 액센트',
    sidebarVariant: 'sidebar',
    sidebarWidth: '15rem',
    swatch: { sidebar: '#ffffff', canvas: '#ffffff', accent: '#2d7ff9' },
  },
]

const DEFAULT_THEME: ShellThemeId = 'notion'
const STORAGE_KEY = 'estate-erp.shell-theme'

function readStoredTheme(): ShellThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return SHELL_THEMES.some((t) => t.id === stored)
    ? (stored as ShellThemeId)
    : DEFAULT_THEME
}

interface ShellThemeContextValue {
  themeId: ShellThemeId
  theme: ShellThemeMeta
  setThemeId: (id: ShellThemeId) => void
}

const ShellThemeContext = createContext<ShellThemeContextValue | null>(null)

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ShellThemeId>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.shellTheme = themeId
    return () => {
      delete document.documentElement.dataset.shellTheme
    }
  }, [themeId])

  const setThemeId = useCallback((id: ShellThemeId) => {
    setThemeIdState(id)
    window.localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const theme =
    SHELL_THEMES.find((t) => t.id === themeId) ?? SHELL_THEMES[0]

  return (
    <ShellThemeContext.Provider value={{ themeId, theme, setThemeId }}>
      {children}
    </ShellThemeContext.Provider>
  )
}

export function useShellTheme() {
  const ctx = useContext(ShellThemeContext)
  if (!ctx) {
    throw new Error('useShellTheme must be used within ShellThemeProvider')
  }
  return ctx
}
