// 타일맵 미니게임 데이터 모델.
// 한 칸은 64×64, 화면은 Monitor 컴포넌트와 같은 710×540이다.
export const TILE = 64;
export const VIEW_W = 710;
export const VIEW_H = 540;

export type LayerName = "ground" | "object" | "overlay";
export const LAYERS: LayerName[] = ["ground", "object", "overlay"];
export const LAYER_LABELS: Record<LayerName, string> = {
  ground: "바닥",
  object: "오브젝트",
  overlay: "캐릭터 위",
};

// 이미지를 넣기 전까지 쓰는 목업 그림. 코드로 64×64를 그려서 에셋 파일 없이도 돌아간다
export type MockPattern = "flat" | "grass" | "sand" | "water" | "brick" | "plank" | "tree" | "rock" | "chest" | "door";

export interface TileDef {
  id: string;
  name: string;
  color: string;
  pattern: MockPattern;
  /** png·gif 주소 (없으면 위 pattern으로 그린다) */
  src?: string;
  /** 캐릭터가 지나갈 수 없는 칸 */
  solid?: boolean;
}

export type EventKind = "message" | "warp";
export type EventTrigger = "action" | "touch";

export interface MapEvent {
  id: string;
  x: number;
  y: number;
  kind: EventKind;
  /** 스페이스로 말 걸기(action) / 밟으면 바로(touch) */
  trigger: EventTrigger;
  /** 이벤트 칸에 같이 그릴 타일 */
  tileId?: string;
  solid?: boolean;
  text?: string;
  to?: { mapId: string; x: number; y: number };
}

export const COLLISION_AUTO = -1;
export const COLLISION_PASS = 0;
export const COLLISION_BLOCK = 1;

export interface GameMap {
  id: string;
  name: string;
  w: number;
  h: number;
  /** 칸마다 타일 id (빈 칸은 null) */
  layers: Record<LayerName, (string | null)[]>;
  /** -1 자동(타일 설정 따름) / 0 통과 / 1 막힘 */
  collision: number[];
  background?: { src?: string; color?: string; mode?: "cover" | "tile" };
  spawn: { x: number; y: number };
  events: MapEvent[];
}

export type Facing = "down" | "left" | "right" | "up";

// 캐릭터 스프라이트 시트. 가로로 걷기 프레임, 세로로 방향이 늘어선 한 장짜리 그림
export interface PlayerSprite {
  src: string;
  /** 한 프레임 크기 (64×64보다 크면 위쪽으로 삐져나오게 그린다) */
  frameW: number;
  frameH: number;
  /** 가로 걷기 프레임 수 */
  frames: number;
  /** 방향마다 몇 번째 줄(0부터)인지 */
  rows: Record<Facing, number>;
  /** 발 위치 보정(px). +면 아래로 */
  offsetY?: number;
}

// 쯔꾸르 방식: 가로 3칸 × 세로 4줄 (아래·왼쪽·오른쪽·위)
export const DEFAULT_SPRITE: Omit<PlayerSprite, "src"> = {
  frameW: 64,
  frameH: 64,
  frames: 3,
  rows: { down: 0, left: 1, right: 2, up: 3 },
  offsetY: 0,
};

// 걷기 프레임 순서. 3칸이면 가운데가 서 있는 모습이고 0-1-2-1 순서로 걷는다
export function walkPattern(frames: number): number[] {
  const n = Math.max(1, Math.floor(frames) || 1);
  return n === 3 ? [0, 1, 2, 1] : Array.from({ length: n }, (_, i) => i);
}
export function idleFrame(frames: number): number {
  return Math.floor(frames) === 3 ? 1 : 0;
}

export interface GameProject {
  name: string;
  tiles: TileDef[];
  maps: GameMap[];
  startMapId: string;
  /** 없으면 코드로 그린 기본 캐릭터 */
  player?: PlayerSprite;
}

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function emptyLayers(w: number, h: number, fill: string | null = null): Record<LayerName, (string | null)[]> {
  return {
    ground: new Array(w * h).fill(fill),
    object: new Array(w * h).fill(null),
    overlay: new Array(w * h).fill(null),
  };
}

export function createMap(name: string, w: number, h: number, groundId: string | null, id?: string): GameMap {
  return {
    id: id ?? uid("map"),
    name,
    w,
    h,
    layers: emptyLayers(w, h, groundId),
    collision: new Array(w * h).fill(COLLISION_AUTO),
    spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2) },
    events: [],
  };
}

export function resizeMap(map: GameMap, w: number, h: number): GameMap {
  const pick = <T,>(src: T[], fallback: T): T[] => {
    const out = new Array<T>(w * h).fill(fallback);
    for (let y = 0; y < Math.min(h, map.h); y++) {
      for (let x = 0; x < Math.min(w, map.w); x++) out[y * w + x] = src[y * map.w + x];
    }
    return out;
  };
  return {
    ...map,
    w,
    h,
    layers: {
      ground: pick(map.layers.ground, null),
      object: pick(map.layers.object, null),
      overlay: pick(map.layers.overlay, null),
    },
    collision: pick(map.collision, COLLISION_AUTO),
    spawn: { x: Math.min(map.spawn.x, w - 1), y: Math.min(map.spawn.y, h - 1) },
    events: map.events.filter((e) => e.x < w && e.y < h),
  };
}

// ===== 목업 프로젝트 =====
// 그림 파일 없이 바로 돌아가는 샘플. 타일 편집기에서 이미지를 넣어 바꾸면 된다
const MOCK_TILES: TileDef[] = [
  { id: "grass", name: "풀", color: "#4c9a3f", pattern: "grass" },
  { id: "path", name: "흙길", color: "#c8a06a", pattern: "sand" },
  { id: "floor", name: "나무 바닥", color: "#b07a48", pattern: "plank" },
  { id: "water", name: "물", color: "#2f6fb5", pattern: "water", solid: true },
  { id: "wall", name: "벽돌 벽", color: "#8d6a5b", pattern: "brick", solid: true },
  { id: "tree", name: "나무", color: "#2f6b34", pattern: "tree", solid: true },
  { id: "rock", name: "바위", color: "#8b8b93", pattern: "rock", solid: true },
  { id: "chest", name: "상자", color: "#c9973f", pattern: "chest", solid: true },
  { id: "door", name: "문", color: "#7b4b2a", pattern: "door" },
];

export function createMockProject(): GameProject {
  // id를 고정해 두어서 샘플을 파일로 뽑을 때마다 내용이 바뀌지 않게 한다
  const village = createMap("마을", 16, 12, "grass", "village");
  const idx = (x: number, y: number, w: number) => y * w + x;

  // 흙길 (가로 한 줄 + 집 앞으로 이어지는 세로)
  for (let x = 0; x < village.w; x++) village.layers.ground[idx(x, 7, village.w)] = "path";
  for (let y = 4; y <= 7; y++) village.layers.ground[idx(4, y, village.w)] = "path";

  // 연못
  for (let y = 2; y <= 4; y++) {
    for (let x = 10; x <= 13; x++) village.layers.ground[idx(x, y, village.w)] = "water";
  }

  // 가장자리 나무 울타리
  for (let x = 0; x < village.w; x++) {
    village.layers.object[idx(x, 0, village.w)] = "tree";
    village.layers.object[idx(x, village.h - 1, village.w)] = "tree";
  }
  for (let y = 1; y < village.h - 1; y++) {
    village.layers.object[idx(0, y, village.w)] = "tree";
    village.layers.object[idx(village.w - 1, y, village.w)] = "tree";
  }
  village.layers.object[idx(7, 5, village.w)] = "rock";
  village.layers.object[idx(8, 9, village.w)] = "rock";

  // 집 (벽 + 문)
  for (let x = 3; x <= 6; x++) village.layers.object[idx(x, 3, village.w)] = "wall";
  village.layers.object[idx(3, 4, village.w)] = "wall";
  village.layers.object[idx(6, 4, village.w)] = "wall";
  village.layers.object[idx(4, 4, village.w)] = "door";
  village.layers.object[idx(5, 4, village.w)] = "wall";
  // 나뭇잎이 캐릭터 위로 지나가는 예시
  village.layers.overlay[idx(12, 8, village.w)] = "tree";

  village.spawn = { x: 4, y: 8 };

  const house = createMap("집 안", 10, 8, "floor", "house");
  for (let x = 0; x < house.w; x++) {
    house.layers.object[idx(x, 0, house.w)] = "wall";
    house.layers.object[idx(x, house.h - 1, house.w)] = "wall";
  }
  for (let y = 1; y < house.h - 1; y++) {
    house.layers.object[idx(0, y, house.w)] = "wall";
    house.layers.object[idx(house.w - 1, y, house.w)] = "wall";
  }
  house.layers.object[idx(5, house.h - 1, house.w)] = "door";
  house.spawn = { x: 5, y: house.h - 2 };

  village.events = [
    {
      id: "village-chest",
      x: 6,
      y: 8,
      kind: "message",
      trigger: "action",
      tileId: "chest",
      solid: true,
      text: "상자를 열었다.\n안에는 먼지만 가득하다…",
    },
    {
      id: "village-door",
      x: 4,
      y: 4,
      kind: "warp",
      trigger: "touch",
      to: { mapId: house.id, x: 5, y: house.h - 2 },
    },
  ];
  house.events = [
    {
      id: "house-door",
      x: 5,
      y: house.h - 1,
      kind: "warp",
      trigger: "touch",
      to: { mapId: village.id, x: 4, y: 5 },
    },
    {
      id: "house-chest",
      x: 3,
      y: 3,
      kind: "message",
      trigger: "action",
      tileId: "chest",
      solid: true,
      text: "따뜻한 방이다.\n여기서 쉬면 기분이 좋아진다.",
    },
  ];

  return {
    name: "샘플 마을",
    tiles: MOCK_TILES,
    maps: [village, house],
    startMapId: village.id,
  };
}
