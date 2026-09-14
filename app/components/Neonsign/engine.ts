import { ACCENT_HEX, EFFECT_KIND, type ColorMode, type EffectName, type NeonConfig, type NeonMessage } from "./types";

const FONT_STACK = `"Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif`;
const ACCENT_RGB = hexToRgb(ACCENT_HEX);

// ===== 잡다한 도구 =====
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex: string | undefined): number {
  let c = String(hex || "").replace("#", "").trim();
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return 0xffa500;
  return parseInt(c, 16);
}
export const rgbToHex = (p: number) => "#" + (p & 0xffffff).toString(16).padStart(6, "0");
const R = (p: number) => (p >> 16) & 255;
const G = (p: number) => (p >> 8) & 255;
const B = (p: number) => p & 255;
const pack = (r: number, g: number, b: number) =>
  (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);

function hslPack(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return pack(f(0) * 255, f(8) * 255, f(4) * 255);
}
export const hueColor = (i: number) => hslPack((i * 32) % 360, 1, 0.55);

// 이모지(ZWJ 조합 포함)가 쪼개지지 않게 문자 단위로 자른다
const SEGMENTER = typeof Intl !== "undefined" && (Intl as unknown as { Segmenter?: unknown }).Segmenter
  ? new Intl.Segmenter("ko", { granularity: "grapheme" })
  : null;
function graphemes(text: string): string[] {
  if (SEGMENTER) return Array.from(SEGMENTER.segment(text), (s) => s.segment);
  return Array.from(text);
}

// ===== 글자별 색 마크업 =====
// {속성 속성 ...:글자} 형태. 자세한 문법은 전광판.md 참고
type Paint =
  | { type: "solid"; rgb: number }
  | { type: "rainbow" }
  | { type: "flow"; colors: number[] }
  | { type: "sparkle"; colors: number[] };

interface Seg {
  ch: string;
  paint: Paint;
  blink: boolean;
}

const TAG_RE = /^\{([^{}:]{1,120}):/;
const ATTR_RE =
  /\s*(?:(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?![0-9a-fA-F])|(무지개|rainbow)|(흐름|flow)(?:\(([^()]*)\))?|(깜빡|blink)|(반짝|sparkle)(?:\(([^()]*)\))?)\s*/y;
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const BLINK_PERIOD = 0.8;
const FLOW_STEP = 7;
const FLOW_SPEED = 120;
const SPARKLE_STEP = 0.3;
const FLASH_TIME = 0.12;
const FLASH_MIN_GAP = 1;
const SLOT_SPIN = 22;
const LONG_LEAD = 0.8;

function parseTagAttrs(body: string): { paint: Paint | null; blink: boolean } | null {
  const a: { paint: Paint | null; blink: boolean } = { paint: null, blink: false };
  ATTR_RE.lastIndex = 0;
  while (ATTR_RE.lastIndex < body.length) {
    const m = ATTR_RE.exec(body);
    if (!m) return null;
    if (m[1]) a.paint = { type: "solid", rgb: hexToRgb(m[1]) };
    else if (m[2]) a.paint = { type: "rainbow" };
    else if (m[5]) a.blink = true;
    else {
      const list = ((m[3] ? m[4] : m[7]) || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (list.some((c) => !HEX_RE.test(c))) return null;
      a.paint = { type: m[3] ? "flow" : "sparkle", colors: list.map(hexToRgb) };
    }
  }
  return a.paint || a.blink ? a : null;
}

export function parseMarkup(text: string, baseColor: string): Seg[] {
  const chars = graphemes(String(text ?? ""));
  const segs: Seg[] = [];
  const stack: { paint: Paint; blink: boolean }[] = [{ paint: { type: "solid", rgb: hexToRgb(baseColor) }, blink: false }];
  for (let i = 0; i < chars.length; i++) {
    const top = stack[stack.length - 1];
    if (chars[i] === "{") {
      const m = TAG_RE.exec(chars.slice(i, i + 122).join(""));
      const attrs = m && parseTagAttrs(m[1]);
      if (attrs) {
        let paint = attrs.paint || top.paint;
        if (paint.type === "sparkle" && !paint.colors.length) {
          const cur = top.paint.type === "solid" ? top.paint.rgb : hexToRgb(baseColor);
          paint = { type: "sparkle", colors: [cur, 0xffffff] };
        }
        stack.push({ paint, blink: top.blink || attrs.blink });
        i += graphemes(m[0]).length - 1;
        continue;
      }
    }
    if (chars[i] === "}" && stack.length > 1) {
      stack.pop();
      continue;
    }
    segs.push({ ch: chars[i], paint: top.paint, blink: top.blink });
  }
  return segs;
}

// 편집기용: pos(커서)를 감싸는 태그 중 가장 안쪽의 색 계열 속성이 흐름·반짝이면 그 속성 토큰 위치와 색 목록을 돌려준다.
export function colorListTagAt(
  v: string,
  pos: number
): { bodyStart: number; bodyEnd: number; name: string; colors: string[]; tokenStart: number; tokenEnd: number } | null {
  const stack: { bodyStart: number; bodyEnd: number }[] = [];
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
    const t = stack[k];
    const body = v.slice(t.bodyStart, t.bodyEnd);
    let last: RegExpMatchArray | null = null;
    for (const m of body.matchAll(/#[0-9a-fA-F]{3,6}\b|무지개|rainbow|(흐름|flow|반짝|sparkle)(?:\(([^()]*)\))?/g)) last = m;
    if (!last) continue;
    if (!last[1]) return null;
    const colors = (last[2] || "").split(",").map((c) => c.trim()).filter(Boolean);
    return { ...t, name: last[1], colors, tokenStart: last.index!, tokenEnd: last.index! + last[0].length };
  }
  return null;
}

export function parseTagAttrsPublic(body: string) {
  return parseTagAttrs(body);
}

// ===== 비트맵 =====
export interface Bitmap {
  w: number;
  rows: number;
  bits: Uint8Array;
  colors: Int32Array;
  colColors: Int32Array;
  charIdx: Int32Array;
  charCount: number;
  bearL: number;
  bearR: number;
  charBlink: Uint8Array;
  charPaint: (Paint | null)[];
  charEmoji: Uint8Array;
  dynamic: boolean;
}

function emptyBitmap(rows: number): Bitmap {
  return {
    w: 0,
    rows,
    bits: new Uint8Array(0),
    colors: new Int32Array(0),
    colColors: new Int32Array(0),
    charIdx: new Int32Array(0),
    charCount: 0,
    bearL: 0,
    bearR: 0,
    charBlink: new Uint8Array(0),
    charPaint: [],
    charEmoji: new Uint8Array(0),
    dynamic: false,
  };
}

// art: ["..##..", ".####."] 한 줄이 도트 한 행. 자세한 문법은 전광판.md 참고
export function buildArtBitmap(m: NeonMessage, rows: number): Bitmap {
  const lines = (m.art || []).slice(0, 64).map((l) => graphemes(String(l)));
  const w = Math.max(1, ...lines.map((l) => l.length));
  const base = hexToRgb(m.color || ACCENT_HEX);
  const pal: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.palette || {})) if (HEX_RE.test(String(v))) pal[k] = hexToRgb(v);
  const top = Math.floor((rows - lines.length) / 2);
  const bits = new Uint8Array(w * rows);
  const colors = new Int32Array(w * rows).fill(base);
  lines.forEach((line, ly) => {
    const y = ly + top;
    if (y < 0 || y >= rows) return;
    line.forEach((ch, x) => {
      if (ch === "." || ch === " ") return;
      bits[x * rows + y] = 1;
      colors[x * rows + y] = ch === "#" ? base : pal[ch] ?? base;
    });
  });
  return {
    w,
    rows,
    bits,
    colors,
    colColors: new Int32Array(w).fill(base),
    charIdx: Int32Array.from({ length: w }, (_, x) => x),
    charCount: w,
    bearL: 1,
    bearR: 1,
    charBlink: new Uint8Array(w),
    charPaint: new Array(w).fill(null),
    charEmoji: new Uint8Array(w),
    dynamic: false,
  };
}

function staticColor(paint: Paint, i: number): number {
  if (paint.type === "solid") return paint.rgb;
  if (paint.type === "sparkle" || (paint.type === "flow" && paint.colors.length)) return paint.colors[0];
  return hueColor(i);
}

function flowGradient(colors: number[], x: number, t: number): number {
  const n = colors.length;
  const pos = ((((x * FLOW_STEP - t * FLOW_SPEED) / 360) % 1) + 1) % 1 * n;
  const i = Math.floor(pos) % n;
  const f = pos - Math.floor(pos);
  const a = colors[i];
  const b = colors[(i + 1) % n];
  return pack(R(a) + (R(b) - R(a)) * f, G(a) + (G(b) - G(a)) * f, B(a) + (B(b) - B(a)) * f);
}

// WEIGHTS: 굵기 단계 -> [폰트 두께, 도트를 켤 알파 문턱값]
const WEIGHTS: Record<number, [number, number]> = { 1: [400, 0.6], 2: [400, 0.42], 3: [700, 0.6], 4: [700, 0.39], 5: [800, 0.25] };
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

let measureCanvas: HTMLCanvasElement | null = null;
let mctx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!mctx) {
    measureCanvas = document.createElement("canvas");
    mctx = measureCanvas.getContext("2d")!;
  }
  return mctx;
}

function otsu(hist: Uint32Array, n: number): number {
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let n0 = 0,
    s0 = 0,
    best = -1,
    bestT = 0;
  for (let t = 1; t < 256; t++) {
    n0 += hist[t - 1];
    s0 += (t - 1) * hist[t - 1];
    const n1 = n - n0;
    if (!n0 || !n1) continue;
    const d = s0 / n0 - (sum - s0) / n1;
    const between = n0 * n1 * d * d;
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

export function buildBitmap(segs: Seg[], rows: number, weight: number, colorMode: ColorMode): Bitmap {
  const empty = emptyBitmap(rows);
  if (!segs.length) return empty;

  const mctxLocal = getMeasureCtx();
  const [fontWeight, cut] = WEIGHTS[clamp(Math.round(weight) || 2, 1, 5)];
  const alphaCut = Math.round(cut * 255);
  const fontSize = Math.max(6, Math.round(rows * 0.82));
  const font = `${fontWeight} ${fontSize}px ${FONT_STACK}`;
  mctxLocal.font = font;

  const bounds: [number, number][] = [];
  let prefix = "";
  for (const s of segs) {
    const start = mctxLocal.measureText(prefix).width;
    prefix += s.ch;
    bounds.push([start, mctxLocal.measureText(prefix).width]);
  }

  const PAD = 2;
  const total = Math.ceil(mctxLocal.measureText(prefix).width);
  const w = clamp(total + PAD * 2, 1, 40000);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = rows;
  const g = c.getContext("2d", { willReadFrequently: true })!;
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

  const charIdx = new Int32Array(w).fill(-1);
  for (let i = 0; i < bounds.length; i++) {
    const s = Math.floor(bounds[i][0]) + PAD;
    const e = Math.ceil(bounds[i][1]) + PAD;
    for (let x = Math.max(0, s); x < Math.min(w, e); x++) charIdx[x] = i;
  }
  for (let x = 0, last = -1; x < w; x++) {
    if (charIdx[x] >= 0) last = charIdx[x];
    else if (last >= 0) charIdx[x] = last;
  }
  for (let x = w - 1, next = -1; x >= 0; x--) {
    if (charIdx[x] >= 0) next = charIdx[x];
    else if (next >= 0) charIdx[x] = next;
  }

  const charColor = new Int32Array(segs.length);
  for (let i = 0; i < segs.length; i++) charColor[i] = staticColor(segs[i].paint, i);
  const charEmoji = new Uint8Array(segs.length);
  const colColors = new Int32Array(w);
  for (let x = 0; x < w; x++) colColors[x] = charIdx[x] >= 0 ? charColor[charIdx[x]] : charColor[0] || 0xffffff;
  const colors = new Int32Array(w * rows);
  for (let x = 0; x < w; x++) colors.fill(colColors[x], x * rows, (x + 1) * rows);

  for (let ci = 0; ci < segs.length; ci++) {
    if (!EMOJI_RE.test(segs[ci].ch)) continue;
    const hist = new Uint32Array(256);
    let n = 0,
      colorful = 0;
    for (let x = 0; x < w; x++) {
      if (charIdx[x] !== ci) continue;
      for (let y = 0; y < rows; y++) {
        const k = (y * w + x) * 4;
        if (data[k + 3] <= alphaCut) continue;
        const r = data[k],
          gg = data[k + 1],
          b = data[k + 2];
        hist[Math.round(0.299 * r + 0.587 * gg + 0.114 * b)]++;
        n++;
        if (Math.max(r, gg, b) - Math.min(r, gg, b) > 24 || Math.max(r, gg, b) < 200) colorful++;
      }
    }
    if (!n || !colorful) continue;
    charEmoji[ci] = 1;

    if (colorMode === "mono") {
      const t = otsu(hist, n);
      let above = 0;
      for (let v = t; v < 256; v++) above += hist[v];
      if (above === 0 || above === n) continue;
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

  let lo = 0,
    hi = w - 1;
  const colLit = (x: number) => {
    for (let y = 0; y < rows; y++) if (bits[x * rows + y]) return true;
    return false;
  };
  while (lo <= hi && !colLit(lo)) lo++;
  while (hi >= lo && !colLit(hi)) hi--;
  if (lo > hi) return empty;

  const nw = hi - lo + 1;
  return {
    w: nw,
    rows,
    bits: bits.slice(lo * rows, (hi + 1) * rows),
    colors: colors.slice(lo * rows, (hi + 1) * rows),
    colColors: colColors.slice(lo, hi + 1),
    bearL: Math.max(0, lo - PAD),
    bearR: Math.max(0, Math.round(PAD + total - (hi + 1))),
    charIdx: charIdx.slice(lo, hi + 1),
    charCount: segs.length,
    charBlink: Uint8Array.from(segs, (s) => (s.blink ? 1 : 0)),
    charPaint: segs.map((s) => (s.paint.type === "flow" || s.paint.type === "sparkle" ? s.paint : null)),
    charEmoji,
    dynamic: segs.some((s) => s.blink || s.paint.type === "flow" || s.paint.type === "sparkle"),
  };
}

// ===== 색 모드별 픽셀 변환 =====
export function toDuo(rgb: number, ca: number, cb: number): [number, number] {
  const t = [R(rgb) / 255, G(rgb) / 255, B(rgb) / 255];
  const va = [R(ca) / 255, G(ca) / 255, B(ca) / 255];
  const vb = [R(cb) / 255, G(cb) / 255, B(cb) / 255];
  const dot3 = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  if (dot3(t, t) < 0.01) return [0, 0];
  const aa = dot3(va, va),
    bb = dot3(vb, vb),
    ab = dot3(va, vb),
    at = dot3(va, t),
    bt = dot3(vb, t);
  const det = aa * bb - ab * ab;
  let a: number, b: number;
  if (Math.abs(det) < 1e-6) {
    a = aa > 0 ? at / aa : 0;
    b = 0;
  } else {
    a = (at * bb - bt * ab) / det;
    b = (bt * aa - at * ab) / det;
  }
  a = clamp(a, 0, 1);
  b = clamp(b, 0, 1);
  if (a < 0.3 && b < 0.3) return a >= b ? [1, 0] : [0, 1];
  return [a >= 0.3 ? 1 : 0, b >= 0.3 ? 1 : 0];
}
export function quantize(rgb: number, levels: number): number {
  const n = clamp(levels | 0, 2, 8),
    step = 255 / (n - 1);
  return pack(Math.round(R(rgb) / step) * step, Math.round(G(rgb) / step) * step, Math.round(B(rgb) / step) * step);
}

// ===== 이어짐: 문구 비트맵 이어 붙이기 =====
export function joinBitmaps(parts: Bitmap[], rows: number, gap: number, cyclic: boolean): Bitmap {
  const sp = (a: Bitmap, b: Bitmap) => a.bearR + b.bearL + gap;
  const gapAfter = (k: number) => (k < parts.length - 1 ? sp(parts[k], parts[k + 1]) : cyclic ? sp(parts[k], parts[0]) : 0);
  let w = 0;
  for (let k = 0; k < parts.length; k++) w += parts[k].w + gapAfter(k);
  w = Math.max(1, w);
  const totalChars = parts.reduce((s, b) => s + b.charCount, 0);

  const out: Bitmap = {
    w,
    rows,
    bits: new Uint8Array(w * rows),
    colors: new Int32Array(w * rows),
    colColors: new Int32Array(w),
    charIdx: new Int32Array(w),
    charCount: 0,
    charBlink: new Uint8Array(totalChars),
    charPaint: [],
    charEmoji: new Uint8Array(totalChars),
    dynamic: parts.some((b) => b.dynamic),
    bearL: cyclic ? 0 : parts[0].bearL,
    bearR: cyclic ? 0 : parts[parts.length - 1].bearR,
  };
  let x = 0,
    lastCol = ACCENT_RGB,
    lastChar = 0;
  for (let k = 0; k < parts.length; k++) {
    const b = parts[k];
    out.bits.set(b.bits, x * rows);
    out.colors.set(b.colors, x * rows);
    out.colColors.set(b.colColors, x);
    for (let c = 0; c < b.w; c++) out.charIdx[x + c] = b.charIdx[c] + out.charCount;
    if (b.w) {
      lastCol = b.colColors[b.w - 1];
      lastChar = out.charIdx[x + b.w - 1];
    }
    x += b.w;
    out.charBlink.set(b.charBlink, out.charCount);
    out.charEmoji.set(b.charEmoji, out.charCount);
    for (const p of b.charPaint) out.charPaint.push(p);
    out.charCount += b.charCount;
    for (let c = gapAfter(k); c > 0 && x < w; c--, x++) {
      out.colColors[x] = lastCol;
      out.charIdx[x] = lastChar;
    }
  }
  return out;
}

// ===== 보드 컨트롤러 =====
export interface BoardController {
  setConfig(next: NeonConfig): void;
  restart(): void;
  setPlaying(v: boolean): void;
  isPlaying(): boolean;
  stop(): void;
  // 내보내기용: 재생을 멈춘 상태에서 시간을 직접 dt초만큼 진행하고 그린다
  step(dt: number): void;
  // 모든 문구가 한 바퀴 도는 시간(초). 끝없는 띠는 한 주기만 센다
  cycleDuration(): number;
  getCanvas(): HTMLCanvasElement;
  getCssSize(): { width: number; height: number };
}

export function createBoardController(screen: HTMLDivElement, canvas: HTMLCanvasElement, initial: NeonConfig): BoardController {
  const ctx = canvas.getContext("2d")!;

  let cfg: NeonConfig = initial;
  let msgs: NeonMessage[] = [];
  let baseBmps: Bitmap[] = [];
  let bmps: Bitmap[] = [];
  let cyc: boolean[] = [];
  let cols = 0,
    rows = 0;
  let lum = new Float32Array(0);
  let colBuf = new Int32Array(0);
  let noise = new Float32Array(0);
  let bg: HTMLCanvasElement | null = null;
  let idx = 0,
    local = 0,
    lastT = 0,
    lastDraw = 0,
    raf: number | null = null;
  let tint = new Int32Array(0);
  let tintSet = new Uint8Array(0);
  let clock = 0,
    blinkOff = false,
    anyDynamic = false;
  let flowCol = new Int32Array(0);
  let flashOk = false,
    lastFlash = -Infinity;
  let playing = true,
    visible = true,
    alive = true;

  function apply(next: NeonConfig) {
    cfg = next;
    rows = clamp(cfg.rows | 0, 5, 32);
    msgs = cfg.messages && cfg.messages.length ? cfg.messages : initial.messages;
    baseBmps = msgs.map((m) =>
      Array.isArray(m.art) && m.art.length ? buildArtBitmap(m, rows) : buildBitmap(parseMarkup(m.text || "", m.color || ACCENT_HEX), rows, cfg.weight, cfg.colorMode)
    );
    if (idx >= msgs.length) idx = 0;
    local = 0;
    onMessageStart();
    resize();
  }

  function buildDisplay() {
    const gap = Math.max(0, cfg.gap | 0);
    bmps = [];
    cyc = [];
    msgs.forEach((m, i) => {
      const b = baseBmps[i];
      if (!m.chain || !b.w) {
        bmps.push(b);
        cyc.push(false);
        return;
      }
      const between = b.bearR + b.bearL + gap;
      const period = b.w + between;
      if (EFFECT_KIND[effectOf(i)] === "scroll") {
        if (msgs.length === 1) {
          bmps.push(joinBitmaps([b], rows, gap, true));
          cyc.push(true);
          return;
        }
        const hold = Math.max(0.1, m.hold == null ? 2 : m.hold);
        const k = clamp(Math.ceil((hold * speedOf(m)) / period), 1, 400);
        bmps.push(joinBitmaps(new Array(k).fill(b), rows, gap, false));
        cyc.push(false);
        return;
      }
      const k = clamp(Math.floor((cols + between) / period), 1, 400);
      bmps.push(k === 1 ? b : joinBitmaps(new Array(k).fill(b), rows, gap, false));
      cyc.push(false);
    });
    anyDynamic = bmps.some((b) => b.dynamic);
  }

  function resize() {
    const avail = Math.max(80, screen.clientWidth - 20);
    cols = clamp(cfg.width > 0 ? cfg.width | 0 : Math.floor(avail / cfg.cell), 8, 512);
    buildDisplay();
    lum = new Float32Array(cols * rows);
    colBuf = new Int32Array(cols * rows);
    noise = new Float32Array(cols * rows);
    tint = new Int32Array(cols);
    tintSet = new Uint8Array(cols);
    flowCol = new Int32Array(cols);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random();

    const dpr = window.devicePixelRatio || 1;
    const w = cols * cfg.cell,
      h = rows * cfg.cell;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBackground();
    draw();
  }

  function dot(target: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    if (cfg.shape === "square") {
      target.fillRect(cx - r, cy - r, r * 2, r * 2);
      return;
    }
    target.beginPath();
    target.arc(cx, cy, r, 0, Math.PI * 2);
    target.fill();
  }

  function subLayout(): [number, number, number][] {
    if (cfg.colorMode === "duo" && cfg.subpixel)
      return [
        [0.33, 0.5, 0.21],
        [0.67, 0.5, 0.21],
      ];
    if (cfg.colorMode === "rgb" && cfg.subpixel)
      return [
        [0.26, 0.5, 0.15],
        [0.5, 0.5, 0.15],
        [0.74, 0.5, 0.15],
      ];
    return [[0.5, 0.5, 0.36]];
  }

  function buildBackground() {
    const dpr = window.devicePixelRatio || 1;
    const w = cols * cfg.cell,
      h = rows * cfg.cell;
    if (w <= 0 || h <= 0) {
      bg = null;
      return;
    }
    bg = document.createElement("canvas");
    bg.width = Math.round(w * dpr);
    bg.height = Math.round(h * dpr);
    const b = bg.getContext("2d")!;
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
    if (cfg.bezel) {
      b.strokeStyle = "rgba(255,255,255,0.10)";
      b.lineWidth = 1;
      const m = Math.max(4, cfg.moduleSize | 0);
      for (let x = m; x < cols; x += m) {
        b.beginPath();
        b.moveTo(x * cfg.cell, 0);
        b.lineTo(x * cfg.cell, h);
        b.stroke();
      }
      for (let y = m; y < rows; y += m) {
        b.beginPath();
        b.moveTo(0, y * cfg.cell);
        b.lineTo(w, y * cfg.cell);
        b.stroke();
      }
    }
  }

  function liveColor(bmp: Bitmap, ci: number, x: number): number {
    const p = bmp.charPaint[ci];
    if (!p || bmp.charEmoji[ci]) return -1;
    if (p.type === "flow") return p.colors.length ? flowGradient(p.colors, x, clock) : flowCol[x];
    if (p.type === "sparkle") return p.colors[Math.floor(clock / SPARKLE_STEP) % p.colors.length];
    return -1;
  }

  function blit(
    bmp: Bitmap | undefined,
    offX: number,
    offY: number,
    alpha: number,
    mask: ((gx: number, gy: number, sx: number) => boolean) | null,
    dyOf?: ((sx: number) => number) | null
  ) {
    if (!bmp || bmp.w === 0) return;
    for (let x = 0; x < cols; x++) {
      const sx = x - offX;
      if (sx < 0 || sx >= bmp.w) continue;
      const ci = bmp.dynamic ? bmp.charIdx[sx] : -1;
      const live = ci >= 0 ? liveColor(bmp, ci, x) : -1;
      tint[x] = live >= 0 ? live : bmp.colColors[sx];
      tintSet[x] = 1;
      if (ci >= 0 && blinkOff && bmp.charBlink[ci]) continue;
      const dy = dyOf ? dyOf(sx) : 0;
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

  function blitTape(bmp: Bitmap, x0: number, offY: number, dir: number, alpha: number, mask: ((gx: number, gy: number, sx: number) => boolean) | null) {
    const P = bmp.w;
    if (!P) return;
    let x = x0;
    if (dir > 0) {
      if (x + P <= 0) x += Math.floor(-x / P) * P;
      for (; x < cols; x += P) blit(bmp, x, offY, alpha, mask);
    } else {
      if (x >= cols) x -= Math.ceil((x - cols + 1) / P) * P;
      for (; x + P > 0; x -= P) blit(bmp, x, offY, alpha, mask);
    }
  }

  function invertFrame() {
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

  const speedOf = (m: NeonMessage) => Math.max(1, m.speed || cfg.speed);
  function effectOf(i: number): EffectName {
    const e = msgs[i].effect || "none";
    return EFFECT_KIND[e] ? e : "none";
  }
  const isLong = (i: number) => EFFECT_KIND[effectOf(i)] !== "scroll" && bmps[i].w > cols;
  const restX = (i: number) => (isLong(i) ? cols - bmps[i].w : Math.floor((cols - bmps[i].w) / 2));
  const transOf = (i: number) => (effectOf(i) === "slot" ? clamp(0.12 * bmps[i].charCount, Math.max(0.3, cfg.trans), 3) : Math.max(0, cfg.trans));
  function durationOf(i: number): number {
    if (cyc[i]) return Infinity;
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
      blinkOff = clock % BLINK_PERIOD >= BLINK_PERIOD / 2;
      const shift = clock * FLOW_SPEED;
      for (let x = 0; x < cols; x++) flowCol[x] = hslPack((((x * FLOW_STEP - shift) % 360) + 360) % 360, 1, 0.55);
    }
    const m = msgs[idx],
      bmp = bmps[idx];
    if (!bmp || bmp.w === 0) return;
    const e = effectOf(idx),
      kind = EFFECT_KIND[e];
    const long = isLong(idx);
    const tr = transOf(idx);
    const introEnd = tr + LONG_LEAD;
    const cx = long ? -Math.min(bmp.w - cols, Math.floor(Math.max(0, local - introEnd) * speedOf(m))) : restX(idx);
    const put = (x: number, y: number, a: number, mask: ((gx: number, gy: number, sx: number) => boolean) | null, dyOf?: ((sx: number) => number) | null) =>
      cyc[idx] ? blitTape(bmp, x, y, 1, a, mask) : blit(bmp, x, y, a, mask, dyOf);

    if (kind === "scroll") {
      const travel = Math.floor(local * speedOf(m));
      if (e === "scrollLeft") put(cols - travel, 0, 1, null);
      else if (cyc[idx]) blitTape(bmp, travel - bmp.w, 0, -1, 1, null);
      else blit(bmp, travel - bmp.w, 0, 1, null);
      return;
    }

    const p = tr <= 0 ? 1 : clamp(local / tr, 0, 1);

    if (e === "flash") {
      if (flashOk && local < FLASH_TIME) {
        lum.fill(1);
        colBuf.fill(hexToRgb(m.color));
        return;
      }
      put(cx, 0, 1, null);
      return;
    }

    if (e === "slot") {
      const n = Math.max(1, bmp.charCount);
      const dyOf =
        p >= 1
          ? null
          : (sx: number) => {
              const ci = Math.max(0, bmp.charIdx[sx]);
              return p * n < ci + 1 ? Math.floor(local * SLOT_SPIN + ci * 5) % bmp.rows : 0;
            };
      put(cx, 0, 1, null, dyOf);
      return;
    }

    if (kind === "push") {
      const dx = e === "pushLeft" ? 1 : e === "pushRight" ? -1 : 0;
      const dy = e === "pushUp" ? 1 : e === "pushDown" ? -1 : 0;
      if (p < 1 && msgs.length > 1) {
        const pi = (idx - 1 + msgs.length) % msgs.length;
        blit(bmps[pi], restX(pi) - Math.round(dx * p * cols), -Math.round(dy * p * rows), 1, null);
      }
      put(cx + Math.round(dx * (1 - p) * cols), Math.round(dy * (1 - p) * rows), 1, null);
      return;
    }

    if (e === "blink" && (!long || local < introEnd)) {
      const period = clamp(12 / speedOf(m), 0.08, 1);
      if (Math.floor(local / period) % 2 === 1) return;
      put(cx, 0, 1, null);
      return;
    }

    if (kind === "fade") {
      put(cx, 0, 0.08 + 0.92 * p, null);
      return;
    }

    let mask: ((gx: number, gy: number, sx: number) => boolean) | null = null;
    if (kind === "mask" && p < 1) {
      if (e === "wipe") mask = (gx) => gx <= p * cols;
      else if (e === "curtain") mask = (gx) => Math.abs(gx - (cols - 1) / 2) <= p * (cols / 2);
      else if (e === "dissolve") mask = (gx, gy) => noise[gy * cols + gx] <= p;
      else if (e === "typing") mask = (gx, gy, sx) => bmp.charIdx[sx] < Math.ceil(p * bmp.charCount);
    }
    put(cx, 0, 1, mask);
  }

  function onMessageStart() {
    flashOk = !!msgs[idx] && effectOf(idx) === "flash" && clock - lastFlash >= FLASH_MIN_GAP;
    if (flashOk) lastFlash = clock;
  }

  function draw() {
    if (!cols || !rows) return;
    compose();
    const inverted = !!(msgs[idx] && msgs[idx].invert);
    if (inverted) invertFrame();
    const w = cols * cfg.cell,
      h = rows * cfg.cell;
    ctx.clearRect(0, 0, w, h);
    if (bg) ctx.drawImage(bg, 0, 0, w, h);

    const layout = subLayout();
    const mono = cfg.colorMode === "mono";
    const monoRgb = hexToRgb(msgs[idx] && msgs[idx].color);
    const duoA = hexToRgb(cfg.duo[0]),
      duoB = hexToRgb(cfg.duo[1]);
    const buckets = new Map<string, number[]>();

    const put = (rgb: number, a: number, px: number, py: number, r: number) => {
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
        const px = x * cfg.cell,
          py = y * cfg.cell;
        const rgb = mono ? monoRgb : colBuf[i];

        if (cfg.colorMode === "duo") {
          const duo = toDuo(rgb, duoA, duoB);
          if (cfg.subpixel) {
            put(duoA, duo[0] * a, px + layout[0][0] * cfg.cell, py + layout[0][1] * cfg.cell, cfg.cell * layout[0][2]);
            put(duoB, duo[1] * a, px + layout[1][0] * cfg.cell, py + layout[1][1] * cfg.cell, cfg.cell * layout[1][2]);
          } else {
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

    ctx.shadowBlur = cfg.glow && !inverted ? cfg.cell * 0.8 : 0;
    for (const [key, pts] of buckets) {
      ctx.fillStyle = key;
      if (cfg.glow) ctx.shadowColor = key;
      for (let k = 0; k < pts.length; k += 3) dot(ctx, pts[k], pts[k + 1], pts[k + 2]);
    }
    ctx.shadowBlur = 0;
  }

  function advance(dt: number) {
    local += dt;
    clock += dt;
    if (msgs.length > 1 || EFFECT_KIND[effectOf(idx)] === "scroll" || isLong(idx)) {
      let guard = 0;
      while (local >= durationOf(idx) && guard++ < 16) {
        local -= durationOf(idx);
        idx = (idx + 1) % msgs.length;
        onMessageStart();
      }
    } else if (msgs.length === 1 && local >= durationOf(idx)) {
      // 문구 하나짜리 정적인 효과는 원래 멈춰 있지만, 내보낸 파일이 반복될 때 효과가 다시 나오도록 처음으로 돌린다
      if (!playing) {
        local -= durationOf(idx);
        onMessageStart();
      }
    }
  }

  function cycleDuration(): number {
    let total = 0;
    for (let i = 0; i < msgs.length; i++) {
      const d = durationOf(i);
      total += Number.isFinite(d) ? d : bmps[i].w / speedOf(msgs[i]);
    }
    return total;
  }

  function frame(t: number) {
    raf = null;
    if (!alive) return;
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.2) : 0;
    lastT = t;

    if (playing && visible) {
      advance(dt);
      if (t - lastDraw >= 24) {
        draw();
        lastDraw = t;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (!alive || raf) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(() => {
    if (alive) resize();
  });
  ro.observe(screen);
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          (es) => {
            visible = es.some((e) => e.isIntersecting);
            if (visible) wake();
          },
          { threshold: 0 }
        )
      : null;
  if (io) io.observe(screen);

  function stop() {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    ro.disconnect();
    if (io) io.disconnect();
  }

  apply(initial);
  raf = requestAnimationFrame(frame);

  return {
    setConfig(next: NeonConfig) {
      apply(next);
    },
    restart() {
      idx = 0;
      local = 0;
      onMessageStart();
      draw();
    },
    setPlaying(v: boolean) {
      playing = v;
      lastT = 0;
    },
    isPlaying: () => playing,
    stop,
    step(dt: number) {
      advance(dt);
      draw();
    },
    cycleDuration,
    getCanvas: () => canvas,
    getCssSize: () => ({ width: cols * cfg.cell, height: rows * cfg.cell }),
  };
}
