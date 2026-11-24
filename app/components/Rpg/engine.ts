// 타일맵 미니게임 엔진. 한 칸씩 움직이는 쯔꾸르식 이동 + 스페이스 조사.
import { ImageBank } from "./assets";
import {
  COLLISION_BLOCK,
  COLLISION_PASS,
  LAYERS,
  TILE,
  VIEW_H,
  VIEW_W,
  idleFrame,
  walkPattern,
  type GameMap,
  type GameProject,
  type MapEvent,
  type PlayerSprite,
  type TileDef,
} from "./types";

export type Dir = "up" | "down" | "left" | "right";

const DIR_VEC: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

// 한글 자판에서도 그대로 먹히도록 문자(key)가 아니라 자판 위치(code)로 본다
const KEY_DIR: Record<string, Dir> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};
const ACTION_KEYS = new Set(["Space", "Enter", "KeyZ"]);
const MOVE_MS = 150; // 한 칸 이동 시간
const SPRITE_FRAME_MS = 90; // 걷기 프레임 하나가 보이는 시간 (두 칸 걸을 때 한 바퀴쯤)

// 다이얼로그는 프로젝트의 .messagebox CSS를 그대로 옮긴 모양
const DIALOG_FONT = '20px "gal", "Galmuri11", "Malgun Gothic", monospace';
const DIALOG_PADDING = 5; // padding: 5px
const DIALOG_MARGIN = 10; // margin: 10px
const DIALOG_BORDER = 2; // border: 2px solid black
const DIALOG_OUTLINE = 2; // outline: 2px solid white
const DIALOG_LINE_H = 26;
const DIALOG_MAX_LINES = 4;

export interface GameController {
  setProject(project: GameProject): void;
  restart(): void;
  destroy(): void;
}

export function createGame(canvas: HTMLCanvasElement, initial: GameProject): GameController {
  const ctx = canvas.getContext("2d")!;
  const bank = new ImageBank();

  let project = initial;
  let map: GameMap = findMap(project.startMapId) ?? project.maps[0];
  let px = map.spawn.x;
  let py = map.spawn.y;
  let fromX = px;
  let fromY = py;
  let moveT = 1;
  let dir: Dir = "down";
  let message: string | null = null;
  let textLayer: { key: string; canvas: HTMLCanvasElement } | null = null;
  let focused = false;
  let raf: number | null = null;
  let last = 0;
  let clock = 0;
  let walkTime = 0; // 이어서 걷고 있는 시간 (멈추면 0 → 서 있는 프레임)
  const held = new Set<string>();
  const pressed = new Set<string>(); // 이번 프레임에 새로 눌린 키

  function findMap(id: string | undefined): GameMap | undefined {
    return project.maps.find((m) => m.id === id);
  }
  function tileOf(id: string | null | undefined): TileDef | undefined {
    return id ? project.tiles.find((t) => t.id === id) : undefined;
  }

  function eventAt(x: number, y: number): MapEvent | undefined {
    return map.events.find((e) => e.x === x && e.y === y);
  }

  function blocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
    const i = y * map.w + x;
    const override = map.collision[i];
    if (override === COLLISION_BLOCK) return true;
    if (override === COLLISION_PASS) return false;
    const ev = eventAt(x, y);
    if (ev?.solid) return true;
    // 자동: 바닥·오브젝트 타일의 설정을 따른다 (캐릭터 위 레이어는 통과)
    for (const layer of ["ground", "object"] as const) {
      if (tileOf(map.layers[layer][i])?.solid) return true;
    }
    return false;
  }

  function warp(to: { mapId: string; x: number; y: number }) {
    const next = findMap(to.mapId);
    if (!next) return;
    map = next;
    px = fromX = Math.max(0, Math.min(next.w - 1, to.x));
    py = fromY = Math.max(0, Math.min(next.h - 1, to.y));
    moveT = 1;
  }

  function runEvent(ev: MapEvent | undefined) {
    if (!ev) return;
    if (ev.kind === "message") message = ev.text ?? "";
    else if (ev.kind === "warp" && ev.to) warp(ev.to);
  }

  function step(dt: number) {
    clock += dt;
    if (moveT < 1) walkTime += dt;

    if (message !== null) {
      walkTime = 0;
      if ([...pressed].some((k) => ACTION_KEYS.has(k))) message = null;
      return;
    }

    if (moveT < 1) {
      moveT = Math.min(1, moveT + dt / MOVE_MS);
      if (moveT >= 1) {
        fromX = px;
        fromY = py;
        const ev = eventAt(px, py);
        if (ev?.trigger === "touch") runEvent(ev);
      }
      return;
    }

    if ([...pressed].some((k) => ACTION_KEYS.has(k))) {
      const [dx, dy] = DIR_VEC[dir];
      const ev = eventAt(px + dx, py + dy);
      if (ev && ev.trigger === "action") {
        runEvent(ev);
        return;
      }
    }

    // 여러 방향키를 같이 눌렀으면 마지막으로 누른 쪽
    let nextDir: Dir | null = null;
    for (const code of held) {
      const d = KEY_DIR[code];
      if (d) nextDir = d;
    }
    if (!nextDir) {
      walkTime = 0;
      return;
    }
    dir = nextDir;
    const [dx, dy] = DIR_VEC[dir];
    if (blocked(px + dx, py + dy)) {
      walkTime = 0; // 막힌 쪽으로 누르면 방향만 바꾸고 서 있는다
      return;
    }
    fromX = px;
    fromY = py;
    px += dx;
    py += dy;
    moveT = 0;
  }

  function playerPixel() {
    const t = moveT >= 1 ? 1 : moveT;
    const ease = t * t * (3 - 2 * t);
    return {
      x: (fromX + (px - fromX) * ease) * TILE,
      y: (fromY + (py - fromY) * ease) * TILE,
    };
  }

  function camera() {
    const p = playerPixel();
    const mapW = map.w * TILE;
    const mapH = map.h * TILE;
    const cx = mapW <= VIEW_W ? (mapW - VIEW_W) / 2 : Math.max(0, Math.min(mapW - VIEW_W, p.x + TILE / 2 - VIEW_W / 2));
    const cy = mapH <= VIEW_H ? (mapH - VIEW_H) / 2 : Math.max(0, Math.min(mapH - VIEW_H, p.y + TILE / 2 - VIEW_H / 2));
    return { x: Math.round(cx), y: Math.round(cy) };
  }

  function drawTileAt(id: string | null | undefined, x: number, y: number, cam: { x: number; y: number }) {
    const tile = tileOf(id);
    if (!tile) return;
    const img = bank.tile(tile);
    if (img) ctx.drawImage(img, x * TILE - cam.x, y * TILE - cam.y, TILE, TILE);
  }

  function drawBackground(cam: { x: number; y: number }) {
    ctx.fillStyle = map.background?.color ?? "#12121a";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const src = map.background?.src;
    if (!src) return;
    const img = bank.image(src);
    if (!img) return;
    const mapW = map.w * TILE;
    const mapH = map.h * TILE;
    if (map.background?.mode === "tile") {
      const w = img.naturalWidth || TILE;
      const h = img.naturalHeight || TILE;
      for (let y = Math.floor(cam.y / h) * h; y < cam.y + VIEW_H; y += h) {
        for (let x = Math.floor(cam.x / w) * w; x < cam.x + VIEW_W; x += w) {
          ctx.drawImage(img, x - cam.x, y - cam.y, w, h);
        }
      }
      return;
    }
    ctx.drawImage(img, -cam.x, -cam.y, mapW, mapH); // 맵 전체에 맞춰 늘린다
  }

  // 스프라이트 시트에서 지금 방향·걷기 프레임을 잘라, 발이 칸 바닥에 닿도록 그린다 (64보다 크면 위로 삐져나온다)
  function drawSprite(sheet: HTMLImageElement, sprite: PlayerSprite, cam: { x: number; y: number }) {
    const p = playerPixel();
    const fw = sprite.frameW || TILE;
    const fh = sprite.frameH || TILE;
    const pattern = walkPattern(sprite.frames);
    const col = walkTime > 0 ? pattern[Math.floor(walkTime / SPRITE_FRAME_MS) % pattern.length] : idleFrame(sprite.frames);
    const row = sprite.rows?.[dir] ?? 0;
    const footX = p.x - cam.x + TILE / 2;
    const footY = p.y - cam.y + TILE;

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(footX, footY - 8, Math.min(20, fw / 3), 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false; // 도트 그림이 뭉개지지 않게
    ctx.drawImage(sheet, col * fw, row * fh, fw, fh, Math.round(footX - fw / 2), Math.round(footY - fh + (sprite.offsetY ?? 0)), fw, fh);
    ctx.imageSmoothingEnabled = smooth;
  }

  function drawPlayer(cam: { x: number; y: number }) {
    const sprite = project.player;
    const sheet = sprite?.src ? bank.image(sprite.src) : null;
    if (sprite && sheet) {
      drawSprite(sheet, sprite, cam);
      return;
    }
    // 스프라이트가 없거나 아직 못 받았으면 코드로 그린 기본 캐릭터
    const p = playerPixel();
    const x = p.x - cam.x + TILE / 2;
    const y = p.y - cam.y + TILE / 2;
    const walking = moveT < 1;
    const bob = walking ? Math.sin(clock / 60) * 2 : 0;

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 22, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 몸
    ctx.fillStyle = "#3b6fd4";
    ctx.fillRect(x - 12, y - 6 + bob, 24, 24);
    // 머리
    ctx.fillStyle = "#ffd9b3";
    ctx.beginPath();
    ctx.arc(x, y - 14 + bob, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3421";
    ctx.beginPath();
    ctx.arc(x, y - 17 + bob, 13, Math.PI, Math.PI * 2);
    ctx.fill();

    // 바라보는 방향 표시 (눈)
    ctx.fillStyle = "#26201a";
    const eye = (ox: number) => {
      ctx.beginPath();
      ctx.arc(x + ox, y - 11 + bob, 2, 0, Math.PI * 2);
      ctx.fill();
    };
    if (dir === "down") {
      eye(-5);
      eye(5);
    } else if (dir === "left") eye(-6);
    else if (dir === "right") eye(6);
  }

  function wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const ch of paragraph) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      lines.push(line);
    }
    return lines;
  }

  // -webkit-font-smoothing: none 처럼 보이도록, 글자를 그린 뒤 반투명한 가장자리를 잘라 계단을 그대로 남긴다
  function makeTextLayer(lines: string[], w: number, h: number): HTMLCanvasElement {
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, w);
    layer.height = Math.max(1, h);
    const g = layer.getContext("2d", { willReadFrequently: true })!;
    g.font = DIALOG_FONT;
    g.textBaseline = "top";
    g.fillStyle = "#000000";
    lines.forEach((line, i) => g.fillText(line, 0, i * DIALOG_LINE_H));
    const data = g.getImageData(0, 0, layer.width, layer.height);
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i] >= 128 ? 255 : 0;
    g.putImageData(data, 0, 0);
    return layer;
  }

  function drawDialog() {
    if (message === null) return;
    ctx.font = DIALOG_FONT;
    ctx.textBaseline = "top";

    const edge = DIALOG_MARGIN + DIALOG_OUTLINE + DIALOG_BORDER;
    let lines = wrapText(message, VIEW_W - (edge + DIALOG_PADDING) * 2);
    if (lines.length > DIALOG_MAX_LINES) lines = [...lines.slice(0, DIALOG_MAX_LINES - 1), lines[DIALOG_MAX_LINES - 1] + "…"];

    // inline-block 처럼 글자 길이만큼만 넓어진다
    const textW = Math.ceil(Math.max(1, ...lines.map((l) => ctx.measureText(l).width)));
    const textH = lines.length * DIALOG_LINE_H;
    const boxW = textW + DIALOG_PADDING * 2;
    const boxH = textH + DIALOG_PADDING * 2;
    const x = edge;
    const y = VIEW_H - edge - boxH;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.lineWidth = DIALOG_BORDER;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(x - DIALOG_BORDER / 2, y - DIALOG_BORDER / 2, boxW + DIALOG_BORDER, boxH + DIALOG_BORDER);
    ctx.lineWidth = DIALOG_OUTLINE;
    ctx.strokeStyle = "#ffffff";
    const o = DIALOG_BORDER + DIALOG_OUTLINE / 2;
    ctx.strokeRect(x - o, y - o, boxW + o * 2, boxH + o * 2);

    const key = lines.join("\n");
    if (!textLayer || textLayer.key !== key) textLayer = { key, canvas: makeTextLayer(lines, textW + 2, textH + 6) };
    ctx.drawImage(textLayer.canvas, x + DIALOG_PADDING, y + DIALOG_PADDING);

    // 다음으로 넘기라는 표시 (글자를 가리지 않게 상자 오른쪽 바깥에)
    if (Math.floor(clock / 400) % 2 === 0) {
      const tx = x + boxW + 8;
      const ty = y + boxH - 12;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 12, ty);
      ctx.lineTo(tx + 6, ty + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFocusHint() {
    if (focused) return;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = "#ffffff";
    ctx.font = '18px "Malgun Gothic", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("화면을 클릭한 뒤 WASD · 방향키로 이동, 스페이스로 조사", VIEW_W / 2, VIEW_H / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function draw() {
    const cam = camera();
    drawBackground(cam);

    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(map.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
    const y1 = Math.min(map.h - 1, Math.floor((cam.y + VIEW_H) / TILE));

    for (const layer of ["ground", "object"] as const) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) drawTileAt(map.layers[layer][y * map.w + x], x, y, cam);
      }
    }
    for (const ev of map.events) {
      if (ev.tileId && ev.x >= x0 && ev.x <= x1 && ev.y >= y0 && ev.y <= y1) drawTileAt(ev.tileId, ev.x, ev.y, cam);
    }

    drawPlayer(cam);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) drawTileAt(map.layers.overlay[y * map.w + x], x, y, cam);
    }

    drawDialog();
    drawFocusHint();

    // 지금 상태를 DOM에 적어 둔다 (디버그·테스트에서 캐릭터 위치를 확인할 때 쓴다)
    const pos = `${px},${py}`;
    if (canvas.dataset.pos !== pos) canvas.dataset.pos = pos;
    const dialog = message === null ? "0" : "1";
    if (canvas.dataset.dialog !== dialog) canvas.dataset.dialog = dialog;
    if (canvas.dataset.map !== map.id) canvas.dataset.map = map.id;
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) : 0;
    last = now;
    step(dt);
    pressed.clear();
    draw();
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!KEY_DIR[e.code] && !ACTION_KEYS.has(e.code)) return;
    e.preventDefault(); // 스페이스·방향키로 페이지가 스크롤되지 않게
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  const onFocus = () => {
    focused = true;
  };
  const onBlur = () => {
    focused = false;
    held.clear();
  };
  const onPointerDown = () => canvas.focus();

  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  // 웹폰트(gal)는 늦게 준비될 수 있어서, 다 받아지면 대사 그림을 다시 만든다
  document.fonts
    ?.load('20px "gal"')
    .then(() => {
      textLayer = null;
    })
    .catch(() => {});
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("focus", onFocus);
  canvas.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  raf = requestAnimationFrame(frame);

  return {
    setProject(next: GameProject) {
      project = next;
      const same = findMap(map.id);
      if (!same) {
        map = findMap(project.startMapId) ?? project.maps[0];
        px = fromX = map.spawn.x;
        py = fromY = map.spawn.y;
        moveT = 1;
      } else {
        map = same;
      }
    },
    restart() {
      map = findMap(project.startMapId) ?? project.maps[0];
      px = fromX = map.spawn.x;
      py = fromY = map.spawn.y;
      moveT = 1;
      message = null;
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("focus", onFocus);
      canvas.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      bank.dispose();
    },
  };
}

export { LAYERS };
