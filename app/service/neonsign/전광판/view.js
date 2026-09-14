/* ===== 전광판 엔진 =====
   dv.view("미디어들/전광판", 입력) 으로 아무 노트에나 붙일 수 있다.
   입력: "문구" | ["문구1","문구2"] | "프리셋:이름" | { ...설정 } | { editor: true }(편집기)
   설정 스키마는 아래 DEFAULTS 참고. 편집기에서 만든 설정을 그대로 JSON으로 뽑아 붙이는 용도. */

const PRESET_PATH = "데이터베이스/전광판 프리셋.md";
const VIEW_PATH = "미디어들/전광판";
const FONT_STACK = `"Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif`;
const SWATCHES = ["#ff2d2d", "#ffb000", "#37e04a", "#3ba7ff", "#ff4fd8", "#f2f2f2"];
// 색을 따로 안 정했을 때 쓰는 값. 아래 initAccent()에서 실제 테마 강조색으로 채워진다
let ACCENT_HEX = "#ff2d2d", ACCENT_COMP_HEX = "#37e04a", ACCENT_RGB = 0xff2d2d;

const DEFAULTS = {
    messages: [{ text: "안녕하세요 ★ 옵시디언 전광판입니다 ★", color: "#ff2d2d", effect: "scrollLeft", hold: 1.2 }],
    rows: 15,           // 세로 도트 수 (= 글자 해상도)
    weight: 2,          // 글자 굵기 1~5 (아래 WEIGHTS 참고). 4가 예전(굵게 고정) 모양
    cell: 8,            // 도트 피치(px)
    width: 0,           // 가로 칼럼 수 고정. 0이면 노트 너비에 맞춤
    shape: "circle",    // circle | square
    colorMode: "mono",  // mono(단색) | duo(듀오톤) | rgb(풀컬러)
    duo: ["#ff2d2d", "#37e04a"], // 듀오톤 패널의 서브 LED 두 개
    levels: 4,          // rgb 모드 채널당 계조 단계 (2면 8색짜리 옛날 간판)
    subpixel: true,     // 픽셀 안의 서브 LED를 따로 보여줄지
    glow: true,
    brightness: 1,
    bezel: false,       // 모듈 경계선
    moduleSize: 16,     // 모듈 한 장의 도트 수
    speed: 18,          // 초당 이동 칼럼 수
    gap: 0,             // 이어짐 문구 사이에 글자 간격 말고 더 띄울 칼럼 수
    trans: 0.45,        // 전환 효과 길이(초)
};

// 효과별 동작 종류. instant는 바로 나타나고, scroll은 문구 길이만큼 시간이 결정된다
const EFFECT_KIND = {
    none: "instant", blink: "instant",
    scrollLeft: "scroll", scrollRight: "scroll",
    pushUp: "push", pushDown: "push", pushLeft: "push", pushRight: "push",
    fade: "fade",
    wipe: "mask", curtain: "mask", dissolve: "mask", typing: "mask",
    slot: "slot", flash: "flash",
};
const EFFECT_LABELS = [
    ["none", "즉시"], ["scrollLeft", "좌로 흐름"], ["scrollRight", "우로 흐름"],
    ["pushUp", "위로 밀기"], ["pushDown", "아래로 밀기"],
    ["pushLeft", "좌로 밀기"], ["pushRight", "우로 밀기"],
    ["fade", "페이드"], ["wipe", "와이프"], ["curtain", "커튼"],
    ["dissolve", "디졸브"], ["typing", "타이핑"], ["blink", "점멸"],
    ["slot", "슬롯머신"], ["flash", "플래시"],
];

// ===== 잡다한 도구 =====
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clone = (o) => JSON.parse(JSON.stringify(o));

function hexToRgb(hex) {
    let c = String(hex || "").replace("#", "").trim();
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return ACCENT_RGB;
    return parseInt(c, 16);
}
const rgbToHex = (p) => "#" + (p & 0xffffff).toString(16).padStart(6, "0");
const R = (p) => (p >> 16) & 255, G = (p) => (p >> 8) & 255, B = (p) => p & 255;
const pack = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);

function hslPack(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return pack(f(0) * 255, f(8) * 255, f(4) * 255);
}
// 무지개 글자용. 채도 높은 LED 느낌으로 고정
const hueColor = (i) => hslPack((i * 32) % 360, 1, 0.55);

// ===== 테마 강조색 =====
// 색을 지정하지 않은 문구는 옵시디언 강조색으로 나오고, 듀오톤 패널의 두 번째 LED는 그 보색(색상환 반대편)이 된다.
// 테마 색을 바꾸면 색을 따로 지정 안 한 전광판은 따라서 바뀐다 (설정에 색을 저장하지 않으므로)
function initAccent() {
    const cs = getComputedStyle(document.body);
    const h = parseFloat(cs.getPropertyValue("--accent-h"));
    const s = parseFloat(cs.getPropertyValue("--accent-s"));
    const l = parseFloat(cs.getPropertyValue("--accent-l"));
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return; // 못 읽으면 기본 빨강 유지
    ACCENT_RGB = hslPack(h, s / 100, l / 100);
    ACCENT_HEX = rgbToHex(ACCENT_RGB);
    ACCENT_COMP_HEX = rgbToHex(hslPack((h + 180) % 360, s / 100, l / 100));
}
initAccent();
DEFAULTS.messages[0].color = ACCENT_HEX;
DEFAULTS.duo = [ACCENT_HEX, ACCENT_COMP_HEX];
SWATCHES.unshift(ACCENT_HEX);

// 이모지(ZWJ 조합 포함)가 쪼개지지 않게 문자 단위로 자른다
const SEGMENTER = (typeof Intl !== "undefined" && Intl.Segmenter) ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;
function graphemes(text) {
    if (SEGMENTER) return Array.from(SEGMENTER.segment(text), (s) => s.segment);
    return Array.from(text);
}

// ===== 글자별 색 마크업 =====
// {속성 속성 ...:글자} 형태. 속성은 공백으로 나열하고, 태그 안에 태그를 넣으면 바깥 속성을 물려받는다.
//   #ff0000 / #f00   정해진 색
//   무지개 rainbow    글자 순서대로 색상환을 돈다 (고정)
//   흐름 flow         그라데이션 무지개가 가로로 흘러간다. 흐름(#f00,#00f)처럼 색을 적으면 그 색들 사이 그라데이션이 흐른다
//   반짝 sparkle      색을 돌려 가며 바꾼다. 반짝(#f00,#fff)처럼 색을 적고, 생략하면 지금 색 ↔ 흰색
//   깜빡 blink        그 부분만 점멸
// 예: {#ff0000 깜빡:SALE}  {흐름:오늘의 {깜빡:특가}}
// 색 계열(색·무지개·흐름·반짝)은 안쪽 것이 이기고, 깜빡은 바깥에서 켰으면 안쪽도 계속 깜빡인다.
// 속성으로 못 읽는 {와 짝 없는 }는 그냥 글자로 둔다
const TAG_RE = /^\{([^{}:]{1,120}):/;
const ATTR_RE = /\s*(?:(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?![0-9a-fA-F])|(무지개|rainbow)|(흐름|flow)(?:\(([^()]*)\))?|(깜빡|blink)|(반짝|sparkle)(?:\(([^()]*)\))?)\s*/y;
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// 부분 효과 타이밍
const BLINK_PERIOD = 0.8;  // 깜빡: 한 번 켜졌다 꺼지는 시간(초)
const FLOW_STEP = 7;       // 흐름: 칼럼 하나당 색상 차이(도)
const FLOW_SPEED = 120;    // 흐름: 초당 흘러가는 색상(도)
const SPARKLE_STEP = 0.3;  // 반짝: 색이 한 칸 넘어가는 시간(초)

// 등장 효과 타이밍
const FLASH_TIME = 0.12;     // 플래시: 번쩍이는 시간(초)
const FLASH_MIN_GAP = 1;     // 플래시: 이 시간(초) 안에는 다시 번쩍이지 않는다 (광과민성)
const SLOT_SPIN = 22;        // 슬롯머신: 초당 굴러가는 행
const ART_SAMPLE = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];

// 태그 속성 부분을 읽는다. 모르는 말이 하나라도 섞이면 태그가 아니라고 보고 null
function parseTagAttrs(body) {
    const a = { paint: null, blink: false };
    ATTR_RE.lastIndex = 0;
    while (ATTR_RE.lastIndex < body.length) {
        const m = ATTR_RE.exec(body);
        if (!m) return null;
        if (m[1]) a.paint = { type: "solid", rgb: hexToRgb(m[1]) };
        else if (m[2]) a.paint = { type: "rainbow" };
        else if (m[5]) a.blink = true;
        else { // 흐름·반짝: 괄호 안 색 목록 (비어 있어도 됨, 색이 아닌 게 섞이면 태그가 아님)
            const list = ((m[3] ? m[4] : m[7]) || "").split(",").map((s) => s.trim()).filter(Boolean);
            if (list.some((c) => !HEX_RE.test(c))) return null;
            a.paint = { type: m[3] ? "flow" : "sparkle", colors: list.map(hexToRgb) };
        }
    }
    return (a.paint || a.blink) ? a : null;
}

function parseMarkup(text, baseColor) {
    const chars = graphemes(String(text ?? ""));
    const segs = [];
    const stack = [{ paint: { type: "solid", rgb: hexToRgb(baseColor) }, blink: false }];
    for (let i = 0; i < chars.length; i++) {
        const top = stack[stack.length - 1];
        if (chars[i] === "{") {
            const m = TAG_RE.exec(chars.slice(i, i + 122).join(""));
            const attrs = m && parseTagAttrs(m[1]);
            if (attrs) {
                let paint = attrs.paint || top.paint;
                if (paint.type === "sparkle" && !paint.colors.length) { // 색을 안 적은 반짝은 지금 색 ↔ 흰색
                    const cur = top.paint.type === "solid" ? top.paint.rgb : hexToRgb(baseColor);
                    paint = { type: "sparkle", colors: [cur, 0xffffff] };
                }
                stack.push({ paint, blink: top.blink || attrs.blink });
                i += graphemes(m[0]).length - 1; // 여는 태그는 글자 수만큼 건너뛴다
                continue;
            }
        }
        if (chars[i] === "}" && stack.length > 1) { stack.pop(); continue; }
        segs.push({ ch: chars[i], paint: top.paint, blink: top.blink });
    }
    return segs;
}

// ===== 도트 그림 =====
// art: ["..##..", ".####."] 한 줄이 도트 한 행. '.'·공백은 꺼짐, '#'은 문구 색, 그 밖의 글자는 palette({ "r": "#ff0000" })에서 색을 찾고 없으면 문구 색.
// 행 수보다 짧으면 세로 가운데에 놓고, 길면 가운데만 보인다. 글자 비트맵과 같은 모양으로 만들어서 효과·이어짐·반전이 그대로 먹는다.
// 칼럼 하나를 글자 하나로 쳐서 타이핑·슬롯머신은 칼럼 단위로 진행된다
function buildArtBitmap(m, rows) {
    const lines = m.art.slice(0, 64).map((l) => graphemes(String(l)));
    const w = Math.max(1, ...lines.map((l) => l.length));
    const base = hexToRgb(m.color || ACCENT_HEX);
    const pal = {};
    for (const [k, v] of Object.entries(m.palette || {})) if (HEX_RE.test(String(v))) pal[k] = hexToRgb(v);
    const top = Math.floor((rows - lines.length) / 2); // 음수면 위아래가 잘린다
    const bits = new Uint8Array(w * rows), colors = new Int32Array(w * rows).fill(base);
    lines.forEach((line, ly) => {
        const y = ly + top;
        if (y < 0 || y >= rows) return;
        line.forEach((ch, x) => {
            if (ch === "." || ch === " ") return;
            bits[x * rows + y] = 1;
            colors[x * rows + y] = ch === "#" ? base : (pal[ch] ?? base);
        });
    });
    return {
        w, rows, bits, colors,
        colColors: new Int32Array(w).fill(base),
        charIdx: Int32Array.from({ length: w }, (_, x) => x), charCount: w,
        bearL: 1, bearR: 1, // 이어짐으로 반복할 때 그림 사이 한 칸씩
        charBlink: new Uint8Array(w), charPaint: new Array(w).fill(null), charEmoji: new Uint8Array(w), dynamic: false,
    };
}

// 비트맵에 미리 칠해둘 색. 흐름·반짝은 그릴 때 시간에 맞춰 다시 칠하므로 여기 값은 자리만 채운다
function staticColor(paint, i) {
    if (paint.type === "solid") return paint.rgb;
    if (paint.type === "sparkle" || (paint.type === "flow" && paint.colors.length)) return paint.colors[0];
    return hueColor(i); // 무지개, 색 안 적은 흐름
}

// 색을 적은 흐름: 적은 색들을 차례로 섞어 가며 가로로 흐른다. 흐름 무지개와 같은 간격·속도를 쓴다
function flowGradient(colors, x, t) {
    const n = colors.length;
    const pos = (((((x * FLOW_STEP - t * FLOW_SPEED) / 360) % 1) + 1) % 1) * n;
    const i = Math.floor(pos) % n, f = pos - Math.floor(pos);
    const a = colors[i], b = colors[(i + 1) % n];
    return pack(R(a) + (R(b) - R(a)) * f, G(a) + (G(b) - G(a)) * f, B(a) + (B(b) - B(a)) * f);
}

// 편집기용: pos(커서)를 감싸는 태그 중 가장 안쪽의 색 계열 속성이 흐름·반짝이면 그 속성 토큰 위치와 색 목록을 돌려준다.
// 가장 안쪽 색 계열이 단색·무지개면 null (색 버튼이 평소처럼 선택 글자를 감싸게). 색 계열이 없는 태그(깜빡만)는 건너뛰고 바깥을 본다
function colorListTagAt(v, pos) {
    const stack = [];
    for (let i = 0; i < v.length && i < pos; i++) {
        if (v[i] === "{") {
            const m = TAG_RE.exec(v.slice(i, i + 122));
            if (m && parseTagAttrs(m[1])) {
                stack.push({ bodyStart: i + 1, bodyEnd: i + 1 + m[1].length });
                i += m[0].length - 1;
                continue;
            }
        }
        if (v[i] === "}" && stack.length) stack.pop();
    }
    for (let k = stack.length - 1; k >= 0; k--) {
        const t = stack[k], body = v.slice(t.bodyStart, t.bodyEnd);
        let last = null; // 파서처럼 마지막 색 계열 속성이 이긴다
        for (const m of body.matchAll(/#[0-9a-fA-F]{3,6}\b|무지개|rainbow|(흐름|flow|반짝|sparkle)(?:\(([^()]*)\))?/g)) last = m;
        if (!last) continue;
        if (!last[1]) return null;
        const colors = (last[2] || "").split(",").map((c) => c.trim()).filter(Boolean);
        return { ...t, name: last[1], colors, tokenStart: last.index, tokenEnd: last.index + last[0].length };
    }
    return null;
}

// ===== 텍스트 -> 도트 비트맵 =====
// 오프스크린 캔버스에 글자를 그린 뒤 알파값을 읽어 켜짐/꺼짐으로 이진화한다.
// 폰트 데이터를 따로 안 들고 다녀도 시스템 폰트가 아는 문자는 전부 나온다.
const measureCanvas = document.createElement("canvas");
const mctx = measureCanvas.getContext("2d");

// 굵기 단계 -> [폰트 두께, 도트를 켤 알파 문턱값]
// 해상도가 낮으면 획 가장자리의 안티앨리어싱 픽셀이 반투명으로 걸치는데, 문턱이 낮을수록 그것까지 켜져서 획이 한두 도트씩 불어난다.
// 폰트 두께만으로는 단계가 거칠어서(보통/굵게 두 개뿐인 폰트가 많음) 문턱값을 같이 움직인다
const WEIGHTS = { 1: [400, 0.6], 2: [400, 0.42], 3: [700, 0.6], 4: [700, 0.39], 5: [800, 0.25] };

// 이모지 판정. 실제로 컬러로 그려졌는지는 buildBitmap에서 픽셀을 보고 한 번 더 확인한다
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

// 오츄 알고리즘 ([[모빌리티비전시스템#오츄 알고리즘]])
// J(t) = n0(t)·v0(t) + n1(t)·v1(t) (두 묶음 분산의 가중합)를 최소로 만드는 t를 임계값으로 쓴다.
// 전체 분산은 t와 상관없이 고정이라 J 최소화 = 묶음 간 분산 n0·n1·(μ0-μ1)² 최대화와 같아서, 누적합 한 번으로 끝난다
function otsu(hist, n) {
    let sum = 0;
    for (let v = 0; v < 256; v++) sum += v * hist[v];
    let n0 = 0, s0 = 0, best = -1, bestT = 0;
    for (let t = 1; t < 256; t++) { // [0, t) / [t, 255]
        n0 += hist[t - 1];
        s0 += (t - 1) * hist[t - 1];
        const n1 = n - n0;
        if (!n0 || !n1) continue;
        const d = s0 / n0 - (sum - s0) / n1;
        const between = n0 * n1 * d * d;
        if (between > best) { best = between; bestT = t; }
    }
    return bestT;
}

function buildBitmap(segs, rows, weight, colorMode) {
    const empty = { w: 0, rows, bits: new Uint8Array(0), colors: new Int32Array(0), colColors: new Int32Array(0), charIdx: new Int32Array(0), charCount: 0, bearL: 0, bearR: 0, charBlink: new Uint8Array(0), charPaint: [], charEmoji: new Uint8Array(0), dynamic: false };
    if (!segs.length) return empty;

    const [fontWeight, cut] = WEIGHTS[clamp(Math.round(weight) || 2, 1, 5)];
    const alphaCut = Math.round(cut * 255);
    const fontSize = Math.max(6, Math.round(rows * 0.82));
    const font = `${fontWeight} ${fontSize}px ${FONT_STACK}`;
    mctx.font = font;

    // 글자별 x 구간. 앞부분을 통째로 재서 누적하면 커닝이 반영된다
    const bounds = [];
    let prefix = "";
    for (const s of segs) {
        const start = mctx.measureText(prefix).width;
        prefix += s.ch;
        bounds.push([start, mctx.measureText(prefix).width]);
    }

    const PAD = 2;
    const total = Math.ceil(mctx.measureText(prefix).width);
    const w = clamp(total + PAD * 2, 1, 40000);

    const c = document.createElement("canvas");
    c.width = w; c.height = rows;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.font = font;
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText(prefix, PAD, rows / 2 + rows * 0.02);

    const data = g.getImageData(0, 0, w, rows).data;
    const bits = new Uint8Array(w * rows);
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < rows; y++) {
            bits[x * rows + y] = data[(y * w + x) * 4 + 3] > alphaCut ? 1 : 0;
        }
    }

    // 칼럼 -> 글자 인덱스 (글자별 색, 타이핑 효과에 쓴다)
    const charIdx = new Int32Array(w).fill(-1);
    for (let i = 0; i < bounds.length; i++) {
        const s = Math.floor(bounds[i][0]) + PAD, e = Math.ceil(bounds[i][1]) + PAD;
        for (let x = Math.max(0, s); x < Math.min(w, e); x++) charIdx[x] = i;
    }
    // 글자 폭 밖으로 삐져나온 칼럼(이탤릭, 이모지 오버행 등)은 가장 가까운 글자에 붙인다.
    // 안 그러면 그 칼럼만 엉뚱하게 첫 글자 색으로 튄다
    for (let x = 0, last = -1; x < w; x++) {
        if (charIdx[x] >= 0) last = charIdx[x];
        else if (last >= 0) charIdx[x] = last;
    }
    for (let x = w - 1, next = -1; x >= 0; x--) {
        if (charIdx[x] >= 0) next = charIdx[x];
        else if (next >= 0) charIdx[x] = next;
    }

    // 글자별 색 (무지개는 등장 순서대로 색상환을 돈다)
    const charColor = new Int32Array(segs.length);
    for (let i = 0; i < segs.length; i++) charColor[i] = staticColor(segs[i].paint, i);
    const charEmoji = new Uint8Array(segs.length); // 이모지는 색 계열 속성을 무시하고 원래 색을 지킨다
    // colColors: 칼럼마다 그 글자의 색 (배경 반전 때 배경색), colors: 도트마다 실제 색 (이모지는 도트마다 다르다)
    const colColors = new Int32Array(w);
    for (let x = 0; x < w; x++) colColors[x] = charIdx[x] >= 0 ? charColor[charIdx[x]] : charColor[0] || 0xffffff;
    const colors = new Int32Array(w * rows);
    for (let x = 0; x < w; x++) colors.fill(colColors[x], x * rows, (x + 1) * rows);

    // 이모지: 컬러 글리프라 알파만 보면 색이 날아가고 통짜 실루엣이 된다
    // - 단색: 밝기를 오츄 알고리즘으로 둘로 나눠 밝은 쪽만 켠다 (눈·입 같은 어두운 부분이 꺼져서 모양이 읽힌다)
    // - 듀오톤/풀컬러: 글리프의 실제 색을 도트마다 그대로 쓴다
    for (let ci = 0; ci < segs.length; ci++) {
        if (!EMOJI_RE.test(segs[ci].ch)) continue;
        const hist = new Uint32Array(256);
        let n = 0, colorful = 0;
        for (let x = 0; x < w; x++) {
            if (charIdx[x] !== ci) continue;
            for (let y = 0; y < rows; y++) {
                const k = (y * w + x) * 4;
                if (data[k + 3] <= alphaCut) continue;
                const r = data[k], gg = data[k + 1], b = data[k + 2];
                hist[Math.round(0.299 * r + 0.587 * gg + 0.114 * b)]++;
                n++;
                if (Math.max(r, gg, b) - Math.min(r, gg, b) > 24 || Math.max(r, gg, b) < 200) colorful++;
            }
        }
        // ©, ™처럼 이모지 범위에 있어도 흰 글자로 그려진 건 일반 글자로 둔다
        if (!n || !colorful) continue;
        charEmoji[ci] = 1;

        if (colorMode === "mono") {
            const t = otsu(hist, n);
            let above = 0;
            for (let v = t; v < 256; v++) above += hist[v];
            if (above === 0 || above === n) continue; // 한쪽으로 몰리면 나눌 게 없으니 실루엣 유지
            for (let x = 0; x < w; x++) {
                if (charIdx[x] !== ci) continue;
                for (let y = 0; y < rows; y++) {
                    const k = (y * w + x) * 4;
                    if (Math.round(0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) < t) bits[x * rows + y] = 0;
                }
            }
        } else {
            for (let x = 0; x < w; x++) {
                if (charIdx[x] !== ci) continue;
                for (let y = 0; y < rows; y++) {
                    const k = (y * w + x) * 4;
                    colors[x * rows + y] = pack(data[k], data[k + 1], data[k + 2]);
                }
            }
        }
    }

    // 앞뒤 빈 칼럼은 잘라낸다 (좌우 여백이 제각각이면 스크롤 간격이 어색해짐)
    let lo = 0, hi = w - 1;
    const colLit = (x) => { for (let y = 0; y < rows; y++) if (bits[x * rows + y]) return true; return false; };
    while (lo <= hi && !colLit(lo)) lo++;
    while (hi >= lo && !colLit(hi)) hi--;
    if (lo > hi) return empty;

    const nw = hi - lo + 1;
    return {
        w: nw, rows,
        bits: bits.slice(lo * rows, (hi + 1) * rows),
        colors: colors.slice(lo * rows, (hi + 1) * rows),
        colColors: colColors.slice(lo, hi + 1),
        // 잘라낸 앞뒤 빈 칼럼 중 글자 자체의 여백 (PAD는 빼고). 이어짐에서 문구끼리 원래 자간으로 붙일 때 쓴다
        bearL: Math.max(0, lo - PAD),
        bearR: Math.max(0, Math.round(PAD + total - (hi + 1))),
        charIdx: charIdx.slice(lo, hi + 1),
        charCount: segs.length,
        // 시간에 따라 바뀌는 부분 효과. 그릴 때 charIdx로 찾아 적용한다
        charBlink: Uint8Array.from(segs, (s) => (s.blink ? 1 : 0)),
        charPaint: segs.map((s) => (s.paint.type === "flow" || s.paint.type === "sparkle" ? s.paint : null)),
        charEmoji,
        dynamic: segs.some((s) => s.blink || s.paint.type === "flow" || s.paint.type === "sparkle"),
    };
}

// ===== 색 모드별 픽셀 변환 =====
// 듀오톤 패널은 픽셀 하나에 LED가 두 개뿐이라 표현 가능한 색이 셋밖에 없다: A / B / 둘 다 켠 중간색.
// 목표 색을 a*A + b*B 로 가장 가깝게 근사하는 a, b를 구한 뒤 문턱값으로 켜고 끈다
function toDuo(rgb, ca, cb) {
    const t = [R(rgb) / 255, G(rgb) / 255, B(rgb) / 255];
    const va = [R(ca) / 255, G(ca) / 255, B(ca) / 255];
    const vb = [R(cb) / 255, G(cb) / 255, B(cb) / 255];
    const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    if (dot3(t, t) < 0.01) return [0, 0]; // 거의 검정이면 꺼둔다
    const aa = dot3(va, va), bb = dot3(vb, vb), ab = dot3(va, vb), at = dot3(va, t), bt = dot3(vb, t);
    const det = aa * bb - ab * ab;
    let a, b;
    if (Math.abs(det) < 1e-6) { a = aa > 0 ? at / aa : 0; b = 0; } // 두 LED 색이 사실상 같은 경우
    else { a = (at * bb - bt * ab) / det; b = (bt * aa - at * ab) / det; }
    a = clamp(a, 0, 1); b = clamp(b, 0, 1);
    if (a < 0.3 && b < 0.3) return a >= b ? [1, 0] : [0, 1]; // 둘 다 애매하면 가까운 쪽 하나만
    return [a >= 0.3 ? 1 : 0, b >= 0.3 ? 1 : 0];
}
function quantize(rgb, levels) {
    const n = clamp(levels | 0, 2, 8), step = 255 / (n - 1);
    return pack(Math.round(R(rgb) / step) * step, Math.round(G(rgb) / step) * step, Math.round(B(rgb) / step) * step);
}

// ===== 이어짐: 문구 비트맵 이어 붙이기 =====
// 사이 간격은 잘라냈던 글자 여백(왼쪽 조각의 오른쪽 여백 + 오른쪽 조각의 왼쪽 여백)을 되살린 원래 자간 + 추가 간격.
// cyclic이면 마지막에서 첫 조각으로 넘어가는 간격까지 뒤에 붙여서, 이 비트맵을 반복해 깔면 끊김 없는 띠가 된다
function joinBitmaps(parts, rows, gap, cyclic) {
    const sp = (a, b) => a.bearR + b.bearL + gap;
    const gapAfter = (k) => k < parts.length - 1 ? sp(parts[k], parts[k + 1]) : (cyclic ? sp(parts[k], parts[0]) : 0);
    let w = 0;
    for (let k = 0; k < parts.length; k++) w += parts[k].w + gapAfter(k);
    w = Math.max(1, w);
    const totalChars = parts.reduce((s, b) => s + b.charCount, 0);

    const out = {
        w, rows,
        bits: new Uint8Array(w * rows), colors: new Int32Array(w * rows),
        colColors: new Int32Array(w), charIdx: new Int32Array(w), charCount: 0,
        charBlink: new Uint8Array(totalChars), charPaint: [], charEmoji: new Uint8Array(totalChars),
        dynamic: parts.some((b) => b.dynamic),
        bearL: cyclic ? 0 : parts[0].bearL, bearR: cyclic ? 0 : parts[parts.length - 1].bearR,
    };
    let x = 0, lastCol = ACCENT_RGB, lastChar = 0;
    for (let k = 0; k < parts.length; k++) {
        const b = parts[k];
        out.bits.set(b.bits, x * rows);
        out.colors.set(b.colors, x * rows);
        out.colColors.set(b.colColors, x);
        for (let c = 0; c < b.w; c++) out.charIdx[x + c] = b.charIdx[c] + out.charCount;
        if (b.w) { lastCol = b.colColors[b.w - 1]; lastChar = out.charIdx[x + b.w - 1]; }
        x += b.w;
        out.charBlink.set(b.charBlink, out.charCount);
        out.charEmoji.set(b.charEmoji, out.charCount);
        for (const p of b.charPaint) out.charPaint.push(p);
        out.charCount += b.charCount;
        // 간격 칼럼은 도트는 꺼두고, 배경 반전·타이핑용 정보만 앞 글자 것을 이어받는다
        for (let c = gapAfter(k); c > 0 && x < w; c--, x++) { out.colColors[x] = lastCol; out.charIdx[x] = lastChar; }
    }
    return out;
}

// ===== 보드 =====
function createBoard(host, initial) {
    const screen = host.createEl("div", { cls: "ledbrd-screen" });
    const canvas = screen.createEl("canvas", { cls: "ledbrd-canvas" });
    const ctx = canvas.getContext("2d");

    // baseBmps: 문구 그대로의 비트맵, bmps: 이어짐 반복까지 반영한 표시용 비트맵, cyc[i]: 끝없이 반복되는 띠
    let cfg = null, msgs = [], baseBmps = [], bmps = [], cyc = [], cols = 0, rows = 0;
    let lum = new Float32Array(0), colBuf = new Int32Array(0), noise = new Float32Array(0);
    let bg = null, idx = 0, local = 0, lastT = 0, lastDraw = 0, raf = null;
    let tint = new Int32Array(0), tintSet = new Uint8Array(0); // 칼럼별 글자 색 (배경 반전용)
    // 부분 효과(깜빡·흐름·반짝)용. clock은 문구가 바뀌어도 이어서 가서 흐름이 문구마다 처음으로 튀지 않는다
    let clock = 0, blinkOff = false, anyDynamic = false, flowCol = new Int32Array(0);
    // 플래시 허용 여부 (문구 시작 때 정함)
    let flashOk = false, lastFlash = -Infinity;
    let playing = true, visible = true, alive = true;

    // --- 설정 반영
    function apply(next) {
        cfg = next;
        rows = clamp(cfg.rows | 0, 5, 32);
        msgs = (cfg.messages && cfg.messages.length) ? cfg.messages : DEFAULTS.messages;
        baseBmps = msgs.map((m) => (Array.isArray(m.art) && m.art.length)
            ? buildArtBitmap(m, rows)
            : buildBitmap(parseMarkup(m.text, m.color || ACCENT_HEX), rows, cfg.weight, cfg.colorMode));
        if (idx >= msgs.length) idx = 0;
        local = 0;
        onMessageStart();
        resize();
    }

    // 이어짐: 문구끼리 잇지 않고, 그 문구 자신을 원래 글자 간격으로 반복한다
    // - 정적인 효과: 화면에 들어가는 만큼 반복해 가운데 정렬로 채우고 흐르지 않는다 (★ → ★★★★★)
    // - 흐름 효과: 표시 시간 동안 이어서 흘려보내고, 남은 것이 다 빠져나가면 다음 문구. 문구가 하나뿐이면 끝없이 흐른다
    function buildDisplay() {
        const gap = Math.max(0, cfg.gap | 0);
        bmps = []; cyc = [];
        msgs.forEach((m, i) => {
            const b = baseBmps[i];
            if (!m.chain || !b.w) { bmps.push(b); cyc.push(false); return; }
            const between = b.bearR + b.bearL + gap; // 반복 사이 간격 = 한 줄로 이어 쓴 자간
            const period = b.w + between;
            if (EFFECT_KIND[effectOf(i)] === "scroll") {
                if (msgs.length === 1) { bmps.push(joinBitmaps([b], rows, gap, true)); cyc.push(true); return; }
                const hold = Math.max(0.1, m.hold == null ? 2 : m.hold);
                const k = clamp(Math.ceil(hold * speedOf(m) / period), 1, 400);
                bmps.push(joinBitmaps(new Array(k).fill(b), rows, gap, false)); cyc.push(false);
                return;
            }
            // k개를 늘어놓은 폭 = k·period - between 이 화면 폭 안에 들어가는 최대 k (한 개도 안 들어가면 긴 문구 처리로)
            const k = clamp(Math.floor((cols + between) / period), 1, 400);
            bmps.push(k === 1 ? b : joinBitmaps(new Array(k).fill(b), rows, gap, false)); cyc.push(false);
        });
        anyDynamic = bmps.some((b) => b.dynamic);
    }

    function resize() {
        const avail = Math.max(80, screen.clientWidth - 20); // padding 10px * 2
        cols = clamp(cfg.width > 0 ? (cfg.width | 0) : Math.floor(avail / cfg.cell), 8, 512);
        buildDisplay(); // 반복 개수가 화면 폭에 달려 있어서 폭이 바뀔 때마다 다시 만든다
        lum = new Float32Array(cols * rows);
        colBuf = new Int32Array(cols * rows);
        noise = new Float32Array(cols * rows);
        tint = new Int32Array(cols);
        tintSet = new Uint8Array(cols);
        flowCol = new Int32Array(cols);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random();

        const dpr = window.devicePixelRatio || 1;
        const w = cols * cfg.cell, h = rows * cfg.cell;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildBackground();
        draw();
    }

    // --- 도트 하나 그리기 (꺼진 도트 배경까지 같은 함수를 쓴다)
    function dot(target, cx, cy, r) {
        if (cfg.shape === "square") { target.fillRect(cx - r, cy - r, r * 2, r * 2); return; }
        target.beginPath();
        target.arc(cx, cy, r, 0, Math.PI * 2);
        target.fill();
    }

    // 픽셀 한 칸의 LED 배치. [상대x, 상대y, 반지름배율] 목록
    function subLayout() {
        if (cfg.colorMode === "duo" && cfg.subpixel) return [[0.33, 0.5, 0.21], [0.67, 0.5, 0.21]];
        if (cfg.colorMode === "rgb" && cfg.subpixel) return [[0.26, 0.5, 0.15], [0.5, 0.5, 0.15], [0.74, 0.5, 0.15]];
        return [[0.5, 0.5, 0.36]];
    }

    function buildBackground() {
        const dpr = window.devicePixelRatio || 1;
        const w = cols * cfg.cell, h = rows * cfg.cell;
        if (w <= 0 || h <= 0) { bg = null; return; }
        bg = document.createElement("canvas");
        bg.width = Math.round(w * dpr); bg.height = Math.round(h * dpr);
        const b = bg.getContext("2d");
        b.scale(dpr, dpr);
        b.fillStyle = "rgba(255,255,255,0.055)";
        const layout = subLayout();
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                for (const sub of layout) {
                    dot(b, x * cfg.cell + sub[0] * cfg.cell, y * cfg.cell + sub[1] * cfg.cell, cfg.cell * sub[2]);
                }
            }
        }
        if (cfg.bezel) { // 모듈 이어붙인 자국
            b.strokeStyle = "rgba(255,255,255,0.10)";
            b.lineWidth = 1;
            const m = Math.max(4, cfg.moduleSize | 0);
            for (let x = m; x < cols; x += m) { b.beginPath(); b.moveTo(x * cfg.cell, 0); b.lineTo(x * cfg.cell, h); b.stroke(); }
            for (let y = m; y < rows; y += m) { b.beginPath(); b.moveTo(0, y * cfg.cell); b.lineTo(w, y * cfg.cell); b.stroke(); }
        }
    }

    // --- 합성: 비트맵을 화면 격자에 올린다
    function blit(bmp, offX, offY, alpha, mask, dyOf) {
        if (!bmp || bmp.w === 0) return;
        for (let x = 0; x < cols; x++) {
            const sx = x - offX;
            if (sx < 0 || sx >= bmp.w) continue;
            const ci = bmp.dynamic ? bmp.charIdx[sx] : -1;
            const live = ci >= 0 ? liveColor(bmp, ci, x) : -1; // 흐름·반짝은 지금 시각의 색
            tint[x] = live >= 0 ? live : bmp.colColors[sx];
            tintSet[x] = 1;
            if (ci >= 0 && blinkOff && bmp.charBlink[ci]) continue; // 깜빡의 꺼진 순간
            const dy = dyOf ? dyOf(sx) : 0; // 슬롯머신: 이 칼럼을 세로로 굴린 양 (위아래가 이어진다)
            for (let y = 0; y < rows; y++) {
                let sy = y - offY;
                if (sy < 0 || sy >= bmp.rows) continue;
                if (dy) sy = (((sy - dy) % bmp.rows) + bmp.rows) % bmp.rows;
                if (!bmp.bits[sx * bmp.rows + sy]) continue;
                if (mask && !mask(x, y, sx)) continue;
                const i = y * cols + x;
                lum[i] = alpha;
                colBuf[i] = live >= 0 ? live : bmp.colors[sx * bmp.rows + sy];
            }
        }
    }

    // 흐름·반짝 글자의 지금 색. 해당 없거나 이모지면 -1 (비트맵에 칠해둔 색을 그대로 쓴다)
    function liveColor(bmp, ci, x) {
        const p = bmp.charPaint[ci];
        if (!p || bmp.charEmoji[ci]) return -1;
        if (p.type === "flow") return p.colors.length ? flowGradient(p.colors, x, clock) : flowCol[x];
        return p.colors[Math.floor(clock / SPARKLE_STEP) % p.colors.length]; // 반짝은 같은 태그 안 글자가 다 같이 바뀐다
    }

    // 끝없는 띠: 한 주기짜리 비트맵을 x0부터 dir 방향(1=오른쪽, -1=왼쪽)으로 화면 끝까지 반복해 깐다
    function blitTape(bmp, x0, offY, dir, alpha, mask) {
        const P = bmp.w;
        if (!P) return;
        let x = x0;
        if (dir > 0) {
            if (x + P <= 0) x += Math.floor(-x / P) * P; // 화면 왼쪽으로 완전히 지나간 주기는 건너뛴다
            for (; x < cols; x += P) blit(bmp, x, offY, alpha, mask);
        } else {
            if (x >= cols) x -= Math.ceil((x - cols + 1) / P) * P;
            for (; x + P > 0; x -= P) blit(bmp, x, offY, alpha, mask);
        }
    }

    // --- 배경 반전: 글자 자리만 끄고 나머지를 전부 켠다. 배경색은 그 칼럼에 걸친 글자의 색(마크업)을 따른다
    function invertFrame() {
        // 글자가 안 걸친 칼럼은 가장 가까운 글자 색을 이어받고, 화면에 글자가 하나도 없으면 문구 색
        let prev = -1;
        for (let x = 0; x < cols; x++) {
            if (tintSet[x]) prev = tint[x];
            else tint[x] = prev;
        }
        let next = -1;
        for (let x = cols - 1; x >= 0; x--) {
            if (tintSet[x]) next = tint[x];
            else if (tint[x] < 0) tint[x] = next;
        }
        const base = hexToRgb(msgs[idx] && msgs[idx].color);
        for (let x = 0; x < cols; x++) {
            const c = tint[x] < 0 ? base : tint[x];
            for (let y = 0; y < rows; y++) {
                const i = y * cols + x;
                lum[i] = 1 - lum[i];
                colBuf[i] = c;
            }
        }
    }

    const speedOf = (m) => Math.max(1, m.speed || cfg.speed);
    function effectOf(i) {
        const e = msgs[i].effect || "none";
        return EFFECT_KIND[e] ? e : "none";
    }
    // 화면보다 긴 문구 (흐르기 효과가 아닌데 뒷부분이 잘리는 경우)
    // 첫머리를 왼쪽에 붙여 효과를 먼저 보여주고, LONG_LEAD만큼 멈춘 뒤 끝이 오른쪽에 닿을 때까지 흘리고, 거기서 표시 시간만큼 머문다
    const LONG_LEAD = 0.8; // 효과가 끝나고 첫머리를 읽을 시간(초)
    const isLong = (i) => EFFECT_KIND[effectOf(i)] !== "scroll" && bmps[i].w > cols;
    // 문구가 다 나온 뒤 멈춰 있는 위치. 다음 문구가 밀어낼 때 여기서부터 밀려난다
    const restX = (i) => isLong(i) ? cols - bmps[i].w : Math.floor((cols - bmps[i].w) / 2);
    // 전환 시간. 슬롯머신은 글자가 하나씩 차례로 멈춰야 해서 글자 수에 맞춰 늘린다 (최대 3초)
    const transOf = (i) => effectOf(i) === "slot"
        ? clamp(0.12 * bmps[i].charCount, Math.max(0.3, cfg.trans), 3)
        : Math.max(0, cfg.trans);
    function durationOf(i) {
        if (cyc[i]) return Infinity; // 끝없는 띠는 다음으로 넘어가지 않는다
        const e = effectOf(i);
        if (EFFECT_KIND[e] === "scroll") return (bmps[i].w + cols) / speedOf(msgs[i]);
        const hold = Math.max(0.1, msgs[i].hold == null ? 2 : msgs[i].hold);
        if (isLong(i)) return transOf(i) + LONG_LEAD + (bmps[i].w - cols) / speedOf(msgs[i]) + hold;
        return transOf(i) + hold;
    }

    function compose() {
        lum.fill(0);
        tintSet.fill(0);
        if (anyDynamic) {
            blinkOff = (clock % BLINK_PERIOD) >= BLINK_PERIOD / 2;
            // 흐름 색은 화면 칼럼 위치로 정한다. 글자가 흘러가도 무지개는 화면을 기준으로 흐른다
            const shift = clock * FLOW_SPEED;
            for (let x = 0; x < cols; x++) flowCol[x] = hslPack((((x * FLOW_STEP - shift) % 360) + 360) % 360, 1, 0.55);
        }
        const m = msgs[idx], bmp = bmps[idx];
        if (!bmp || bmp.w === 0) return;
        const e = effectOf(idx), kind = EFFECT_KIND[e];
        const long = isLong(idx);
        const tr = transOf(idx);
        const introEnd = tr + LONG_LEAD;
        const cx = long
            ? -Math.min(bmp.w - cols, Math.floor(Math.max(0, local - introEnd) * speedOf(m)))
            : restX(idx);
        // 끝없는 띠(흐름 효과 + 이어짐 + 문구 하나)는 같은 비트맵을 반복해 깐다
        const put = (x, y, a, mask, dyOf) => cyc[idx] ? blitTape(bmp, x, y, 1, a, mask) : blit(bmp, x, y, a, mask, dyOf);

        if (kind === "scroll") { // 칼럼 단위로 딱딱 끊어 옮겨야 전광판처럼 보인다
            const travel = Math.floor(local * speedOf(m));
            if (e === "scrollLeft") put(cols - travel, 0, 1, null);
            else if (cyc[idx]) blitTape(bmp, travel - bmp.w, 0, -1, 1, null); // 오른쪽으로 흐르는 띠는 왼쪽으로 반복된다
            else blit(bmp, travel - bmp.w, 0, 1, null);
            return;
        }

        const p = tr <= 0 ? 1 : clamp(local / tr, 0, 1);

        if (e === "flash") { // 화면 전체가 한 번 번쩍인 뒤 바로 켜진다
            if (flashOk && local < FLASH_TIME) { lum.fill(1); colBuf.fill(hexToRgb(m.color)); return; }
            put(cx, 0, 1, null);
            return;
        }

        if (e === "slot") { // 글자마다 위아래로 굴러가다(위아래가 이어짐) 왼쪽 글자부터 차례로 멈춘다
            const n = Math.max(1, bmp.charCount);
            const dyOf = p >= 1 ? null : (sx) => {
                const ci = Math.max(0, bmp.charIdx[sx]);
                return p * n < ci + 1 ? Math.floor(local * SLOT_SPIN + ci * 5) % bmp.rows : 0;
            };
            put(cx, 0, 1, null, dyOf);
            return;
        }

        if (kind === "push") {
            const dx = e === "pushLeft" ? 1 : e === "pushRight" ? -1 : 0;
            const dy = e === "pushUp" ? 1 : e === "pushDown" ? -1 : 0;
            if (p < 1 && msgs.length > 1) { // 직전 문구가 같이 밀려나가야 밀기로 보인다
                const pi = (idx - 1 + msgs.length) % msgs.length;
                blit(bmps[pi], restX(pi) - Math.round(dx * p * cols), -Math.round(dy * p * rows), 1, null);
            }
            put(cx + Math.round(dx * (1 - p) * cols), Math.round(dy * (1 - p) * rows), 1, null);
            return;
        }

        if (e === "blink" && (!long || local < introEnd)) { // 긴 문구는 흐르기 시작하면 깜빡임을 멈춘다
            const period = clamp(12 / speedOf(m), 0.08, 1);
            if (Math.floor(local / period) % 2 === 1) return;
            put(cx, 0, 1, null);
            return;
        }

        if (kind === "fade") { put(cx, 0, 0.08 + 0.92 * p, null); return; }

        let mask = null;
        if (kind === "mask" && p < 1) {
            if (e === "wipe") mask = (gx) => gx <= p * cols;
            else if (e === "curtain") mask = (gx) => Math.abs(gx - (cols - 1) / 2) <= p * (cols / 2);
            else if (e === "dissolve") mask = (gx, gy) => noise[gy * cols + gx] <= p;
            else if (e === "typing") mask = (gx, gy, sx) => bmp.charIdx[sx] < Math.ceil(p * bmp.charCount);
        }
        put(cx, 0, 1, mask);
    }

    // 문구가 시작될 때 부른다. 플래시는 광과민성 때문에 FLASH_MIN_GAP 안에 두 번 번쩍이지 않는다
    function onMessageStart() {
        flashOk = !!msgs[idx] && effectOf(idx) === "flash" && clock - lastFlash >= FLASH_MIN_GAP;
        if (flashOk) lastFlash = clock;
    }

    // --- 격자를 실제 LED로 그린다
    function draw() {
        if (!cols || !rows) return;
        compose();
        // 반전은 문구마다 따로. 전환 중에도 지금 문구 기준으로 화면 전체가 뒤집힌다
        const inverted = !!(msgs[idx] && msgs[idx].invert);
        if (inverted) invertFrame();
        const w = cols * cfg.cell, h = rows * cfg.cell;
        ctx.clearRect(0, 0, w, h);
        if (bg) ctx.drawImage(bg, 0, 0, w, h);

        const layout = subLayout();
        const mono = cfg.colorMode === "mono";
        const monoRgb = hexToRgb(msgs[idx] && msgs[idx].color);
        const duoA = hexToRgb(cfg.duo[0]), duoB = hexToRgb(cfg.duo[1]);
        const buckets = new Map(); // 같은 색끼리 모아 그려서 fillStyle 변경 횟수를 줄인다

        const put = (rgb, a, px, py, r) => {
            a = clamp(a, 0, 1);
            if (a < 0.03) return;
            const key = "rgba(" + R(rgb) + "," + G(rgb) + "," + B(rgb) + "," + a.toFixed(2) + ")";
            let arr = buckets.get(key);
            if (!arr) buckets.set(key, (arr = []));
            arr.push(px, py, r);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                const a = lum[i] * cfg.brightness;
                if (a <= 0.02) continue;
                const px = x * cfg.cell, py = y * cfg.cell;
                const rgb = mono ? monoRgb : colBuf[i];

                if (cfg.colorMode === "duo") {
                    const duo = toDuo(rgb, duoA, duoB);
                    if (cfg.subpixel) {
                        put(duoA, duo[0] * a, px + layout[0][0] * cfg.cell, py + layout[0][1] * cfg.cell, cfg.cell * layout[0][2]);
                        put(duoB, duo[1] * a, px + layout[1][0] * cfg.cell, py + layout[1][1] * cfg.cell, cfg.cell * layout[1][2]);
                    } else { // 서브픽셀을 끄면 두 LED가 섞인 색 하나로 보인다
                        const mix = pack(R(duoA) * duo[0] + R(duoB) * duo[1], G(duoA) * duo[0] + G(duoB) * duo[1], B(duoA) * duo[0] + B(duoB) * duo[1]);
                        put(mix, Math.max(duo[0], duo[1]) * a, px + cfg.cell / 2, py + cfg.cell / 2, cfg.cell * 0.36);
                    }
                } else if (cfg.colorMode === "rgb") {
                    const q = quantize(rgb, cfg.levels);
                    if (cfg.subpixel) {
                        put(0xff0000, (R(q) / 255) * a, px + layout[0][0] * cfg.cell, py + layout[0][1] * cfg.cell, cfg.cell * layout[0][2]);
                        put(0x00ff00, (G(q) / 255) * a, px + layout[1][0] * cfg.cell, py + layout[1][1] * cfg.cell, cfg.cell * layout[1][2]);
                        put(0x0000ff, (B(q) / 255) * a, px + layout[2][0] * cfg.cell, py + layout[2][1] * cfg.cell, cfg.cell * layout[2][2]);
                    } else {
                        put(q, a, px + cfg.cell / 2, py + cfg.cell / 2, cfg.cell * 0.36);
                    }
                } else {
                    put(monoRgb, a, px + cfg.cell / 2, py + cfg.cell / 2, cfg.cell * 0.36);
                }
            }
        }

        // 반전일 땐 켜진 도트가 많아 번진 빛이 꺼진 글자를 덮어버려서 잔광을 끈다
        ctx.shadowBlur = cfg.glow && !inverted ? cfg.cell * 0.8 : 0;
        for (const entry of buckets) {
            ctx.fillStyle = entry[0];
            if (cfg.glow) ctx.shadowColor = entry[0];
            const pts = entry[1];
            for (let k = 0; k < pts.length; k += 3) dot(ctx, pts[k], pts[k + 1], pts[k + 2]);
        }
        ctx.shadowBlur = 0;
    }

    // --- 루프
    function frame(t) {
        raf = null;
        if (!alive) return;
        // 옵시디언은 화면에서 멀어진 블록의 DOM을 문서에서 떼어놨다가, 스크롤로 돌아오면 코드를 다시 돌리지 않고
        // 같은 요소를 도로 붙인다. 떼어졌다고 여기서 stop()해버리면 돌아왔을 때 멈춘 채로 남으니
        // 루프만 쉬고 IntersectionObserver가 다시 보인다고 알려주면 wake()로 깨운다.
        // 진짜 정리는 노트가 닫히거나 블록이 다시 렌더링될 때 dv.component가 stop()을 부른다
        if (!host.isConnected && io) { lastT = 0; return; }
        const dt = lastT ? Math.min((t - lastT) / 1000, 0.2) : 0;
        lastT = t;

        if (playing && visible) {
            local += dt;
            clock += dt;
            // 문구가 하나뿐이어도 흐르기는 계속 돌아야 한다
            if (msgs.length > 1 || EFFECT_KIND[effectOf(idx)] === "scroll" || isLong(idx)) {
                let guard = 0;
                while (local >= durationOf(idx) && guard++ < 16) {
                    local -= durationOf(idx);
                    idx = (idx + 1) % msgs.length;
                    onMessageStart();
                }
            }
            if (t - lastDraw >= 24) { draw(); lastDraw = t; } // 40fps면 충분하고, 잔광 켰을 때 CPU를 아낀다
        }
        raf = requestAnimationFrame(frame);
    }

    function wake() {
        if (!alive || raf) return;
        lastT = 0; // 쉬던 시간만큼 한 번에 건너뛰지 않게
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        ro.disconnect();
        if (io) io.disconnect();
    }

    const ro = new ResizeObserver(() => { if (alive) resize(); });
    ro.observe(screen);
    const io = typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((es) => {
            visible = es.some((e) => e.isIntersecting);
            if (visible) wake();
        }, { threshold: 0 })
        : null;
    if (io) io.observe(screen);
    dv.component.register(stop);

    apply(initial);
    raf = requestAnimationFrame(frame);

    return {
        el: screen,
        setConfig(next) { apply(next); },
        restart() { idx = 0; local = 0; onMessageStart(); draw(); },
        setPlaying(v) { playing = v; lastT = 0; },
        isPlaying: () => playing,
        stop,
    };
}

// ===== 프리셋 저장소 =====
// 이 볼트 규칙대로 데이터는 데이터베이스 폴더의 표에 쌓는다 (시간표/일일투두와 같은 방식)
const PRESET_TEMPLATE = [
    "#AI생성 #데이터",
    "",
    "[[전광판]] 편집기에서 저장한 프리셋이 쌓이는 곳입니다.",
    "",
    "- **이름**: 불러올 때 쓰는 키. 노트에서 `dv.view(\"미디어들/전광판\", \"프리셋:이름\")` 으로 바로 부를 수도 있습니다.",
    "- **설정**: 전광판 설정 전체가 JSON 한 줄로 들어갑니다. 표가 깨지지 않도록 `|` 는 `\\u007c` 로 escape 됩니다.",
    "",
    "| 이름 | 설정 |",
    "| --- | --- |",
    "",
].join("\n");

function locateTable(text) {
    const lines = text.split(/\r?\n/);
    let tagLine = lines.findIndex((l) => l.trim().startsWith("#AI생성") || l.trim().startsWith("#데이터"));
    if (tagLine === -1) tagLine = 0;
    let start = tagLine;
    while (start < lines.length && !lines[start].trim().startsWith("|")) start++;
    let end = start;
    while (end < lines.length && lines[end].trim().startsWith("|")) end++;
    return { lines, headerIdx: start, dataStart: start + 2, dataEnd: end };
}
function splitRow(line) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    return cells;
}

async function loadPresets() {
    const file = dv.app.vault.getAbstractFileByPath(PRESET_PATH);
    if (!file) return [];
    const t = locateTable(await dv.app.vault.read(file));
    const out = [];
    for (let i = t.dataStart; i < t.dataEnd; i++) {
        const cells = splitRow(t.lines[i]);
        if (cells.length < 2 || !cells[0]) continue;
        try { out.push({ name: cells[0], cfg: JSON.parse(cells[1]) }); } catch (e) { /* 깨진 줄은 건너뛴다 */ }
    }
    return out;
}

async function savePresets(list) {
    const rows = list.map((p) => "| " + p.name + " | " + JSON.stringify(p.cfg).replace(/\|/g, "\\u007c") + " |");
    const file = dv.app.vault.getAbstractFileByPath(PRESET_PATH);
    if (!file) {
        await dv.app.vault.create(PRESET_PATH, PRESET_TEMPLATE + rows.join("\n") + "\n");
        return;
    }
    await dv.app.vault.process(file, (content) => {
        const t = locateTable(content);
        return [
            ...t.lines.slice(0, t.headerIdx),
            "| 이름 | 설정 |",
            "| --- | --- |",
            ...rows,
            ...t.lines.slice(t.dataEnd),
        ].join("\n");
    });
}

// ===== 입력 -> 설정 =====
function normalizeMessage(m) {
    const base = { text: "", color: ACCENT_HEX, effect: "none", hold: 2 };
    return Object.assign(base, typeof m === "string" ? { text: m } : (m || {}));
}
function mergeConfig(base, patch) {
    const out = Object.assign({}, base, patch);
    out.messages = (patch.messages || base.messages).map(normalizeMessage);
    out.duo = (patch.duo || base.duo).slice(0, 2);
    // 배경 반전은 원래 전광판 전체 설정이었다. 그렇게 저장된 건 문구마다 켠 것으로 옮긴다
    if (out.invert) out.messages.forEach((m) => { if (m.invert == null) m.invert = true; });
    delete out.invert;
    return out;
}
async function resolveConfig(input) {
    const cfg = clone(DEFAULTS);
    if (input == null) return mergeConfig(cfg, {});
    if (typeof input === "string") {
        if (input.startsWith("프리셋:")) {
            const name = input.slice(4).trim();
            const found = (await loadPresets()).find((p) => p.name === name);
            if (found) return mergeConfig(cfg, found.cfg);
            return mergeConfig(cfg, { messages: [{ text: "프리셋 '" + name + "' 없음", color: "#ffb000", effect: "blink", hold: 3 }] });
        }
        return mergeConfig(cfg, { messages: [{ text: input, effect: "scrollLeft", hold: 1.2 }] });
    }
    if (Array.isArray(input)) return mergeConfig(cfg, { messages: input });
    return mergeConfig(cfg, input);
}

// 임베드용으로는 기본값과 다른 항목만 남겨서 코드를 짧게 뽑는다
function minimalConfig(cfg) {
    const out = { messages: cfg.messages.map((m) => {
        const t = { text: m.text };
        if (m.color !== ACCENT_HEX) t.color = m.color; // 강조색이면 안 적는다 - 붙여넣은 노트의 테마 색을 따라가도록
        if (m.effect !== "none") t.effect = m.effect;
        if (m.hold !== 2) t.hold = m.hold;
        if (m.speed) t.speed = m.speed;
        if (m.invert) t.invert = true;
        if (m.chain) t.chain = true;
        if (Array.isArray(m.art)) t.art = m.art;
        if (m.palette) t.palette = m.palette;
        return t;
    }) };
    for (const k of Object.keys(DEFAULTS)) {
        if (k === "messages") continue;
        if (JSON.stringify(cfg[k]) !== JSON.stringify(DEFAULTS[k])) out[k] = cfg[k];
    }
    return out;
}

// ===== 편집기 =====
async function createEditor(host) {
    const root = host.createEl("div", { cls: "ledbrd-root" });
    const cfg = mergeConfig(clone(DEFAULTS), {});
    const board = createBoard(root, cfg);

    let lastInput = null; // 글자별 색을 입힐 대상 (마지막으로 만진 문구 칸)
    const syncers = []; // 프리셋을 불러왔을 때 컨트롤 표시값을 cfg에 다시 맞추는 함수들

    function refresh() {
        board.setConfig(cfg);
        codeArea.value = embedCode();
    }

    // --- 공용 컨트롤 만들기
    function section(title) {
        const sec = root.createEl("div", { cls: "ledbrd-sec" });
        sec.createEl("h4", { text: title });
        return sec;
    }
    function addRange(parent, label, min, max, get, format, onChange) {
        const f = parent.createEl("div", { cls: "ledbrd-field" });
        f.createEl("label", { text: label });
        const input = f.createEl("input");
        input.type = "range"; input.min = min; input.max = max; input.value = get();
        const val = f.createEl("span", { cls: "ledbrd-val", text: format(get()) });
        input.addEventListener("input", () => {
            const v = Number(input.value);
            val.textContent = format(v);
            onChange(v);
        });
        syncers.push(() => { input.value = get(); val.textContent = format(get()); });
        return f;
    }
    function addSelect(parent, label, options, get, onChange) {
        const f = parent.createEl("div", { cls: "ledbrd-field" });
        if (label) f.createEl("label", { text: label });
        const sel = f.createEl("select");
        for (const opt of options) {
            const o = sel.createEl("option", { text: opt[1] });
            o.value = opt[0];
        }
        sel.value = get();
        sel.addEventListener("change", () => onChange(sel.value));
        syncers.push(() => { sel.value = get(); });
        return { field: f, sel };
    }
    function addCheck(parent, label, get, onChange) {
        const f = parent.createEl("div", { cls: "ledbrd-field" });
        const box = f.createEl("input");
        box.type = "checkbox";
        box.checked = get();
        syncers.push(() => { box.checked = get(); });
        box.id = "ledbrd-" + Math.random().toString(36).slice(2);
        const lab = f.createEl("label", { text: label });
        lab.setAttribute("for", box.id);
        box.addEventListener("change", () => onChange(box.checked));
        return f;
    }

    // --- 재생 바
    const bar = root.createEl("div", { cls: "ledbrd-bar" });
    const playBtn = bar.createEl("button", { cls: "ledbrd-btn", text: "⏸ 정지" });
    playBtn.addEventListener("click", () => {
        board.setPlaying(!board.isPlaying());
        playBtn.textContent = board.isPlaying() ? "⏸ 정지" : "▶ 재생";
    });
    const againBtn = bar.createEl("button", { cls: "ledbrd-btn sub", text: "↺ 처음부터" });
    againBtn.addEventListener("click", () => board.restart());

    // --- 문구 목록
    const msgSec = section("문구 — 위에서부터 순서대로 돌아감");
    const msgList = msgSec.createEl("div");

    function renderMessages() {
        msgList.empty();
        cfg.messages.forEach((m, i) => {
            const row = msgList.createEl("div", { cls: "ledbrd-msg" });

            const color = row.createEl("input");
            color.type = "color"; color.value = m.color; color.title = "이 문구의 기본 색";
            color.addEventListener("input", () => { m.color = color.value; refresh(); });

            if (Array.isArray(m.art)) {
                // 도트 그림: 한 줄이 도트 한 행. '.'·공백은 꺼짐, '#'은 문구 색, 다른 글자는 palette 색
                const artBox = row.createEl("textarea", { cls: "ledbrd-art" });
                artBox.value = m.art.join("\n");
                artBox.rows = Math.min(12, Math.max(3, m.art.length));
                artBox.spellcheck = false;
                artBox.title = "한 줄이 도트 한 행. . 이나 공백은 꺼짐, # 은 문구 색. 다른 글자 색은 코드의 palette로 지정";
                artBox.addEventListener("input", () => {
                    m.art = artBox.value.split("\n").map((l) => l.replace(/\s+$/, "")).slice(0, 64);
                    refresh();
                });
            } else {
                const text = row.createEl("input");
                text.type = "text"; text.value = m.text; text.placeholder = "표시할 문구";
                text.addEventListener("input", () => { m.text = text.value.slice(0, 500); refresh(); });
                text.addEventListener("focus", () => { lastInput = text; });
                if (!lastInput) lastInput = text;
            }

            const eff = row.createEl("select");
            for (const e of EFFECT_LABELS) {
                const o = eff.createEl("option", { text: e[1] });
                o.value = e[0];
            }
            eff.value = m.effect;
            eff.title = "등장 효과";
            eff.addEventListener("change", () => { m.effect = eff.value; refresh(); });
            const hold = row.createEl("input");
            hold.type = "number"; hold.min = "0.2"; hold.max = "60"; hold.step = "0.1";
            hold.value = m.hold; hold.title = "표시 시간(초) — 흐르기 효과에서는 무시됨(이어짐을 켜면 이어서 흐르는 시간). 화면보다 긴 문구는 끝까지 흐른 뒤 머무는 시간";
            hold.addEventListener("input", () => { m.hold = Number(hold.value) || 2; refresh(); });

            const spd = row.createEl("input");
            spd.type = "number"; spd.min = "1"; spd.max = "120"; spd.step = "1";
            spd.placeholder = "속도";
            spd.value = m.speed == null ? "" : m.speed;
            spd.title = "이 문구만 쓸 속도(초당 칼럼 수). 비우면 아래 움직임의 속도를 따름";
            spd.addEventListener("input", () => {
                const v = Number(spd.value);
                if (!String(spd.value).trim() || !Number.isFinite(v) || v <= 0) delete m.speed; // 빈 칸 = 전체 속도 상속
                else m.speed = clamp(v, 1, 120);
                refresh();
            });

            // 켜고 끄는 문구 옵션 버튼. 꺼져 있으면 키를 아예 지워서 붙여넣기 코드에 안 남게 한다
            const toggle = (label, key, title) => {
                const b = row.createEl("button", { cls: "ledbrd-btn sub ledbrd-toggle", text: label });
                b.title = title;
                b.toggleClass("is-on", !!m[key]);
                b.addEventListener("click", () => {
                    if (m[key]) delete m[key]; else m[key] = true;
                    b.toggleClass("is-on", !!m[key]);
                    refresh();
                });
            };
            const artBtn = row.createEl("button", { cls: "ledbrd-btn sub ledbrd-toggle", text: "그림" });
            artBtn.title = "문구 대신 도트 그림을 찍는다 (끄면 원래 문구로 돌아간다)";
            artBtn.toggleClass("is-on", Array.isArray(m.art));
            artBtn.addEventListener("click", () => {
                if (Array.isArray(m.art)) delete m.art; else m.art = ART_SAMPLE.slice();
                renderMessages(); refresh();
            });
            toggle("이어짐", "chain","이 문구를 원래 글자 간격으로 반복한다. 정적인 효과면 화면에 들어가는 만큼 채워서 멈춰 있고, 흐름 효과면 표시 시간 동안 이어서 흐른다(문구가 하나뿐이면 끝없이)");
            toggle("반전", "invert", "배경 반전: 글자 자리만 끄고 나머지 도트를 문구 색(마크업 포함)으로 켠다");

            const up = row.createEl("button", { cls: "ledbrd-btn icon", text: "↑" });
            up.title = "위로";
            up.addEventListener("click", () => {
                if (i === 0) return;
                cfg.messages.splice(i - 1, 0, cfg.messages.splice(i, 1)[0]);
                renderMessages(); refresh();
            });
            const down = row.createEl("button", { cls: "ledbrd-btn icon", text: "↓" });
            down.title = "아래로";
            down.addEventListener("click", () => {
                if (i === cfg.messages.length - 1) return;
                cfg.messages.splice(i + 1, 0, cfg.messages.splice(i, 1)[0]);
                renderMessages(); refresh();
            });
            const del = row.createEl("button", { cls: "ledbrd-btn icon", text: "✕" });
            del.title = "삭제";
            del.addEventListener("click", () => {
                if (cfg.messages.length === 1) return;
                cfg.messages.splice(i, 1);
                lastInput = null;
                renderMessages(); refresh();
            });
        });
    }

    const addBtn = msgSec.createEl("button", { cls: "ledbrd-btn sub", text: "+ 문구 추가" });
    addBtn.addEventListener("click", () => {
        cfg.messages.push(normalizeMessage({ text: "새 문구", effect: "pushUp", hold: 2 }));
        renderMessages(); refresh();
    });

    // --- 글자별 색 (선택한 부분에 마크업을 씌운다)
    const charBar = msgSec.createEl("div", { cls: "ledbrd-bar" });
    charBar.createEl("span", { cls: "ledbrd-val", text: "선택 글자:" });
    function keepFocus(el) { el.addEventListener("mousedown", (e) => e.preventDefault()); }

    function wrapSelection(tag) {
        const inp = lastInput;
        if (!inp) return;
        const s = inp.selectionStart, e = inp.selectionEnd;
        if (s == null || s === e) { setStatus("문구 칸에서 글자를 먼저 드래그해 선택하세요"); return; }
        inp.value = inp.value.slice(0, s) + "{" + tag + ":" + inp.value.slice(s, e) + "}" + inp.value.slice(e);
        inp.dispatchEvent(new Event("input"));
        inp.setSelectionRange(s, e + tag.length + 3);
    }
    // 색 버튼: 커서나 선택이 흐름·반짝 태그 안이면 그 태그 색 목록에 추가하고, 아니면 선택한 글자를 그 색으로 감싼다
    function applyColor(color) {
        const inp = lastInput;
        if (!inp) return;
        const s = inp.selectionStart ?? 0, e = inp.selectionEnd ?? s;
        const v = inp.value;
        const tag = colorListTagAt(v, s);
        if (!tag) { wrapSelection(color); return; }
        const body = v.slice(tag.bodyStart, tag.bodyEnd);
        const next = body.slice(0, tag.tokenStart) + tag.name + "(" + tag.colors.concat(color).join(",") + ")" + body.slice(tag.tokenEnd);
        const delta = next.length - body.length;
        inp.value = v.slice(0, tag.bodyStart) + next + v.slice(tag.bodyEnd);
        inp.dispatchEvent(new Event("input"));
        const shift = (p) => (p >= tag.bodyEnd ? p + delta : p); // 태그 머리 뒤에 있던 커서는 늘어난 만큼 민다
        inp.focus();
        inp.setSelectionRange(shift(s), shift(e));
        setStatus(tag.name + "에 " + color + " 추가 (" + (tag.colors.length + 1) + "색)");
    }
    for (const c of SWATCHES) {
        const sw = charBar.createEl("button", { cls: "ledbrd-swatch" });
        sw.style.background = c;
        sw.title = c + " 로 칠하기 (흐름·반짝 태그 안이면 그 색 목록에 추가)";
        keepFocus(sw);
        sw.addEventListener("click", () => applyColor(c));
    }
    const customChar = charBar.createEl("input");
    customChar.type = "color"; customChar.value = "#8a2be2"; customChar.title = "직접 고른 색으로 칠하기 (흐름·반짝 태그 안이면 그 색 목록에 추가)";
    // input은 색을 고르는 동안 계속 발생해서 목록에 수십 개가 들어가므로, 고르기를 마쳤을 때(change) 한 번만 적용한다
    customChar.addEventListener("change", () => applyColor(customChar.value));
    for (const [tag, title] of [
        ["무지개", "글자 순서대로 색상환을 돈다 (듀오톤·풀컬러)"],
        ["흐름", "그라데이션 무지개가 흘러간다. 태그 안에 커서를 두고 색을 누르면 그 색들 사이로 흐른다 (듀오톤·풀컬러)"],
        ["반짝", "색을 돌려 가며 바꾼다. 태그 안에 커서를 두고 색을 누르면 돌릴 색이 추가된다 (듀오톤·풀컬러)"],
        ["깜빡", "선택한 부분만 점멸 (모든 모드)"],
    ]) {
        const btn = charBar.createEl("button", { cls: "ledbrd-btn sub", text: tag });
        btn.title = title;
        keepFocus(btn);
        btn.addEventListener("click", () => wrapSelection(tag));
    }
    const clearBtn = charBar.createEl("button", { cls: "ledbrd-btn sub", text: "마크업 지우기" });
    keepFocus(clearBtn);
    clearBtn.addEventListener("click", () => {
        const inp = lastInput;
        if (!inp) return;
        let s = inp.selectionStart, e = inp.selectionEnd;
        if (s === e) { s = 0; e = inp.value.length; }
        // 속성으로 읽히는 여는 태그만 지운다 (그냥 글자인 {는 남긴다)
        const seg = inp.value.slice(s, e).replace(/\{([^{}:]{1,120}):/g, (m0, body) => (parseTagAttrs(body) ? "" : m0)).replace(/\}/g, "");
        inp.value = inp.value.slice(0, s) + seg + inp.value.slice(e);
        inp.dispatchEvent(new Event("input"));
    });
    msgSec.createEl("p", { cls: "ledbrd-hint", text: "숫자 칸은 순서대로 표시 시간(초) / 속도(초당 칼럼, 비우면 전체 속도). 단색 모드에서는 문구 색 하나만 쓰여서 색·무지개·흐름·반짝은 듀오톤·풀컬러에서 보이고, 깜빡은 모든 모드에서 동작합니다. 마크업은 {#ff0000 깜빡:SALE}처럼 속성을 나열하거나 태그 안에 태그를 넣을 수 있습니다. 반전을 켠 문구는 글자 자리만 끄고 나머지를 문구 색으로 켭니다. 이어짐을 켜면 그 문구가 반복됩니다 — 정적인 효과는 화면을 채워 멈춰 있고, 흐름 효과는 이어서 흐릅니다." });

    // --- 패널 설정
    const hwSec = section("패널");
    const hw = hwSec.createEl("div", { cls: "ledbrd-controls" });
    addRange(hw, "행 수", 5, 24, () => cfg.rows, (v) => String(v), (v) => { cfg.rows = v; refresh(); });
    addRange(hw, "글자 굵기", 1, 5, () => cfg.weight, (v) => ["", "가늘게", "보통", "약간 굵게", "굵게", "아주 굵게"][v], (v) => { cfg.weight = v; refresh(); });
    addRange(hw, "도트 크기", 4, 18, () => cfg.cell, (v) => v + "px", (v) => { cfg.cell = v; refresh(); });
    addRange(hw, "가로 칼럼", 0, 200, () => cfg.width, (v) => (v ? String(v) : "자동"), (v) => { cfg.width = v; refresh(); });
    addRange(hw, "밝기", 20, 100, () => Math.round(cfg.brightness * 100), (v) => v + "%", (v) => { cfg.brightness = v / 100; refresh(); });
    addSelect(hw, "도트 모양", [["circle", "원형"], ["square", "사각"]], () => cfg.shape, (v) => { cfg.shape = v; refresh(); });
    addCheck(hw, "잔광", () => cfg.glow, (v) => { cfg.glow = v; refresh(); });
    addCheck(hw, "모듈선", () => cfg.bezel, (v) => { cfg.bezel = v; refresh(); });

    // --- 색 모드
    const colorSec = section("색 표현");
    const colorRow = colorSec.createEl("div", { cls: "ledbrd-controls" });
    addSelect(colorRow, "모드", [["mono", "단색"], ["duo", "듀오톤"], ["rgb", "풀컬러"]], () => cfg.colorMode, (v) => {
        cfg.colorMode = v; syncColorFields(); refresh();
    });
    const subField = addCheck(colorRow, "서브픽셀 보이기", () => cfg.subpixel, (v) => { cfg.subpixel = v; refresh(); });
    const duoField = colorRow.createEl("div", { cls: "ledbrd-field" });
    duoField.createEl("label", { text: "LED 두 색" });
    [0, 1].forEach((i) => {
        const p = duoField.createEl("input");
        p.type = "color"; p.value = cfg.duo[i];
        p.addEventListener("input", () => { cfg.duo[i] = p.value; refresh(); });
        syncers.push(() => { p.value = cfg.duo[i]; });
    });
    const levelField = addRange(colorRow, "계조", 2, 8, () => cfg.levels, (v) => v + "단계", (v) => { cfg.levels = v; refresh(); });
    function syncColorFields() {
        duoField.style.display = cfg.colorMode === "duo" ? "" : "none";
        levelField.style.display = cfg.colorMode === "rgb" ? "" : "none";
        subField.style.display = cfg.colorMode === "mono" ? "none" : "";
    }
    colorSec.createEl("p", { cls: "ledbrd-hint", text: "듀오톤은 픽셀마다 LED가 두 개뿐인 실제 2색 패널을 흉내냅니다 — 두 색과 둘 다 켠 중간색까지 세 가지만 나옵니다. 풀컬러의 계조를 2단계로 내리면 옛날 8색 간판이 됩니다. 이모지는 단색에선 밝은 부분만 켜지고, 듀오톤·풀컬러에선 원래 색으로 나옵니다." });

    // --- 움직임
    const motionSec = section("움직임");
    const motion = motionSec.createEl("div", { cls: "ledbrd-controls" });
    addRange(motion, "속도", 1, 60, () => cfg.speed, (v) => String(v), (v) => { cfg.speed = v; refresh(); });
    addRange(motion, "이어짐 추가 간격", 0, 40, () => cfg.gap, (v) => (v ? "+" + v + "칸" : "글자 간격"), (v) => { cfg.gap = v; refresh(); });
    addRange(motion, "전환 시간", 0, 30, () => Math.round(cfg.trans * 10), (v) => (v / 10).toFixed(1) + "s", (v) => { cfg.trans = v / 10; refresh(); });

    // --- 프리셋
    const presetSec = section("프리셋");
    const presetBar = presetSec.createEl("div", { cls: "ledbrd-bar" });
    const presetSel = presetBar.createEl("select");
    const loadBtn = presetBar.createEl("button", { cls: "ledbrd-btn sub", text: "불러오기" });
    const nameInput = presetBar.createEl("input");
    nameInput.type = "text"; nameInput.placeholder = "프리셋 이름"; nameInput.style.width = "130px";
    const saveBtn = presetBar.createEl("button", { cls: "ledbrd-btn", text: "저장" });
    const delBtn = presetBar.createEl("button", { cls: "ledbrd-btn sub", text: "삭제" });
    const statusEl = presetSec.createEl("div", { cls: "ledbrd-status" });
    function setStatus(t) { statusEl.textContent = t; }

    let presets = [];
    async function reloadPresets(keep) {
        presets = await loadPresets();
        presetSel.empty();
        if (!presets.length) {
            const o = presetSel.createEl("option", { text: "저장된 프리셋 없음" });
            o.value = "";
        }
        for (const p of presets) {
            const o = presetSel.createEl("option", { text: p.name });
            o.value = p.name;
        }
        if (keep) presetSel.value = keep;
    }
    loadBtn.addEventListener("click", () => {
        const found = presets.find((p) => p.name === presetSel.value);
        if (!found) { setStatus("불러올 프리셋이 없습니다"); return; }
        const merged = mergeConfig(clone(DEFAULTS), found.cfg);
        for (const k of Object.keys(merged)) cfg[k] = merged[k];
        nameInput.value = found.name;
        syncers.forEach((f) => f());
        renderMessages(); syncColorFields(); refresh();
        setStatus("'" + found.name + "' 불러옴");
    });
    saveBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) { setStatus("프리셋 이름을 입력하세요"); return; }
        const next = presets.filter((p) => p.name !== name).concat([{ name, cfg: minimalConfig(cfg) }]);
        try {
            await savePresets(next);
            await reloadPresets(name);
            setStatus("'" + name + "' 저장됨 → " + PRESET_PATH);
        } catch (e) {
            setStatus("저장 실패: " + e.message);
        }
    });
    delBtn.addEventListener("click", async () => {
        const name = presetSel.value;
        if (!name) return;
        try {
            await savePresets(presets.filter((p) => p.name !== name));
            await reloadPresets();
            setStatus("'" + name + "' 삭제됨");
        } catch (e) {
            setStatus("삭제 실패: " + e.message);
        }
    });

    // --- 임베드 코드
    const embedSec = section("다른 노트에 붙이기");
    const codeArea = embedSec.createEl("textarea", { cls: "ledbrd-code" });
    codeArea.readOnly = true;
    const embedBar = embedSec.createEl("div", { cls: "ledbrd-bar" });
    const copyBtn = embedBar.createEl("button", { cls: "ledbrd-btn", text: "📋 복사" });
    copyBtn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(codeArea.value);
        copyBtn.textContent = "✓ 복사됨";
        setTimeout(() => { copyBtn.textContent = "📋 복사"; }, 1200);
    });
    const byName = embedBar.createEl("button", { cls: "ledbrd-btn sub", text: "프리셋 이름으로 부르는 코드" });
    byName.addEventListener("click", () => {
        const name = presetSel.value || nameInput.value.trim() || "이름";
        codeArea.value = "```dataviewjs\nawait dv.view(\"" + VIEW_PATH + "\", \"프리셋:" + name + "\")\n```";
    });
    embedSec.createEl("p", { cls: "ledbrd-hint", text: "여기 나온 블록을 그대로 다른 노트에 붙여넣으면 그 노트에서도 같은 전광판이 돕니다. 문구만 바꿔 달고 싶으면 dv.view(\"미디어들/전광판\", \"보여줄 문구\") 처럼 문자열 하나만 넘겨도 됩니다." });

    // --- 코드 불러오기: 다른 노트에 붙였던 블록을 다시 편집기로
    const importSec = section("코드 불러오기");
    const importArea = importSec.createEl("textarea", { cls: "ledbrd-code" });
    importArea.placeholder = "다른 노트에 붙였던 dataviewjs 블록이나 JSON을 붙여넣으세요";
    const importBar = importSec.createEl("div", { cls: "ledbrd-bar" });
    const importBtn = importBar.createEl("button", { cls: "ledbrd-btn", text: "편집기로 불러오기" });
    const importStatus = importBar.createEl("span", { cls: "ledbrd-status" });
    importSec.createEl("p", { cls: "ledbrd-hint", text: "붙여넣은 코드는 실행하지 않고 읽기만 합니다. 편집기에서 뽑은 JSON, \"문구\", [\"문구1\", \"문구2\"], \"프리셋:이름\" 형태를 받습니다." });

    // 코드블록 울타리와 dv.view(...) 껍데기를 벗기고 두 번째 인자만 JSON으로 읽는다.
    // eval은 쓰지 않는다 - 붙여넣은 코드가 실행되면 안 되니까. 그래서 키에 따옴표 없는 JS 객체는 못 읽는다
    function parseImport(raw) {
        let s = String(raw).trim().replace(/^```[\w-]*\s*/, "").replace(/```\s*$/, "").trim();
        const m = s.match(/dv\.view\(\s*(["'`])[^"'`]*\1\s*,\s*([\s\S]*)\)\s*;?\s*$/);
        if (m) s = m[2].trim();
        return JSON.parse(s);
    }
    importBtn.addEventListener("click", async () => {
        let input;
        try { input = parseImport(importArea.value); }
        catch { importStatus.textContent = "읽을 수 없는 코드입니다 (JSON 형식이어야 해요. 키에도 따옴표가 필요합니다)"; return; }
        if (input && typeof input === "object" && !Array.isArray(input) && input.editor) {
            importStatus.textContent = "편집기 블록이라 불러올 설정이 없습니다"; return;
        }
        const merged = await resolveConfig(input);
        // 손으로 고친 값의 타입이 틀리면(숫자 자리에 글자 등) 화면이 깨지니 기본값으로 되돌린다
        for (const k of Object.keys(DEFAULTS)) {
            if (k !== "messages" && typeof merged[k] !== typeof DEFAULTS[k]) merged[k] = clone(DEFAULTS[k]);
        }
        for (const k of Object.keys(merged)) cfg[k] = merged[k];
        syncers.forEach((f) => f());
        renderMessages(); syncColorFields(); refresh();
        importStatus.textContent = "불러옴 · 문구 " + cfg.messages.length + "개";
    });

    const FENCE = "```";
    function embedCode() {
        return FENCE + "dataviewjs\nawait dv.view(\"" + VIEW_PATH + "\", " + JSON.stringify(minimalConfig(cfg)) + ")\n" + FENCE;
    }

    renderMessages();
    syncColorFields();
    refresh();
    await reloadPresets();
    setStatus("");
}

// ===== 진입점 =====
// dataview는 await가 들어있는 뷰를 async IIFE로 감싸서 실행하는데, 그러면 여기서 난 예외를
// dataview 쪽 try/catch가 못 잡고 조용히 사라진다. 그래서 직접 화면에 뿌려준다
try {
    const opt = typeof input === "undefined" ? null : input;
    if (opt && typeof opt === "object" && !Array.isArray(opt) && opt.editor === true) {
        await createEditor(dv.container);
    } else {
        createBoard(dv.container.createEl("div", { cls: "ledbrd-root" }), await resolveConfig(opt));
    }
} catch (e) {
    dv.container.createEl("pre", { text: "전광판 오류: " + ((e && e.stack) || e) });
}
