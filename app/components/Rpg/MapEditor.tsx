"use client";

import { useEffect, useRef, useState } from "react";
import Monitor from "../Monitor";
import GameCanvas from "./GameCanvas";
import { ImageBank, drawMockTile } from "./assets";
import { MAP_ID_RE } from "./fileFormat";
import { EMPTY_ASSETS, fetchAssets, loadProjectOrMock, saveProjectToFile, type GameAssets } from "./storage";
import {
  COLLISION_AUTO,
  COLLISION_BLOCK,
  COLLISION_PASS,
  DEFAULT_SPRITE,
  LAYERS,
  LAYER_LABELS,
  TILE,
  createMap,
  resizeMap,
  uid,
  walkPattern,
  type Facing,
  type GameMap,
  type GameProject,
  type LayerName,
  type MapEvent,
  type MockPattern,
  type PlayerSprite,
  type TileDef,
} from "./types";
import styles from "./Rpg.module.css";

type Tool = "paint" | "erase" | "collision" | "event" | "spawn";
const TOOLS: [Tool, string][] = [
  ["paint", "그리기"],
  ["erase", "지우개"],
  ["collision", "충돌"],
  ["event", "이벤트"],
  ["spawn", "시작 위치"],
];
const PATTERNS: MockPattern[] = ["flat", "grass", "sand", "water", "brick", "plank", "tree", "rock", "chest", "door"];
const fileName = (src: string) => decodeURIComponent(src.split("/").pop() ?? src);
const FACINGS: [Facing, string][] = [
  ["down", "아래"],
  ["left", "왼쪽"],
  ["right", "오른쪽"],
  ["up", "위"],
];

function NumField({ value, onChange, min = 0, width = 56 }: { value: number; onChange: (v: number) => void; min?: number; width?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      style={{ width }}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.max(min, Math.floor(v)));
      }}
    />
  );
}

// 맵 id = 파일 이름. 글자를 칠 때마다 바꾸면 참조가 계속 흔들려서, 다 적고 Enter나 "바꾸기"를 누를 때 반영한다
function MapIdField({ id, onRename }: { id: string; onRename: (next: string) => void }) {
  const [draft, setDraft] = useState(id);
  return (
    <>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onRename(draft);
        }}
      />
      <span style={{ fontSize: "0.7rem", color: "#8a8a8a" }}>.json</span>
      {draft !== id && (
        <button className={styles.btn} onClick={() => onRename(draft)}>
          바꾸기
        </button>
      )}
    </>
  );
}

// 스프라이트 시트를 네 방향으로 나란히 걷게 해서 설정이 맞는지 바로 볼 수 있게 한다
function SpritePreview({ sprite }: { sprite: PlayerSprite }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { src, frameW, frameH, frames, rows } = sprite;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const img = new Image();
    img.src = src;
    const cell = 64;
    const pattern = walkPattern(frames);
    const fw = frameW || TILE;
    const fh = frameH || TILE;
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!img.complete || !img.naturalWidth) return;
      ctx.imageSmoothingEnabled = false;
      const col = pattern[Math.floor((now - start) / 180) % pattern.length];
      const s = Math.min(cell / fw, cell / fh);
      FACINGS.forEach(([f], i) => {
        ctx.drawImage(img, col * fw, (rows[f] ?? 0) * fh, fw, fh, i * cell + (cell - fw * s) / 2, cell - fh * s, fw * s, fh * s);
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [src, frameW, frameH, frames, rows]);
  return (
    <canvas
      ref={ref}
      width={256}
      height={64}
      style={{ display: "block", marginTop: 6, background: "#06060a", borderRadius: 6, imageRendering: "pixelated" }}
    />
  );
}

function TilePreview({ tile }: { tile: TileDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, TILE, TILE);
    if (tile.src) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, TILE, TILE);
        ctx.drawImage(img, 0, 0, TILE, TILE);
      };
      img.src = tile.src;
    } else {
      drawMockTile(ctx, tile.pattern, tile.color);
    }
  }, [tile.src, tile.pattern, tile.color]);
  return <canvas ref={ref} width={TILE} height={TILE} className={styles.tilePreview} />;
}

// 그림 파일 고르기: 폴더에 넣은 파일 목록 + 목록에 없는 주소를 직접 적어 둔 경우
function ImageSelect({ value, files, onChange, emptyLabel }: { value?: string; files: string[]; onChange: (v?: string) => void; emptyLabel: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{emptyLabel}</option>
      {value && !files.includes(value) && <option value={value}>{fileName(value)} (폴더에 없음)</option>}
      {files.map((src) => (
        <option key={src} value={src}>
          {fileName(src)}
        </option>
      ))}
    </select>
  );
}

export default function MapEditor() {
  const [project, setProject] = useState<GameProject | null>(null);
  const [savedText, setSavedText] = useState("");
  const [assets, setAssets] = useState<GameAssets>(EMPTY_ASSETS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapId, setMapId] = useState("");
  const [tileId, setTileId] = useState("");
  const [tool, setTool] = useState<Tool>("paint");
  const [layer, setLayer] = useState<LayerName>("ground");
  const [collisionBrush, setCollisionBrush] = useState<number>(COLLISION_BLOCK);
  const [eventId, setEventId] = useState<string | null>(null);
  const [scale, setScale] = useState(32);
  const [showGrid, setShowGrid] = useState(true);
  const [showCollision, setShowCollision] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const stateRef = useRef({ project, mapId, layer, scale, showGrid, showCollision, eventId });

  const ready = project !== null;
  const dirty = project !== null && JSON.stringify(project) !== savedText;

  function applyLoaded(next: GameProject, message: string) {
    setProject(next);
    setSavedText(JSON.stringify(next));
    setMapId((prev) => (next.maps.some((m) => m.id === prev) ? prev : next.startMapId));
    setTileId((prev) => (next.tiles.some((t) => t.id === prev) ? prev : next.tiles[0]?.id ?? ""));
    setEventId(null);
    setStatus(message);
  }

  useEffect(() => {
    let alive = true;
    Promise.all([loadProjectOrMock(), fetchAssets().catch(() => EMPTY_ASSETS)])
      .then(([loaded, files]) => {
        if (!alive) return;
        setAssets(files);
        applyLoaded(
          loaded.project,
          loaded.source === "file" ? "맵 파일을 불러왔습니다" : "project.json이 없어서 샘플로 시작합니다. 저장하면 파일이 만들어집니다"
        );
      })
      .catch((e) => {
        // 샘플로 대신 시작하지 않는다 — 그 상태로 저장하면 실제 맵 파일을 덮어쓰게 되므로
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    stateRef.current = { project, mapId, layer, scale, showGrid, showCollision, eventId };
  }, [project, mapId, layer, scale, showGrid, showCollision, eventId]);

  // 저장 안 한 채로 창을 닫으려 하면 한 번 묻는다
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const map: GameMap | undefined = project?.maps.find((m) => m.id === mapId);
  const tile = project?.tiles.find((t) => t.id === tileId);
  const selectedEvent = map?.events.find((e) => e.id === eventId) ?? null;

  // ===== 편집 화면 그리기 =====
  // 캔버스는 불러오기가 끝난 뒤, 그리고 테스트 플레이에서 돌아올 때마다 새로 생기므로 그때마다 다시 붙는다
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bank = new ImageBank();
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current;
      const current = s.project?.maps.find((m) => m.id === s.mapId);
      if (!current) return;
      const px = s.scale;
      const dpr = window.devicePixelRatio || 1;
      const w = current.w * px;
      const h = current.h * px;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = current.background?.color ?? "#12121a";
      ctx.fillRect(0, 0, w, h);
      if (current.background?.src) {
        const bg = bank.image(current.background.src);
        if (bg) ctx.drawImage(bg, 0, 0, w, h);
      }

      const tiles = s.project?.tiles ?? [];
      const findTile = (id: string | null) => (id ? tiles.find((t) => t.id === id) : undefined);
      const drawLayer = (name: LayerName, alpha: number) => {
        ctx.globalAlpha = alpha;
        for (let y = 0; y < current.h; y++) {
          for (let x = 0; x < current.w; x++) {
            const def = findTile(current.layers[name][y * current.w + x]);
            if (!def) continue;
            const img = bank.tile(def);
            if (img) ctx.drawImage(img, x * px, y * px, px, px);
          }
        }
        ctx.globalAlpha = 1;
      };

      drawLayer("ground", s.layer === "overlay" ? 0.45 : 1);
      drawLayer("object", s.layer === "overlay" ? 0.45 : 1);
      for (const ev of current.events) {
        const def = findTile(ev.tileId ?? null);
        if (!def) continue;
        const img = bank.tile(def);
        if (img) ctx.drawImage(img, ev.x * px, ev.y * px, px, px);
      }
      drawLayer("overlay", s.layer === "overlay" ? 1 : 0.6);

      if (s.showCollision) {
        for (let y = 0; y < current.h; y++) {
          for (let x = 0; x < current.w; x++) {
            const i = y * current.w + x;
            const override = current.collision[i];
            let blocked = override === COLLISION_BLOCK;
            if (override === COLLISION_AUTO) {
              blocked =
                !!findTile(current.layers.ground[i])?.solid ||
                !!findTile(current.layers.object[i])?.solid ||
                !!current.events.find((e) => e.x === x && e.y === y)?.solid;
            }
            if (blocked) {
              ctx.fillStyle = "rgba(255,60,60,0.28)";
              ctx.fillRect(x * px, y * px, px, px);
            }
            if (override === COLLISION_PASS) {
              ctx.strokeStyle = "rgba(90,220,120,0.8)";
              ctx.lineWidth = 2;
              ctx.strokeRect(x * px + 3, y * px + 3, px - 6, px - 6);
            }
          }
        }
      }

      for (const ev of current.events) {
        ctx.strokeStyle = ev.kind === "warp" ? "#5ac8ff" : "#ffd24a";
        ctx.lineWidth = ev.id === s.eventId ? 4 : 2;
        ctx.strokeRect(ev.x * px + 2, ev.y * px + 2, px - 4, px - 4);
      }

      ctx.strokeStyle = "#ffa500";
      ctx.lineWidth = 3;
      ctx.strokeRect(current.spawn.x * px + 4, current.spawn.y * px + 4, px - 8, px - 8);
      ctx.fillStyle = "#ffa500";
      ctx.font = "11px system-ui";
      ctx.fillText("시작", current.spawn.x * px + 6, current.spawn.y * px + 16);

      if (s.showGrid) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= current.w; x++) {
          ctx.beginPath();
          ctx.moveTo(x * px + 0.5, 0);
          ctx.lineTo(x * px + 0.5, h);
          ctx.stroke();
        }
        for (let y = 0; y <= current.h; y++) {
          ctx.beginPath();
          ctx.moveTo(0, y * px + 0.5);
          ctx.lineTo(w, y * px + 0.5);
          ctx.stroke();
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      bank.dispose();
    };
  }, [ready, testing]);

  // ===== 맵 수정 =====
  function updateMap(fn: (m: GameMap) => GameMap) {
    setProject((prev) => (prev ? { ...prev, maps: prev.maps.map((m) => (m.id === mapId ? fn(m) : m)) } : prev));
  }

  function applyTool(cx: number, cy: number) {
    if (!map || cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return;
    const i = cy * map.w + cx;

    if (tool === "spawn") {
      updateMap((m) => ({ ...m, spawn: { x: cx, y: cy } }));
      return;
    }
    if (tool === "collision") {
      updateMap((m) => {
        const collision = m.collision.slice();
        collision[i] = collision[i] === collisionBrush ? COLLISION_AUTO : collisionBrush;
        return { ...m, collision };
      });
      return;
    }
    if (tool === "event") {
      const existing = map.events.find((e) => e.x === cx && e.y === cy);
      if (existing) {
        setEventId(existing.id);
        return;
      }
      const ev: MapEvent = { id: uid("ev"), x: cx, y: cy, kind: "message", trigger: "action", text: "새 이벤트", solid: true };
      updateMap((m) => ({ ...m, events: [...m.events, ev] }));
      setEventId(ev.id);
      return;
    }
    const value = tool === "erase" ? null : tileId || null;
    updateMap((m) => {
      if (m.layers[layer][i] === value) return m;
      const layers = { ...m.layers, [layer]: m.layers[layer].slice() };
      layers[layer][i] = value;
      return { ...m, layers };
    });
  }

  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left) / scale),
      y: Math.floor((e.clientY - rect.top) / scale),
    };
  }

  // ===== 타일 =====
  function updateTile(id: string, patch: Partial<TileDef>) {
    setProject((prev) => (prev ? { ...prev, tiles: prev.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : prev));
  }
  function addTile() {
    const t: TileDef = { id: uid("tile"), name: "새 타일", color: "#7a7a88", pattern: "flat" };
    setProject((prev) => (prev ? { ...prev, tiles: [...prev.tiles, t] } : prev));
    setTileId(t.id);
  }
  function removeTile(id: string) {
    if (!project || project.tiles.length <= 1) return;
    setProject({
      ...project,
      tiles: project.tiles.filter((t) => t.id !== id),
      maps: project.maps.map((m) => ({
        ...m,
        layers: {
          ground: m.layers.ground.map((v) => (v === id ? null : v)),
          object: m.layers.object.map((v) => (v === id ? null : v)),
          overlay: m.layers.overlay.map((v) => (v === id ? null : v)),
        },
        events: m.events.map((e) => (e.tileId === id ? { ...e, tileId: undefined } : e)),
      })),
    });
    setTileId(project.tiles.find((t) => t.id !== id)?.id ?? "");
  }

  // ===== 맵 목록 =====
  function addMap() {
    if (!project) return;
    let n = project.maps.length + 1;
    while (project.maps.some((m) => m.id === `map${n}`)) n++;
    const m = createMap(`맵 ${n}`, 16, 12, project.tiles[0]?.id ?? null, `map${n}`);
    setProject({ ...project, maps: [...project.maps, m] });
    setMapId(m.id);
  }
  function removeMap(id: string) {
    if (!project || project.maps.length <= 1) return;
    const maps = project.maps.filter((m) => m.id !== id);
    setProject({ ...project, maps, startMapId: project.startMapId === id ? maps[0].id : project.startMapId });
    setMapId(maps[0].id);
  }

  // 맵 id(= 파일 이름)를 바꾸면 시작 맵과 다른 맵의 이동 이벤트 목적지도 같이 바꾼다
  function renameMapId(oldId: string, raw: string) {
    if (!project) return;
    const newId = raw.trim();
    if (newId === oldId) return;
    if (!MAP_ID_RE.test(newId)) {
      setStatus("파일 이름은 영문·숫자·-·_ 만 쓸 수 있어요 (64자까지)");
      return;
    }
    if (project.maps.some((m) => m.id === newId)) {
      setStatus(`이미 ${newId}.json 을 쓰는 맵이 있습니다`);
      return;
    }
    setProject({
      ...project,
      startMapId: project.startMapId === oldId ? newId : project.startMapId,
      maps: project.maps.map((m) => ({
        ...(m.id === oldId ? { ...m, id: newId } : m),
        events: m.events.map((e) => (e.to?.mapId === oldId ? { ...e, to: { ...e.to, mapId: newId } } : e)),
      })),
    });
    setMapId(newId);
    setStatus(`파일 이름을 ${newId}.json 으로 바꿨습니다 (저장하면 예전 파일은 지워집니다)`);
  }

  // ===== 캐릭터 =====
  function setPlayer(player: PlayerSprite | undefined) {
    setProject((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (player) next.player = player;
      else delete next.player;
      return next;
    });
  }
  function updatePlayer(patch: Partial<PlayerSprite>) {
    setProject((prev) => (prev?.player ? { ...prev, player: { ...prev.player, ...patch } } : prev));
  }

  // ===== 이벤트 =====
  function updateEvent(id: string, patch: Partial<MapEvent>) {
    updateMap((m) => ({ ...m, events: m.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }
  function removeEvent(id: string) {
    updateMap((m) => ({ ...m, events: m.events.filter((e) => e.id !== id) }));
    setEventId(null);
  }

  // ===== 파일 =====
  async function handleSave() {
    if (!project || saving) return;
    setSaving(true);
    const result = await saveProjectToFile(project);
    setSaving(false);
    if (result.ok) {
      setSavedText(JSON.stringify(project));
      const wrote = result.written.length ? result.written.join(", ") : "바뀐 파일 없음";
      const removed = result.deleted.length ? ` · 지움: ${result.deleted.join(", ")}` : "";
      setStatus(`저장했습니다 — ${wrote}${removed}`);
    } else {
      setStatus(`저장 실패: ${result.error}`);
    }
  }
  async function handleReload() {
    if (dirty && !window.confirm("저장하지 않은 변경이 사라집니다. 파일에서 다시 불러올까요?")) return;
    try {
      const loaded = await loadProjectOrMock();
      applyLoaded(loaded.project, loaded.source === "file" ? "파일에서 다시 불러왔습니다" : "project.json이 없어서 샘플을 불러왔습니다");
    } catch (e) {
      setStatus("다시 불러오기 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  async function handleRefreshAssets() {
    const files = await fetchAssets().catch(() => EMPTY_ASSETS);
    setAssets(files);
    setStatus(`폴더를 다시 읽었습니다 — 타일 ${files.tiles.length}개, 배경 ${files.backgrounds.length}개, 캐릭터 ${files.characters.length}개`);
  }

  if (loadError) {
    return (
      <pre style={{ whiteSpace: "pre-wrap", background: "#2a1416", border: "1px solid #6b2b2b", borderRadius: 8, color: "#ffb4b4", padding: 12 }}>
        맵 파일을 읽지 못했습니다. 파일을 고친 뒤 새로고침하세요 (덮어쓰지 않도록 저장은 막아 두었습니다).{"\n\n"}
        {loadError}
      </pre>
    );
  }
  if (!project || !map) return <p style={{ color: "#8a8a8a" }}>맵 파일을 불러오는 중…</p>;
  const player = project.player;

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <div className={styles.bar}>
          <button className={`${styles.btn} ${testing ? styles.btnOn : ""}`} onClick={() => setTesting((v) => !v)}>
            {testing ? "■ 테스트 끝내기" : "▶ 테스트 플레이"}
          </button>
          <button className={`${styles.btn} ${dirty ? styles.btnOn : ""}`} disabled={saving} onClick={handleSave}>
            {saving ? "저장 중…" : "저장"}
          </button>
          <button className={styles.btn} onClick={handleReload}>
            파일 다시 읽기
          </button>
          <button className={styles.btn} onClick={handleRefreshAssets}>
            그림 폴더 다시 읽기
          </button>
          <span className={styles.status}>
            {dirty ? "● 저장 안 됨 · " : ""}
            {status}
          </span>
        </div>

        {testing ? (
          <Monitor>
            <GameCanvas project={project} />
          </Monitor>
        ) : (
          <div className={styles.columns}>
            <div className={styles.left}>
              <div className={styles.bar}>
                {TOOLS.map(([t, label]) => (
                  <button key={t} className={`${styles.btn} ${tool === t ? styles.btnOn : ""}`} onClick={() => setTool(t)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.bar}>
                {LAYERS.map((l) => (
                  <button key={l} className={`${styles.btn} ${layer === l ? styles.btnOn : ""}`} onClick={() => setLayer(l)}>
                    {LAYER_LABELS[l]}
                  </button>
                ))}
                {tool === "collision" && (
                  <>
                    <button
                      className={`${styles.btn} ${collisionBrush === COLLISION_BLOCK ? styles.btnOn : ""}`}
                      onClick={() => setCollisionBrush(COLLISION_BLOCK)}
                    >
                      막기
                    </button>
                    <button
                      className={`${styles.btn} ${collisionBrush === COLLISION_PASS ? styles.btnOn : ""}`}
                      onClick={() => setCollisionBrush(COLLISION_PASS)}
                    >
                      지나가기
                    </button>
                  </>
                )}
              </div>
              <div className={styles.bar}>
                <label className={styles.hint}>확대</label>
                <input type="range" min={16} max={64} step={4} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
                <span className={styles.hint}>{scale}px</span>
                <label className={styles.hint}>
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> 격자
                </label>
                <label className={styles.hint}>
                  <input type="checkbox" checked={showCollision} onChange={(e) => setShowCollision(e.target.checked)} /> 충돌 표시
                </label>
              </div>

              <div className={styles.mapArea}>
                <canvas
                  ref={canvasRef}
                  className={styles.mapCanvas}
                  onPointerDown={(e) => {
                    painting.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const { x, y } = cellFromEvent(e);
                    applyTool(x, y);
                  }}
                  onPointerMove={(e) => {
                    if (!painting.current) return;
                    if (tool === "event" || tool === "spawn") return; // 끌어서 여러 개 만들지 않게
                    const { x, y } = cellFromEvent(e);
                    applyTool(x, y);
                  }}
                  onPointerUp={() => (painting.current = false)}
                  onPointerLeave={() => (painting.current = false)}
                />
              </div>
              <p className={styles.hint}>
                칸을 클릭·드래그하면 고른 타일이 칠해집니다. 충돌은 빨강이 막힌 칸, 초록 테두리가 강제로 지나갈 수 있는 칸입니다. 노란 테두리는 말 걸기
                이벤트, 파란 테두리는 이동 이벤트입니다.
              </p>
            </div>

            <div className={styles.right}>
              <div className={styles.sec}>
                <h4>타일</h4>
                <div className={styles.palette}>
                  {project.tiles.map((t) => (
                    <button
                      key={t.id}
                      className={`${styles.tileButton} ${tileId === t.id ? styles.tileButtonOn : ""}`}
                      onClick={() => {
                        setTileId(t.id);
                        setTool("paint");
                      }}
                      title={t.solid ? `${t.name} (막힘)` : t.name}
                    >
                      <TilePreview tile={t} />
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className={styles.bar}>
                  <button className={styles.btn} onClick={addTile}>
                    + 타일 추가
                  </button>
                  {tile && (
                    <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => removeTile(tile.id)}>
                      선택 타일 삭제
                    </button>
                  )}
                </div>

                {tile && (
                  <>
                    <div className={styles.field}>
                      <label>이름</label>
                      <input type="text" value={tile.name} onChange={(e) => updateTile(tile.id, { name: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label>그림</label>
                      <ImageSelect value={tile.src} files={assets.tiles} emptyLabel="없음 (목업 그림)" onChange={(src) => updateTile(tile.id, { src })} />
                    </div>
                    {!tile.src && (
                      <div className={styles.field}>
                        <label>목업</label>
                        <input type="color" value={tile.color} onChange={(e) => updateTile(tile.id, { color: e.target.value })} />
                        <select value={tile.pattern} onChange={(e) => updateTile(tile.id, { pattern: e.target.value as MockPattern })}>
                          {PATTERNS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className={styles.field}>
                      <label>막힘</label>
                      <input type="checkbox" checked={!!tile.solid} onChange={(e) => updateTile(tile.id, { solid: e.target.checked })} />
                    </div>
                  </>
                )}
                <p className={styles.hint}>
                  그림은 <code>public/game/tiles</code>에 png·gif를 넣고 &quot;그림 폴더 다시 읽기&quot;를 누르면 목록에 뜹니다. 64×64로 그리면 딱 맞습니다.
                </p>
              </div>

              <div className={styles.sec}>
                <h4>캐릭터</h4>
                <div className={styles.field}>
                  <label>그림</label>
                  <ImageSelect
                    value={player?.src}
                    files={assets.characters}
                    emptyLabel="기본 캐릭터 (목업)"
                    onChange={(src) => setPlayer(src ? { ...DEFAULT_SPRITE, ...player, src } : undefined)}
                  />
                </div>
                {player && (
                  <>
                    <div className={styles.field}>
                      <label>한 칸</label>
                      <NumField min={1} value={player.frameW} onChange={(v) => updatePlayer({ frameW: v })} />
                      <span className={styles.hint}>×</span>
                      <NumField min={1} value={player.frameH} onChange={(v) => updatePlayer({ frameH: v })} />
                      <span className={styles.hint}>px</span>
                    </div>
                    <div className={styles.field}>
                      <label>걷기 칸</label>
                      <NumField min={1} value={player.frames} onChange={(v) => updatePlayer({ frames: v })} />
                      <span className={styles.hint}>칸 (3칸이면 가운데가 서 있는 모습)</span>
                    </div>
                    <div className={styles.field}>
                      <label>방향 줄</label>
                      {FACINGS.map(([f, label]) => (
                        <span key={f} className={styles.hint}>
                          {label} <NumField width={44} value={player.rows[f]} onChange={(v) => updatePlayer({ rows: { ...player.rows, [f]: v } })} />
                        </span>
                      ))}
                    </div>
                    <div className={styles.field}>
                      <label>발 위치</label>
                      <NumField min={-256} value={player.offsetY ?? 0} onChange={(v) => updatePlayer({ offsetY: v })} />
                      <span className={styles.hint}>px (+면 아래로)</span>
                    </div>
                    <SpritePreview sprite={player} />
                  </>
                )}
                <p className={styles.hint}>
                  <code>public/game/characters</code>에 스프라이트 시트를 넣고 &quot;그림 폴더 다시 읽기&quot;를 누르세요. 기본값은 쯔꾸르 방식(가로 3칸 × 세로
                  4줄: 아래·왼쪽·오른쪽·위)입니다. 한 칸이 64보다 크면 발을 칸 바닥에 맞추고 위로 삐져나오게 그립니다.
                </p>
              </div>

              <div className={styles.sec}>
                <h4>맵</h4>
                <div className={styles.field}>
                  <label>선택</label>
                  <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
                    {project.maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>이름</label>
                  <input type="text" value={map.name} onChange={(e) => updateMap((m) => ({ ...m, name: e.target.value }))} />
                </div>
                <div className={styles.field}>
                  <label>파일 이름</label>
                  <MapIdField key={map.id} id={map.id} onRename={(next) => renameMapId(map.id, next)} />
                </div>
                <div className={styles.field}>
                  <label>크기</label>
                  <input
                    type="number"
                    min={4}
                    max={80}
                    value={map.w}
                    onChange={(e) => updateMap((m) => resizeMap(m, Math.max(4, Math.min(80, Number(e.target.value) || m.w)), m.h))}
                  />
                  <span className={styles.hint}>×</span>
                  <input
                    type="number"
                    min={4}
                    max={80}
                    value={map.h}
                    onChange={(e) => updateMap((m) => resizeMap(m, m.w, Math.max(4, Math.min(80, Number(e.target.value) || m.h))))}
                  />
                  <span className={styles.hint}>칸</span>
                </div>
                <div className={styles.field}>
                  <label>배경</label>
                  <ImageSelect
                    value={map.background?.src}
                    files={assets.backgrounds}
                    emptyLabel="없음"
                    onChange={(src) => updateMap((m) => ({ ...m, background: { ...m.background, src } }))}
                  />
                </div>
                {map.background?.src && (
                  <div className={styles.field}>
                    <label>배치</label>
                    <select
                      value={map.background?.mode ?? "cover"}
                      onChange={(e) => updateMap((m) => ({ ...m, background: { ...m.background, mode: e.target.value as "cover" | "tile" } }))}
                    >
                      <option value="cover">맵 전체에 맞춤</option>
                      <option value="tile">반복</option>
                    </select>
                  </div>
                )}
                <div className={styles.field}>
                  <label>바탕색</label>
                  <input
                    type="color"
                    value={map.background?.color ?? "#12121a"}
                    onChange={(e) => updateMap((m) => ({ ...m, background: { ...m.background, color: e.target.value } }))}
                  />
                </div>
                <div className={styles.bar}>
                  <button className={styles.btn} onClick={addMap}>
                    + 맵 추가
                  </button>
                  <button
                    className={`${styles.btn} ${project.startMapId === map.id ? styles.btnOn : ""}`}
                    onClick={() => setProject({ ...project, startMapId: map.id })}
                  >
                    시작 맵으로
                  </button>
                  <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => removeMap(map.id)}>
                    맵 삭제
                  </button>
                </div>
                <p className={styles.hint}>
                  배경 그림은 <code>public/game/backgrounds</code>에 넣으면 목록에 뜹니다. &quot;맵 전체에 맞춤&quot;이면 맵 크기(가로 칸×64, 세로 칸×64)에 맞춰
                  늘어납니다.
                </p>
              </div>

              <div className={styles.sec}>
                <h4>이벤트</h4>
                {!selectedEvent && <p className={styles.hint}>이벤트 도구로 칸을 누르면 만들어지고, 이미 있는 칸을 누르면 여기서 고칠 수 있습니다.</p>}
                {selectedEvent && (
                  <>
                    <div className={styles.field}>
                      <label>종류</label>
                      <select value={selectedEvent.kind} onChange={(e) => updateEvent(selectedEvent.id, { kind: e.target.value as MapEvent["kind"] })}>
                        <option value="message">말 걸기</option>
                        <option value="warp">다른 맵으로 이동</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>발동</label>
                      <select value={selectedEvent.trigger} onChange={(e) => updateEvent(selectedEvent.id, { trigger: e.target.value as MapEvent["trigger"] })}>
                        <option value="action">스페이스로</option>
                        <option value="touch">밟으면</option>
                      </select>
                    </div>
                    {selectedEvent.kind === "message" ? (
                      <div className={styles.field}>
                        <label>대사</label>
                        <textarea value={selectedEvent.text ?? ""} onChange={(e) => updateEvent(selectedEvent.id, { text: e.target.value })} />
                      </div>
                    ) : (
                      <div className={styles.field}>
                        <label>목적지</label>
                        <select
                          value={selectedEvent.to?.mapId ?? ""}
                          onChange={(e) => updateEvent(selectedEvent.id, { to: { mapId: e.target.value, x: selectedEvent.to?.x ?? 0, y: selectedEvent.to?.y ?? 0 } })}
                        >
                          <option value="">고르기</option>
                          {project.maps.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={selectedEvent.to?.x ?? 0}
                          onChange={(e) =>
                            updateEvent(selectedEvent.id, { to: { mapId: selectedEvent.to?.mapId ?? "", x: Number(e.target.value), y: selectedEvent.to?.y ?? 0 } })
                          }
                        />
                        <input
                          type="number"
                          value={selectedEvent.to?.y ?? 0}
                          onChange={(e) =>
                            updateEvent(selectedEvent.id, { to: { mapId: selectedEvent.to?.mapId ?? "", x: selectedEvent.to?.x ?? 0, y: Number(e.target.value) } })
                          }
                        />
                      </div>
                    )}
                    <div className={styles.field}>
                      <label>그림</label>
                      <select value={selectedEvent.tileId ?? ""} onChange={(e) => updateEvent(selectedEvent.id, { tileId: e.target.value || undefined })}>
                        <option value="">없음</option>
                        {project.tiles.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>막힘</label>
                      <input type="checkbox" checked={!!selectedEvent.solid} onChange={(e) => updateEvent(selectedEvent.id, { solid: e.target.checked })} />
                      <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => removeEvent(selectedEvent.id)}>
                        이벤트 삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
