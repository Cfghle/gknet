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

export type ExportKind = "gif" | "video";

const BG = "#0b0b0d";
const PAD = 10;
const GIF_FRAME_CS = 7; // 프레임당 0.07초 (약 14fps)
const SCALE: Record<ExportKind, number> = { gif: 1, video: 2 };

// 이보다 크면 만들기 전에 경고한다. 카카오톡·인스타그램에 올릴 때 실패하거나 오래 걸리기 시작하는 크기로 잡았다
export const LARGE_FILE_BYTES = 20 * 1024 * 1024;

// 크기 예상치: 실제로 뽑아 본 결과에서 픽셀·초당 바이트를 잡았다 (GIF 860×140: 16초 1.74, 91초 2.04 / 영상 1720×280: 16초 0.26).
// 문구가 길수록 프레임마다 바뀌는 글자가 많아져 커지므로, 경고가 늦지 않게 여유를 두고 크게 잡는다. 정적인 문구는 이보다 훨씬 작게 나온다
const BYTES_PER_PIXEL_SECOND: Record<ExportKind, number> = { gif: 2.3, video: 0.32 };

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("내보내기를 취소했습니다", "AbortError");
}

export function exportDuration(target: ExportTarget) {
  const d = target.cycleDuration();
  return Number.isFinite(d) && d > 0 ? Math.max(0.5, d) : 3;
}

function outputSize(target: ExportTarget, scale: number) {
  const { width, height } = target.getCssSize();
  return {
    width: Math.ceil(((width + PAD * 2) * scale) / 2) * 2,
    height: Math.ceil(((height + PAD * 2) * scale) / 2) * 2,
  };
}

export function estimateExport(target: ExportTarget, kind: ExportKind): { seconds: number; bytes: number } {
  const seconds = exportDuration(target);
  const { width, height } = outputSize(target, SCALE[kind]);
  return { seconds, bytes: BYTES_PER_PIXEL_SECOND[kind] * width * height * seconds };
}

// 보드 캔버스는 배경이 투명이라 어두운 판을 깔고 그 위에 옮겨 그린다. 영상 코덱을 위해 크기는 짝수로 맞춘다
function makeComposite(target: ExportTarget, scale: number) {
  const src = target.getCanvas();
  if (!src) throw new Error("전광판이 아직 준비되지 않았습니다");
  const { width, height } = target.getCssSize();
  const size = outputSize(target, scale);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
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

export function exportGif(target: ExportTarget, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  return withPaused(target, async () => {
    const frameSec = GIF_FRAME_CS / 100;
    const count = Math.max(1, Math.round(exportDuration(target) / frameSec));
    const { canvas, g, paint } = makeComposite(target, SCALE.gif);
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
        throwIfAborted(signal);
        onProgress?.((i / count) * 0.3);
        await nextTick();
      }
    }
    const { palette, lookup } = builder.build();

    // 2회차: 고른 시점부터 한 바퀴를 다시 돌며 프레임을 인코딩한다 (프레임을 전부 들고 있지 않아서 길어도 메모리가 적게 든다)
    const writer = new GifWriter(canvas.width, canvas.height, palette);
    seek(target, pickStart(lit, frameSec));
    for (let i = 0; i < count; i++) {
      target.step(i === 0 ? 0 : frameSec);
      paint();
      writer.addFrame(quantizeFrame(grab(), lookup), GIF_FRAME_CS);
      if (i % 4 === 0) {
        throwIfAborted(signal);
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
export function exportVideo(
  target: ExportTarget,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; ext: string }> {
  const support = videoSupport();
  if (!support) return Promise.reject(new Error("이 브라우저는 영상 녹화를 지원하지 않습니다"));
  return withPaused(target, async () => {
    const duration = exportDuration(target);

    // 녹화 전에 빠르게 한 바퀴 돌려 글자가 보이는 시작 시점을 찾는다
    const probeSec = 0.1;
    const probe = makeComposite(target, 1);
    const lit: number[] = [];
    target.restart();
    for (let i = 0; i < Math.max(1, Math.round(duration / probeSec)); i++) {
      target.step(i === 0 ? 0 : probeSec);
      probe.paint();
      lit.push(litAmount(probe.g.getImageData(0, 0, probe.canvas.width, probe.canvas.height).data));
      if (i % 16 === 0) {
        throwIfAborted(signal);
        await nextTick();
      }
    }

    const { canvas, paint } = makeComposite(target, SCALE.video);
    seek(target, pickStart(lit, probeSec));
    paint();

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start(1000);

    try {
      await new Promise<void>((resolve, reject) => {
        let last = performance.now();
        let elapsed = 0;
        const timer = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(timer);
            reject(new DOMException("내보내기를 취소했습니다", "AbortError"));
            return;
          }
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
    } finally {
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
    }
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
