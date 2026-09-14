export type EffectName =
  | "none"
  | "blink"
  | "scrollLeft"
  | "scrollRight"
  | "pushUp"
  | "pushDown"
  | "pushLeft"
  | "pushRight"
  | "fade"
  | "wipe"
  | "curtain"
  | "dissolve"
  | "typing"
  | "slot"
  | "flash";

export type ColorMode = "mono" | "duo" | "rgb";
export type DotShape = "circle" | "square";

export interface NeonMessage {
  text?: string;
  color?: string;
  effect?: EffectName;
  hold?: number;
  speed?: number;
  chain?: boolean;
  invert?: boolean;
  art?: string[];
  palette?: Record<string, string>;
}

export interface NeonConfig {
  messages: NeonMessage[];
  rows: number;
  weight: number;
  cell: number;
  width: number;
  shape: DotShape;
  colorMode: ColorMode;
  duo: [string, string];
  levels: number;
  subpixel: boolean;
  glow: boolean;
  brightness: number;
  bezel: boolean;
  moduleSize: number;
  speed: number;
  gap: number;
  trans: number;
}

export const EFFECT_KIND: Record<EffectName, "instant" | "scroll" | "push" | "fade" | "mask" | "slot" | "flash"> = {
  none: "instant",
  blink: "instant",
  scrollLeft: "scroll",
  scrollRight: "scroll",
  pushUp: "push",
  pushDown: "push",
  pushLeft: "push",
  pushRight: "push",
  fade: "fade",
  wipe: "mask",
  curtain: "mask",
  dissolve: "mask",
  typing: "mask",
  slot: "slot",
  flash: "flash",
};

export const EFFECT_LABELS: [EffectName, string][] = [
  ["none", "즉시"],
  ["scrollLeft", "좌로 흐름"],
  ["scrollRight", "우로 흐름"],
  ["pushUp", "위로 밀기"],
  ["pushDown", "아래로 밀기"],
  ["pushLeft", "좌로 밀기"],
  ["pushRight", "우로 밀기"],
  ["fade", "페이드"],
  ["wipe", "와이프"],
  ["curtain", "커튼"],
  ["dissolve", "디졸브"],
  ["typing", "타이핑"],
  ["blink", "점멸"],
  ["slot", "슬롯머신"],
  ["flash", "플래시"],
];

// 색을 따로 안 정했을 때 쓰는 기본 강조색 (기끽이넷 헤더의 오렌지 톤)
export const ACCENT_HEX = "#ffa500";
export const ACCENT_COMP_HEX = "#3ba7ff";

export const SWATCHES = [ACCENT_HEX, "#ff2d2d", "#ffb000", "#37e04a", "#3ba7ff", "#ff4fd8", "#f2f2f2"];

export const ART_SAMPLE = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];

export const DEFAULTS: NeonConfig = {
  messages: [{ text: "안녕하세요 ★ 기끽이넷 전광판입니다 ★", color: ACCENT_HEX, effect: "scrollLeft", hold: 1.2 }],
  rows: 15,
  weight: 2,
  cell: 8,
  width: 0,
  shape: "circle",
  colorMode: "mono",
  duo: [ACCENT_HEX, ACCENT_COMP_HEX],
  levels: 4,
  subpixel: true,
  glow: true,
  brightness: 1,
  bezel: false,
  moduleSize: 16,
  speed: 18,
  gap: 0,
  trans: 0.45,
};

export function normalizeMessage(m: unknown): NeonMessage {
  const base: NeonMessage = { text: "", color: ACCENT_HEX, effect: "none", hold: 2 };
  if (typeof m === "string") return Object.assign(base, { text: m });
  return Object.assign(base, (m as NeonMessage) || {});
}

export function cloneConfig(cfg: NeonConfig): NeonConfig {
  return JSON.parse(JSON.stringify(cfg));
}

export function mergeConfig(base: NeonConfig, patch: Partial<NeonConfig>): NeonConfig {
  const out: NeonConfig = Object.assign({}, base, patch) as NeonConfig;
  const messages = Array.isArray(patch.messages) && patch.messages.length ? patch.messages : base.messages;
  out.messages = messages.map(normalizeMessage);
  out.duo = (Array.isArray(patch.duo) ? patch.duo : base.duo).slice(0, 2) as [string, string];
  const anyOut = out as NeonConfig & { invert?: boolean };
  if (anyOut.invert) {
    out.messages.forEach((m) => {
      if (m.invert == null) m.invert = true;
    });
  }
  delete anyOut.invert;
  return out;
}

// 붙여넣기·링크로 들어온 설정은 손으로 고친 것일 수 있어서, 타입이 틀린 항목(숫자 자리에 글자 등)은 기본값으로 되돌린다
export function sanitizeConfig(cfg: NeonConfig): NeonConfig {
  const fixed = { ...cfg } as unknown as Record<string, unknown>;
  const defaults = cloneConfig(DEFAULTS) as unknown as Record<string, unknown>;
  for (const k of Object.keys(defaults)) {
    if (k === "messages") continue;
    const d = defaults[k];
    const wrong = Array.isArray(d) ? !Array.isArray(fixed[k]) : typeof fixed[k] !== typeof d;
    if (wrong) fixed[k] = d;
  }
  return fixed as unknown as NeonConfig;
}

// 임베드용: 기본값과 다른 항목만 남겨서 설정을 짧게 뽑는다
export function minimalConfig(cfg: NeonConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {
    messages: cfg.messages.map((m) => {
      const t: NeonMessage = { text: m.text };
      if (m.color !== ACCENT_HEX) t.color = m.color;
      if (m.effect && m.effect !== "none") t.effect = m.effect;
      if (m.hold !== 2) t.hold = m.hold;
      if (m.speed) t.speed = m.speed;
      if (m.invert) t.invert = true;
      if (m.chain) t.chain = true;
      if (Array.isArray(m.art)) t.art = m.art;
      if (m.palette) t.palette = m.palette;
      return t;
    }),
  };
  (Object.keys(DEFAULTS) as (keyof NeonConfig)[]).forEach((k) => {
    if (k === "messages") return;
    if (JSON.stringify(cfg[k]) !== JSON.stringify(DEFAULTS[k])) out[k] = cfg[k];
  });
  return out;
}

export async function resolveConfig(
  input: unknown,
  loadPresetByName: (name: string) => Promise<{ name: string; cfg: Partial<NeonConfig> } | undefined>
): Promise<NeonConfig> {
  const base = cloneConfig(DEFAULTS);
  if (input == null) return mergeConfig(base, {});
  if (typeof input === "string") {
    if (input.startsWith("프리셋:")) {
      const name = input.slice(4).trim();
      const found = await loadPresetByName(name);
      if (found) return mergeConfig(base, found.cfg);
      return mergeConfig(base, {
        messages: [{ text: `프리셋 '${name}' 없음`, color: "#ffb000", effect: "blink", hold: 3 }],
      });
    }
    return mergeConfig(base, { messages: [{ text: input, effect: "scrollLeft", hold: 1.2 }] });
  }
  if (Array.isArray(input)) return mergeConfig(base, { messages: input });
  return mergeConfig(base, input as Partial<NeonConfig>);
}
