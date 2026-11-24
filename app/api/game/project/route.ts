import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAP_ID_RE, parseProject, serializeIndex, serializeMap } from "@/app/components/Rpg/fileFormat";

const MAX_BYTES = 5 * 1024 * 1024;
const MAP_FILE_RE = /^([A-Za-z0-9_-]{1,64})\.json$/;

// 내용이 같으면 쓰지 않는다 (안 바뀐 맵까지 수정 시간이 바뀌지 않게)
async function writeIfChanged(path: string, text: string): Promise<boolean> {
  try {
    if ((await readFile(path, "utf8")) === text) return false;
  } catch {
    // 파일이 없으면 새로 쓴다
  }
  await writeFile(path, text, "utf8");
  return true;
}

// 편집기의 "저장"이 public/game 아래 파일에 바로 쓴다.
//   project.json      타일 목록·시작 맵·맵 파일 목록
//   maps/<맵 id>.json  맵마다 하나 (목록에서 빠진 맵 파일은 지운다)
// 로컬 개발 모드(npm run dev)에서만 열어 둔다. 배포본에서는 막히고, 커밋된 파일을 읽기만 한다
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "편집기 저장은 로컬 개발 모드에서만 됩니다" }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return Response.json({ error: "파일이 너무 큽니다 (5MB 초과)" }, { status: 413 });
  }

  let project;
  try {
    project = parseProject(JSON.parse(raw));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "형식이 맞지 않습니다" }, { status: 400 });
  }

  // 맵 id가 파일 이름이 되므로 여기서 한 번 더 확인한다 (경로에 다른 글자가 끼어들지 못하게)
  const ids = project.maps.map((m) => m.id);
  const bad = ids.find((id) => !MAP_ID_RE.test(id));
  if (bad) return Response.json({ error: `맵 파일 이름으로 쓸 수 없는 id입니다: ${bad}` }, { status: 400 });
  if (new Set(ids).size !== ids.length) return Response.json({ error: "같은 파일 이름을 쓰는 맵이 있습니다" }, { status: 400 });

  const gameDir = join(process.cwd(), "public", "game");
  const mapsDir = join(gameDir, "maps");
  await mkdir(mapsDir, { recursive: true });

  const written: string[] = [];
  for (const map of project.maps) {
    if (await writeIfChanged(join(mapsDir, `${map.id}.json`), serializeMap(map))) written.push(`maps/${map.id}.json`);
  }
  if (await writeIfChanged(join(gameDir, "project.json"), serializeIndex(project))) written.push("project.json");

  const deleted: string[] = [];
  for (const name of await readdir(mapsDir)) {
    const m = MAP_FILE_RE.exec(name);
    if (m && !ids.includes(m[1])) {
      await unlink(join(mapsDir, name));
      deleted.push(`maps/${name}`);
    }
  }

  return Response.json({ ok: true, written, deleted });
}
