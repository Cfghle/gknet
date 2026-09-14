// 외부 라이브러리 없이 쓰는 GIF89a 인코더.
// 전광판 프레임은 어두운 배경 + LED 몇 색이라 전체 애니메이션에서 많이 쓰인 색 256개로 팔레트를 하나 만들어 공유한다.

const BUCKET_BITS = 5;
const BUCKETS = 1 << (BUCKET_BITS * 3);

const bucketOf = (r: number, g: number, b: number) =>
  ((r >> (8 - BUCKET_BITS)) << (BUCKET_BITS * 2)) | ((g >> (8 - BUCKET_BITS)) << BUCKET_BITS) | (b >> (8 - BUCKET_BITS));

export class PaletteBuilder {
  private counts = new Uint32Array(BUCKETS);

  add(rgba: Uint8ClampedArray) {
    for (let i = 0; i < rgba.length; i += 4) this.counts[bucketOf(rgba[i], rgba[i + 1], rgba[i + 2])]++;
  }

  build(): { palette: Uint8Array; lookup: Uint8Array } {
    const used: number[] = [];
    for (let k = 0; k < BUCKETS; k++) if (this.counts[k]) used.push(k);
    used.sort((a, b) => this.counts[b] - this.counts[a]);
    const chosen = used.slice(0, 256);
    if (!chosen.length) chosen.push(0);

    const half = 1 << (8 - BUCKET_BITS - 1);
    const channel = (k: number, shift: number) => (((k >> shift) & ((1 << BUCKET_BITS) - 1)) << (8 - BUCKET_BITS)) + half;
    const palette = new Uint8Array(768);
    const pr = new Int32Array(chosen.length),
      pg = new Int32Array(chosen.length),
      pb = new Int32Array(chosen.length);
    chosen.forEach((k, i) => {
      pr[i] = channel(k, BUCKET_BITS * 2);
      pg[i] = channel(k, BUCKET_BITS);
      pb[i] = channel(k, 0);
      palette[i * 3] = pr[i];
      palette[i * 3 + 1] = pg[i];
      palette[i * 3 + 2] = pb[i];
    });

    // 모든 칸을 가장 가까운 팔레트 색에 미리 연결해 둔다 (프레임마다 탐색하지 않게)
    const lookup = new Uint8Array(BUCKETS);
    for (let k = 0; k < BUCKETS; k++) {
      const r = channel(k, BUCKET_BITS * 2),
        g = channel(k, BUCKET_BITS),
        b = channel(k, 0);
      let best = 0,
        bestD = Infinity;
      for (let i = 0; i < chosen.length; i++) {
        const dr = r - pr[i],
          dg = g - pg[i],
          db = b - pb[i];
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      lookup[k] = best;
    }
    return { palette, lookup };
  }
}

export function quantizeFrame(rgba: Uint8ClampedArray, lookup: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) out[p] = lookup[bucketOf(rgba[i], rgba[i + 1], rgba[i + 2])];
  return out;
}

class ByteBuffer {
  private buf = new Uint8Array(1 << 16);
  length = 0;

  private ensure(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  byte(b: number) {
    this.ensure(1);
    this.buf[this.length++] = b & 255;
  }
  u16(v: number) {
    this.byte(v);
    this.byte(v >> 8);
  }
  bytes(arr: ArrayLike<number>) {
    this.ensure(arr.length);
    for (let i = 0; i < arr.length; i++) this.buf[this.length++] = arr[i];
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  take(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

function writeLzw(out: ByteBuffer, indices: Uint8Array) {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  out.byte(minCodeSize);

  const block = new Uint8Array(255);
  let blockLen = 0;
  let cur = 0,
    curShift = 0;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let table = new Map<number, number>();

  const pushByte = (b: number) => {
    block[blockLen++] = b;
    if (blockLen === 255) {
      out.byte(255);
      out.bytes(block);
      blockLen = 0;
    }
  };
  const emit = (code: number) => {
    cur |= code << curShift;
    curShift += codeSize;
    while (curShift >= 8) {
      pushByte(cur & 255);
      cur >>>= 8;
      curShift -= 8;
    }
  };

  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
      table = new Map();
    } else {
      if (nextCode >= 1 << codeSize) codeSize++;
      table.set(key, nextCode++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (curShift > 0) pushByte(cur & 255);
  if (blockLen) {
    out.byte(blockLen);
    out.bytes(block.subarray(0, blockLen));
  }
  out.byte(0);
}

export class GifWriter {
  private parts: Uint8Array[] = [];
  private pending: { indices: Uint8Array; delay: number } | null = null;

  constructor(private width: number, private height: number, palette: Uint8Array) {
    const head = new ByteBuffer();
    head.ascii("GIF89a");
    head.u16(width);
    head.u16(height);
    head.byte(0xf7); // 전역 팔레트 있음, 256색
    head.byte(0);
    head.byte(0);
    head.bytes(palette);
    // 무한 반복
    head.bytes([0x21, 0xff, 0x0b]);
    head.ascii("NETSCAPE2.0");
    head.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
    this.parts.push(head.take());
  }

  // 바로 앞 프레임과 똑같으면 따로 넣지 않고 앞 프레임의 표시 시간을 늘린다 (멈춰 있는 구간 용량 절약)
  addFrame(indices: Uint8Array, delayCs: number) {
    const p = this.pending;
    if (p && p.indices.length === indices.length && p.delay + delayCs < 65535) {
      let same = true;
      for (let i = 0; i < indices.length; i++) {
        if (p.indices[i] !== indices[i]) {
          same = false;
          break;
        }
      }
      if (same) {
        p.delay += delayCs;
        return;
      }
    }
    this.flush();
    this.pending = { indices, delay: delayCs };
  }

  private flush() {
    const p = this.pending;
    if (!p) return;
    const out = new ByteBuffer();
    out.bytes([0x21, 0xf9, 0x04, 0x00]);
    out.u16(p.delay);
    out.bytes([0x00, 0x00]);
    out.byte(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(this.width);
    out.u16(this.height);
    out.byte(0);
    writeLzw(out, p.indices);
    this.parts.push(out.take());
    this.pending = null;
  }

  finish(): Blob {
    this.flush();
    this.parts.push(new Uint8Array([0x3b]));
    return new Blob(this.parts as BlobPart[], { type: "image/gif" });
  }
}
