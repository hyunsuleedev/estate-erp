export interface PostcodeResult {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  buildingCode: string;
  userSelectedType: 'R' | 'J';
  address: string;
  /** 법정동·법정리 코드(10자리) */
  bcode?: string;
  buildingName?: string;
  /** 공동주택 여부 */
  apartment?: 'Y' | 'N';
}

interface PostcodeConstructor {
  new (options: {
    oncomplete: (data: PostcodeResult) => void;
    onresize: () => void;
    width: string;
    height: string;
    autoMapping: boolean;
  }): { embed: (element: HTMLElement) => void };
}
declare global {
  interface Window {
    kakao?: { Postcode?: PostcodeConstructor };
  }
}

let loading: Promise<PostcodeConstructor> | null = null;
export function loadKakaoPostcode(): Promise<PostcodeConstructor> {
  if (window.kakao?.Postcode) return Promise.resolve(window.kakao.Postcode);
  if (loading) return loading;
  loading = new Promise<PostcodeConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      const Postcode = window.kakao?.Postcode;
      if (error || !Postcode) {
        script.remove();
        reject(error ?? new Error('주소 검색을 불러오지 못했습니다.'));
      } else resolve(Postcode);
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new Error('주소 검색 연결이 지연되고 있습니다. 다시 시도해 주세요.'),
        ),
      12000,
    );
    script.onload = () =>
      finish(
        window.kakao?.Postcode
          ? undefined
          : new Error('주소 검색을 불러오지 못했습니다.'),
      );
    script.onerror = () =>
      finish(
        new Error(
          '주소 검색에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',
        ),
      );
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
