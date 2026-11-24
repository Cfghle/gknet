// 타일 그림. 이미지(src)가 있으면 그걸 쓰고, 없으면 코드로 그린 목업 그림을 쓴다.
import { TILE, type MockPattern, type TileDef } from "./types";

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
function shade(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c[0] + c[0] + c[1] + c[1] + c[2] + c[2] : c;
  const n = parseInt(/^[0-9a-fA-F]{6}$/.test(full) ? full : "888888", 16);
  const r = clamp255(((n >> 16) & 255) + amount);
  const g = clamp255(((n >> 8) & 255) + amount);
  const b = clamp255((n & 255) + amount);
  return `rgb(${r},${g},${b})`;
}

// 칸마다 같은 모양이 나오도록 위치 기반의 고정된 난수를 쓴다
function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function drawMockTile(ctx: CanvasRenderingContext2D, pattern: MockPattern, color: string, size = TILE) {
  const s = size;
  const fillBase = () => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
  };

  switch (pattern) {
    case "grass": {
      fillBase();
      for (let i = 0; i < 26; i++) {
        const x = rand(i + 1) * s;
        const y = rand(i + 50) * s;
        ctx.strokeStyle = shade(color, rand(i + 90) > 0.5 ? 26 : -26);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2, y - 6);
        ctx.stroke();
      }
      break;
    }
    case "sand": {
      fillBase();
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = shade(color, rand(i + 7) > 0.5 ? 18 : -18);
        ctx.fillRect(rand(i + 3) * s, rand(i + 31) * s, 3, 3);
      }
      break;
    }
    case "water": {
      fillBase();
      ctx.strokeStyle = shade(color, 40);
      ctx.lineWidth = 3;
      for (let y = 8; y < s; y += 16) {
        ctx.beginPath();
        ctx.moveTo(4, y);
        ctx.quadraticCurveTo(s / 4, y - 6, s / 2, y);
        ctx.quadraticCurveTo((s * 3) / 4, y + 6, s - 4, y);
        ctx.stroke();
      }
      break;
    }
    case "brick": {
      fillBase();
      ctx.fillStyle = shade(color, -34);
      for (let row = 0; row < 4; row++) {
        const y = row * 16;
        ctx.fillRect(0, y + 14, s, 2);
        const offset = row % 2 ? 0 : 16;
        for (let x = offset; x < s + 16; x += 32) ctx.fillRect(x, y, 2, 16);
      }
      break;
    }
    case "plank": {
      fillBase();
      ctx.fillStyle = shade(color, -30);
      for (let x = 16; x < s; x += 16) ctx.fillRect(x - 1, 0, 2, s);
      ctx.fillStyle = shade(color, 16);
      for (let i = 0; i < 8; i++) ctx.fillRect(rand(i + 11) * s, rand(i + 21) * s, 6, 2);
      break;
    }
    case "tree": {
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(s / 2 - 6, s - 22, 12, 20);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2 - 4, s / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(color, 28);
      ctx.beginPath();
      ctx.arc(s / 2 - 8, s / 2 - 12, 10, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rock": {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(8, s - 8);
      ctx.lineTo(18, 18);
      ctx.lineTo(s - 16, 14);
      ctx.lineTo(s - 6, s - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(color, 30);
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(s - 20, 16);
      ctx.lineTo(s - 24, 30);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "chest": {
      ctx.fillStyle = color;
      ctx.fillRect(8, 20, s - 16, s - 28);
      ctx.fillStyle = shade(color, -40);
      ctx.fillRect(8, 20, s - 16, 10);
      ctx.fillRect(s / 2 - 4, 30, 8, 12);
      ctx.fillStyle = "#f5d76e";
      ctx.fillRect(s / 2 - 3, 33, 6, 7);
      break;
    }
    case "door": {
      ctx.fillStyle = shade(color, -45);
      ctx.fillRect(10, 8, s - 20, s - 8);
      ctx.fillStyle = color;
      ctx.fillRect(14, 12, s - 28, s - 12);
      ctx.fillStyle = "#f5d76e";
      ctx.beginPath();
      ctx.arc(s - 22, s / 2 + 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      fillBase();
      ctx.strokeStyle = shade(color, -28);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
    }
  }
}

export function makeMockTileCanvas(tile: TileDef, size = TILE): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  drawMockTile(ctx, tile.pattern, tile.color, size);
  return canvas;
}

// gif가 움직이려면 <img>가 문서 안에 있어야 해서, 화면에 안 보이는 칸에 붙여 둔다
function hiddenHost(): HTMLElement {
  const id = "rpg-image-host";
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    document.body.appendChild(host);
  }
  return host;
}

export class ImageBank {
  private images = new Map<string, HTMLImageElement>();
  private mocks = new Map<string, HTMLCanvasElement>();
  private version = 0;

  /** 이미지가 새로 로드되면 올라가는 값. 화면을 다시 그릴지 판단할 때 쓴다 */
  get revision() {
    return this.version;
  }

  image(src: string): HTMLImageElement | null {
    let img = this.images.get(src);
    if (!img) {
      img = document.createElement("img");
      img.decoding = "async";
      img.alt = "";
      img.style.cssText = "width:1px;height:1px";
      img.addEventListener("load", () => {
        this.version++;
      });
      img.src = src;
      hiddenHost().appendChild(img);
      this.images.set(src, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  tile(tile: TileDef): CanvasImageSource | null {
    if (tile.src) {
      const img = this.image(tile.src);
      if (img) return img;
      // 이미지를 아직 못 받았으면 목업 그림으로 대신 보여준다
    }
    const key = `${tile.id}:${tile.pattern}:${tile.color}`;
    let mock = this.mocks.get(key);
    if (!mock) {
      mock = makeMockTileCanvas(tile);
      this.mocks.set(key, mock);
    }
    return mock;
  }

  dispose() {
    for (const img of this.images.values()) img.remove();
    this.images.clear();
    this.mocks.clear();
  }
}
