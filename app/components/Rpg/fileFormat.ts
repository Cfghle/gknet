// public/game 아래 파일 형식.
//   project.json      타일 목록, 시작 맵, 맵 파일 목록(맵 id)
//   maps/<맵 id>.json  맵 하나. 열어봐도 모양이 보이도록 칸 배열(레이어·충돌)을 한 줄에 한 행씩 쓴다
// 메모리에서는 GameProject 하나로 합쳐 쓰고, 칸 배열은 1차원이다
import { COLLISION_AUTO, DEFAULT_SPRITE, LAYERS, type GameMap, type GameProject, type LayerName, type PlayerSprite, type TileDef } from "./types";

export const PROJECT_URL = "/game/project.json";
export const mapUrl = (id: string) => `/game/maps/${id}.json`;

// 맵 id가 그대로 파일 이름이 되므로 영문·숫자·-·_ 만 허용한다
export const MAP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface ProjectIndex {
  name: string;
  tiles: TileDef[];
  player?: PlayerSprite;
  startMapId: string;
  maps: string[];
}

// 손으로 고친 값이 이상해도(음수·글자 등) 기본값으로 맞춘다
function normalizePlayer(value: unknown): PlayerSprite | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Partial<PlayerSprite>;
  if (typeof s.src !== "string" || !s.src) return undefined;
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : fallback);
  const d = DEFAULT_SPRITE;
  return {
    src: s.src,
    frameW: Math.max(1, num(s.frameW, d.frameW)),
    frameH: Math.max(1, num(s.frameH, d.frameH)),
    frames: Math.max(1, num(s.frames, d.frames)),
    rows: {
      down: num(s.rows?.down, d.rows.down),
      left: num(s.rows?.left, d.rows.left),
      right: num(s.rows?.right, d.rows.right),
      up: num(s.rows?.up, d.rows.up),
    },
    offsetY: Math.round(Number(s.offsetY) || 0),
  };
}

function chunk<T>(arr: T[], w: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += w) out.push(arr.slice(i, i + w));
  return out;
}

export function serializeMap(map: GameMap): string {
  const rows = new Map<string, string>();
  let n = 0;
  const mark = (row: unknown[]) => {
    const key = `@@ROW${n++}@@`;
    rows.set(key, JSON.stringify(row));
    return key;
  };
  const data = {
    ...map,
    layers: Object.fromEntries(LAYERS.map((l) => [l, chunk(map.layers[l], map.w).map(mark)])),
    collision: chunk(map.collision, map.w).map(mark),
  };
  // 행 자리표시를 한 줄짜리 배열로 바꿔 끼운다 ($ 같은 특수문자가 섞여도 안전하게 함수로 치환)
  return JSON.stringify(data, null, 2).replace(/"@@ROW\d+@@"/g, (s) => rows.get(s.slice(1, -1)) ?? s) + "\n";
}

export function serializeIndex(project: GameProject): string {
  const index: ProjectIndex = {
    name: project.name,
    tiles: project.tiles,
    ...(project.player ? { player: project.player } : {}),
    startMapId: project.startMapId,
    maps: project.maps.map((m) => m.id),
  };
  return JSON.stringify(index, null, 2) + "\n";
}

function flatten<T>(value: unknown, size: number, fill: T): T[] {
  const list: T[] = Array.isArray(value) ? (Array.isArray(value[0]) ? (value as T[][]).flat() : (value as T[])) : [];
  const out = list.slice(0, size);
  while (out.length < size) out.push(fill);
  return out;
}

// 맵 하나를 메모리 형식으로. 손으로 고친 파일이라도 칸 수가 모자라거나 넘치면 맞춰 준다
export function parseMap(input: unknown): GameMap {
  if (!input || typeof input !== "object") throw new Error("맵 형식이 맞지 않습니다");
  const m = input as GameMap;
  if (typeof m.id !== "string" || !m.id) throw new Error("맵에 id가 없습니다");
  const w = Math.max(1, Math.floor(Number(m.w) || 1));
  const h = Math.max(1, Math.floor(Number(m.h) || 1));
  const size = w * h;
  const layers = Object.fromEntries(LAYERS.map((l) => [l, flatten<string | null>(m.layers?.[l], size, null)])) as Record<
    LayerName,
    (string | null)[]
  >;
  return {
    ...m,
    name: m.name || m.id,
    w,
    h,
    layers,
    collision: flatten<number>(m.collision, size, COLLISION_AUTO),
    events: Array.isArray(m.events) ? m.events : [],
    spawn: m.spawn ?? { x: 0, y: 0 },
  };
}

// project.json 읽기. 새 형식은 maps가 맵 파일 이름(id) 목록이고, 예전 형식은 맵이 통째로 들어 있다
export function parseIndex(input: unknown): {
  name: string;
  tiles: TileDef[];
  player?: PlayerSprite;
  startMapId: string;
  mapIds: string[] | null;
  inlineMaps: GameMap[] | null;
} {
  if (!input || typeof input !== "object") throw new Error("project.json 형식이 맞지 않습니다");
  const p = input as { name?: string; tiles?: TileDef[]; player?: unknown; startMapId?: string; maps?: unknown[] };
  if (!Array.isArray(p.tiles)) throw new Error("project.json에 tiles가 없습니다");
  if (!Array.isArray(p.maps) || !p.maps.length) throw new Error("project.json에 maps가 없습니다");
  const byName = p.maps.every((m) => typeof m === "string");
  if (byName) {
    const bad = (p.maps as string[]).find((id) => !MAP_ID_RE.test(id));
    if (bad) throw new Error(`맵 파일 이름으로 쓸 수 없는 id입니다: ${bad}`);
  }
  return {
    name: p.name || "게임",
    tiles: p.tiles,
    player: normalizePlayer(p.player),
    startMapId: p.startMapId ?? "",
    mapIds: byName ? (p.maps as string[]) : null,
    inlineMaps: byName ? null : p.maps.map(parseMap),
  };
}

export function assembleProject(
  index: { name: string; tiles: TileDef[]; player?: PlayerSprite; startMapId: string },
  maps: GameMap[]
): GameProject {
  if (!maps.length) throw new Error("맵이 하나도 없습니다");
  return {
    name: index.name,
    tiles: index.tiles,
    ...(index.player ? { player: index.player } : {}),
    maps,
    startMapId: maps.some((m) => m.id === index.startMapId) ? index.startMapId : maps[0].id,
  };
}

// 맵까지 통째로 들어 있는 프로젝트(편집기가 저장할 때 보내는 값, 예전 형식 project.json)
export function parseProject(input: unknown): GameProject {
  const index = parseIndex(input);
  if (!index.inlineMaps) throw new Error("맵 내용이 들어 있지 않습니다");
  return assembleProject(index, index.inlineMaps);
}
