import { readdir } from "node:fs/promises";
import { join } from "node:path";

const IMAGE_RE = /\.(png|gif|jpe?g|webp)$/i;

async function list(folder: "tiles" | "backgrounds" | "characters"): Promise<string[]> {
  try {
    const names = await readdir(join(process.cwd(), "public", "game", folder));
    return names
      .filter((n) => IMAGE_RE.test(n))
      .sort((a, b) => a.localeCompare(b, "ko"))
      .map((n) => `/game/${folder}/${encodeURIComponent(n)}`);
  } catch {
    return [];
  }
}

// public/game 의 tiles, backgrounds, characters 폴더에 넣은 그림 목록. 편집기 팔레트에 띄우는 용도라 개발 모드에서만 연다
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "로컬 개발 모드에서만 됩니다" }, { status: 403 });
  }
  const [tiles, backgrounds, characters] = await Promise.all([list("tiles"), list("backgrounds"), list("characters")]);
  return Response.json({ tiles, backgrounds, characters });
}
