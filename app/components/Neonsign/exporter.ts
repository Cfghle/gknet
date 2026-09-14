// 전광판 내보내기(GIF/영상)와 공유. 서버 없이 전부 브라우저에서 처리한다.
import { GifWriter, PaletteBuilder, quantizeFrame } from "./gifEncoder";

export interface ExportTarget {
  restart(): void;
  setPlaying(v: boolean): void;
  isPlaying(): boolean;
  step(dt: number): void;
  cycleDuration(): number;
  getCanvas(): HTMLCanvasElement | null;
  getCssSize(): { width: number; height: number };
}

const BG = "#0b0b0d";
const PAD = 10;
const GIF_MAX_SECONDS = 20;
const VIDEO_MAX_SECONDS = 30;
const GIF_FRAME_CS = 7; // 프레임당 0.07초 (약 14fps)

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

function exportDuration(target: ExportTarget, max: number) {
  const d = target.cycleDuration();
  return Number.isFinite(d) && d > 0 ? Math.min(max, Math.max(0.5, d)) : 3;
}

// 보드 캔버스는 배경이 투명이라 어두운 판을 깔고 그 위에 옮겨 그린다. 영상 코덱을 위해 크기는 짝수로 맞춘다
function makeComposite(target: ExportTarget, scale: number) {
  const src = target.getCanvas();
  if (!src) throw new Error("전광판이 아직 준비되지 않았습니다");
  const { width, height } = target.getCssSize();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(((width + PAD * 2) * scale) / 2) * 2;
  canvas.height = Math.ceil(((height + PAD * 2) * scale) / 2) * 2;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  const paint = () => {
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, PAD * scale, PAD * scale, width * scale, height * scale);
  };
  return { canvas, g, paint };
}

// 처음부터 dt씩 나눠 시간을 진행해서 원하는 시점으로 옮긴다 (한 번에 크게 넘기면 문구 전환이 건너뛰어질 수 있다)
function seek(target: ExportTarget, seconds: number, chunk = 0.05) {
  target.restart();
  target.step(0);
  for (let t = 0; t < seconds; ) {
    const dt = Math.min(chunk, seconds - t);
    target.step(dt);
    t += dt;
  }
}

const litAmount = (rgba: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) > 120) n++;
  return n;
};

// 흐르는 문구는 화면 밖에서 시작해서 첫 프레임이 비어 있다. 메신저·SNS는 첫 프레임을 미리보기로 쓰니
// 글자가 충분히 보이는 첫 시점부터 담는다. 한 바퀴를 그대로 담으므로 반복 재생은 이어진다
function pickStart(lit: number[], frameSec: number) {
  const max = Math.max(0, ...lit);
  if (!max) return 0;
  return Math.max(0, lit.findIndex((v) => v >= max * 0.5)) * frameSec;
}

async function withPaused<T>(target: ExportTarget, run: () => Promise<T>): Promise<T> {
  const wasPlaying = target.isPlaying();
  target.setPlaying(false);
  try {
    return await run();
  } finally {
    target.restart();
    target.setPlaying(wasPlaying);
  }
}

export function exportGif(target: ExportTarget, onProgress?: (p: number) => void): Promise<Blob> {
  return withPaused(target, async () => {
    const frameSec = GIF_FRAME_CS / 100;
    const count = Math.max(1, Math.round(exportDuration(target, GIF_MAX_SECONDS) / frameSec));
    const { canvas, g, paint } = makeComposite(target, 1);
    const grab = () => g.getImageData(0, 0, canvas.width, canvas.height).data;

    // 1회차: 쓰인 색을 모아 팔레트를 만들고, 프레임마다 켜진 양을 재서 시작 시점을 고른다
    const builder = new PaletteBuilder();
    const lit: number[] = [];
    target.restart();
    for (let i = 0; i < count; i++) {
      target.step(i === 0 ? 0 : frameSec);
      paint();
      const data = grab();
      builder.add(data);
      lit.push(litAmount(data));
      if (i % 8 === 0) {
        onProgress?.((i / count) * 0.3);
        await nextTick();
      }
    }
    const { palette, lookup } = builder.build();

    // 2회차: 고른 시점부터 한 바퀴를 다시 돌며 프레임을 인코딩한다 (프레임을 전부 들고 있지 않아서 메모리가 적게 든다)
    const writer = new GifWriter(canvas.width, canvas.height, palette);
    seek(target, pickStart(lit, frameSec));
    for (let i = 0; i < count; i++) {
      target.step(i === 0 ? 0 : frameSec);
      paint();
      writer.addFrame(quantizeFrame(grab(), lookup), GIF_FRAME_CS);
      if (i % 4 === 0) {
        onProgress?.(0.3 + (i / count) * 0.7);
        await nextTick();
      }
    }
    onProgress?.(1);
    return writer.finish();
  });
}

const VIDEO_TYPES: [string, string][] = [
  ["video/mp4;codecs=avc1", "mp4"],
  ["video/mp4", "mp4"],
  ["video/webm;codecs=vp9", "webm"],
  ["video/webm", "webm"],
];

export function videoSupport(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  const found = VIDEO_TYPES.find(([mime]) => MediaRecorder.isTypeSupported(mime));
  return found ? { mime: found[0], ext: found[1] } : null;
}

// 영상은 MediaRecorder가 실제 시간으로 기록하므로 한 바퀴 도는 시간만큼 걸린다.
// 화면 밖으로 스크롤해도 멈추지 않게 보드의 자체 재생 대신 타이머로 직접 시간을 진행한다
export function exportVideo(target: ExportTarget, onProgress?: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const support = videoSupport();
  if (!support) return Promise.reject(new Error("이 브라우저는 영상 녹화를 지원하지 않습니다"));
  return withPaused(target, async () => {
    const duration = exportDuration(target, VIDEO_MAX_SECONDS);

    // 녹화 전에 빠르게 한 바퀴 돌려 글자가 보이는 시작 시점을 찾는다
    const probeSec = 0.1;
    const probe = makeComposite(target, 1);
    const lit: number[] = [];
    target.restart();
    for (let i = 0; i < Math.max(1, Math.round(duration / probeSec)); i++) {
      target.step(i === 0 ? 0 : probeSec);
      probe.paint();
      lit.push(litAmount(probe.g.getImageData(0, 0, probe.canvas.width, probe.canvas.height).data));
      if (i % 16 === 0) await nextTick();
    }

    const { canvas, paint } = makeComposite(target, 2);
    seek(target, pickStart(lit, probeSec));
    paint();

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();

    await new Promise<void>((resolve) => {
      let last = performance.now();
      let elapsed = 0;
      const timer = setInterval(() => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        elapsed += dt;
        target.step(dt);
        paint();
        onProgress?.(Math.min(1, elapsed / duration));
        if (elapsed >= duration) {
          clearInterval(timer);
          resolve();
        }
      }, 1000 / 30);
    });

    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    return { blob: new Blob(chunks, { type: support.mime.split(";")[0] }), ext: support.ext };
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// 모바일에서는 공유 시트(카카오톡, 인스타그램 등)로 보내고, 파일 공유가 안 되는 브라우저면 내려받기로 대신한다
export async function shareFile(blob: Blob, filename: string, text: string): Promise<"shared" | "cancelled" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "기끽이넷 전광판", text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export function exportFilename(ext: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `전광판-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

// ===== 링크에 설정 담기 =====
// 설정 JSON을 UTF-8 → base64url로 바꿔 주소의 #c= 뒤에 붙인다. 서버에 저장하지 않으니 링크 자체가 설정이다
export function encodeConfig(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(encoded: string): unknown {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export function configFromHash(hash: string): unknown | undefined {
  const c = new URLSearchParams(hash.replace(/^#/, "")).get("c");
  if (!c) return undefined;
  try {
    return decodeConfig(c);
  } catch {
    return undefined;
  }
}
