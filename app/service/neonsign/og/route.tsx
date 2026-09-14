import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { previewSegments, sharedConfigFromCode, SITE_TITLE } from "@/app/components/Neonsign/share";

const CAPTION = `${SITE_TITLE} · 눌러서 움직이는 전광판 보기`;
const BOARD_W = 1100;
const BOARD_H = 430;

// 이미지 생성기(satori)는 CSS 배경을 칸마다 반복해 깔지 못해서, 도트 격자는 SVG 패턴 이미지로 만든다
const svgUri = (dot: number, tile: string) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}">` +
      `<defs><pattern id="p" width="${dot}" height="${dot}" patternUnits="userSpaceOnUse">${tile}</pattern></defs>` +
      `<rect width="100%" height="100%" fill="url(#p)"/></svg>`
  ).toString("base64");

// 도트 간격은 글자 크기에 맞춘다. 글자 높이에 도트가 14줄쯤 들어가야 획이 읽힌다 (편집기 기본 15행과 비슷)
function dotGrid(fontSize: number) {
  const dot = Math.max(6, Math.min(12, Math.round(fontSize / 14)));
  const c = dot / 2;
  const hole = dot * 0.4;
  return {
    // 꺼진 LED 자리 (희미한 점)
    unlit: svgUri(dot, `<circle cx="${c}" cy="${c}" r="${hole * 0.8}" fill="rgba(255,255,255,0.09)"/>`),
    // 글자 위에 덮는 판: 칸마다 동그란 구멍이 뚫려 있어서 글자가 도트로 보인다
    mask: svgUri(
      dot,
      `<path fill="#0b0b0d" fill-rule="evenodd" d="M0 0H${dot}V${dot}H0Z M${c - hole} ${c}a${hole} ${hole} 0 1 0 ${hole * 2} 0a${hole} ${hole} 0 1 0 ${-hole * 2} 0Z"/>`
    ),
  };
}

// 기본 폰트에는 한글이 없어서, 이미지에 들어갈 글자만 담은 Noto Sans KR 조각을 구글 폰트에서 받아 온다
async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

// 카카오톡·SNS 링크 미리보기 이미지. 공유한 문구를 전광판처럼 도트 격자 너머로 보이게 그린다
export async function GET(request: NextRequest) {
  const cfg = await sharedConfigFromCode(request.nextUrl.searchParams.get("c"));
  const { segs, units } = previewSegments(cfg);
  const fontSize = Math.max(56, Math.min(230, Math.floor(1000 / Math.max(1, units))));
  const font = await loadKoreanFont(segs.map((s) => s.ch).join("") + CAPTION);
  const grid = dotGrid(fontSize);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#161618",
          fontFamily: font ? "NotoSansKR" : undefined,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: BOARD_W,
            height: BOARD_H,
            borderRadius: 28,
            border: "4px solid #2c2c30",
            backgroundColor: "#0b0b0d",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grid.unlit} width={BOARD_W} height={BOARD_H} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
          <div style={{ display: "flex", fontSize, fontWeight: 800, lineHeight: 1 }}>
            {segs.map((s, i) => (
              <span key={i} style={{ color: s.color, whiteSpace: "pre" }}>
                {s.ch}
              </span>
            ))}
          </div>
          {/* 글자 위에 구멍 뚫린 격자를 덮어서 도트로 보이게 한다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grid.mask} width={BOARD_W} height={BOARD_H} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        </div>
        <div style={{ display: "flex", marginTop: 38, fontSize: 36, fontWeight: 800, color: "#9a9a9a" }}>{CAPTION}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      emoji: "twemoji",
      fonts: font ? [{ name: "NotoSansKR", data: font, weight: 800, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    }
  );
}
