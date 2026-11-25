/**
 * 표시 언어. 번역은 두 갈래다.
 *   - 화면 대부분: 소스의 한글 문구를 빌드할 때 번역 함수로 바꾼다(./auto.ts, 사전은 ./en/*.json).
 *   - 여기(i18next): 키로 찾는 옛 방식. 설정의 언어 이름과 MCP 카드만 쓴다.
 * 둘 다 같은 저장값(estate-erp:locale)을 읽는다. 고르지 않았으면 한국어다(기기 언어를 따라가지 않는다 —
 * 국내 사무소용이라 영어 기기에서도 한국어로 시작하는 쪽이 맞다).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { setDisplayLocale } from '@estate-erp/shared';

import { toast } from 'sonner';

import { LOCALE_STORAGE_KEY, autoLocale, isEnglish } from './auto';
import { UNSAVED_WORK_SELECTOR, createLocaleReloader } from './locale-reload';

import koCommon from './locales/ko/common.json';
import koSidebar from './locales/ko/sidebar.json';
import koSettings from './locales/ko/settings.json';

import enCommon from './locales/en/common.json';
import enSidebar from './locales/en/sidebar.json';
import enSettings from './locales/en/settings.json';

export const SUPPORTED_LOCALES = ['ko', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'ko';

i18n
  .use(initReactI18next)
  .init({
    lng: autoLocale,
    resources: {
      ko: {
        common: koCommon,
        sidebar: koSidebar,
        settings: koSettings,
      },
      en: {
        common: enCommon,
        sidebar: enSidebar,
        settings: enSettings,
      },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    defaultNS: 'common',
    ns: ['common', 'sidebar', 'settings'],
    interpolation: {
      escapeValue: false,
    },
  });

if (typeof document !== 'undefined') document.documentElement.lang = autoLocale;
// 금액 표기(formatPrice)는 서버와 함께 쓰는 패키지에 있어, 화면의 언어를 따로 알려 준다.
setDisplayLocale(autoLocale);

function storedLocale(): SupportedLocale {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'ko';
  } catch {
    return autoLocale;
  }
}

const DEFERRED_TOAST_ID = 'locale-reload-deferred';
// 이 폴더의 글은 빌드가 번역하지 않는다. 미뤄진 화면은 아직 예전 언어라 그 언어로 알린다.
const DEFERRED_TEXT = isEnglish
  ? {
      message: 'The language setting changed. This screen has unfinished work, so it was left as it is. It reloads in the new language once you save or close that work.',
      action: 'Reload now',
    }
  : {
      message: '언어 설정이 바뀌었습니다. 작성 중인 내용이 있어 이 화면은 그대로 두었습니다. 저장하거나 닫으면 새 언어로 다시 엽니다.',
      action: '지금 다시 불러오기',
    };

/**
 * 화면을 다시 불러오되, 작성 중인 내용이 있으면 끝날 때까지 미룬다(./locale-reload.ts).
 * 언어를 바꾼 탭과, 저장값이 바뀐 것을 본 다른 탭·창이 같은 길을 탄다.
 */
const reloader =
  typeof window === 'undefined'
    ? null
    : createLocaleReloader({
        stillWanted: () => storedLocale() !== autoLocale,
        isSaving: async () => {
          try {
            // 저장 요청이 도는 중에 다시 불러오면 요청의 결과를 화면이 받지 못한다
            const { queryClient } = await import('../providers/query-provider');
            return queryClient.isMutating() > 0;
          } catch {
            return false;
          }
        },
        hasUnsavedWork: () => Boolean(document.querySelector(UNSAVED_WORK_SELECTOR)),
        reload: () => window.location.reload(),
        watch: (check) => {
          const observer = new MutationObserver(check);
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['data-state', 'data-native-tab-discard-blocker', 'data-native-tab-dirty', 'data-native-tab-transfer'],
          });
          // 저장 요청이 끝나는 것은 화면 변화로 드러나지 않을 수 있어 간격을 두고도 본다
          const timer = window.setInterval(check, 1_000);
          return () => {
            observer.disconnect();
            window.clearInterval(timer);
          };
        },
        onDeferred: (reloadNow) => {
          toast(DEFERRED_TEXT.message, {
            id: DEFERRED_TOAST_ID,
            duration: Infinity,
            action: { label: DEFERRED_TEXT.action, onClick: reloadNow },
          });
        },
        onSettled: () => toast.dismiss(DEFERRED_TOAST_ID),
      });

/**
 * 언어를 바꾼다. 화면 밖(모듈 맨 위)에 적힌 문구는 불러올 때 한 번만 읽히므로 화면을 다시 불러온다.
 * 다른 탭·창의 화면은 저장값이 바뀐 것을 보고 스스로 다시 불러온다(아래).
 * 작성 중인 내용이 있는 화면은 그 내용을 저장하거나 닫을 때까지 예전 언어로 남는다.
 */
export function changeLocale(locale: SupportedLocale) {
  if (locale === storedLocale()) return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    return;
  }
  // 지금 언어로 되돌린 것이면 미뤄 둔 다시 불러오기를 그만둔다(request가 저장값을 보고 가린다)
  void reloader?.request();
}

export function currentLocale(): SupportedLocale {
  return autoLocale;
}

// 다른 탭·창에서 언어를 바꿨으면 이 화면도 다시 불러온다. 한 앱 안에서 언어가 섞여 보이지 않게 한다.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LOCALE_STORAGE_KEY) return;
    void reloader?.request();
  });
}

export default i18n;
