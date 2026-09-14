// 카카오톡 공식 공유(카드형). 카카오 디벨로퍼스에서 받은 JavaScript 키를 NEXT_PUBLIC_KAKAO_JS_KEY 환경변수로 넣어야 켜진다.
// 앱 설정의 플랫폼 > Web 사이트 도메인에 공유할 주소(예: https://gknet.vercel.app)가 등록돼 있어야 한다
const KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
const SDK_INTEGRITY = "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka";

interface KakaoSdk {
  init(key: string): void;
  isInitialized(): boolean;
  Share: { sendDefault(settings: object): void };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

export const kakaoShareEnabled = !!KEY;

let loading: Promise<KakaoSdk> | null = null;

// 공유 버튼을 누른 뒤에 SDK를 받으면 팝업 차단에 걸려서, 편집기가 열릴 때 미리 받아 둔다
export function loadKakao(): Promise<KakaoSdk> {
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK_SRC;
      s.integrity = SDK_INTEGRITY;
      s.crossOrigin = "anonymous";
      s.async = true;
      s.onload = () => (window.Kakao ? resolve(window.Kakao) : reject(new Error("카카오 SDK를 불러오지 못했습니다")));
      s.onerror = () => {
        loading = null;
        reject(new Error("카카오 SDK를 불러오지 못했습니다"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function shareToKakao(opts: { url: string; imageUrl: string; title: string; description: string }) {
  if (!KEY) throw new Error("카카오 JavaScript 키가 설정되지 않았습니다");
  const Kakao = await loadKakao();
  if (!Kakao.isInitialized()) Kakao.init(KEY);
  const link = { mobileWebUrl: opts.url, webUrl: opts.url };
  Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: opts.title,
      description: opts.description,
      imageUrl: opts.imageUrl,
      imageWidth: 1200,
      imageHeight: 630,
      link,
    },
    buttons: [{ title: "전광판 보기", link }],
  });
}
