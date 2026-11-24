// 맵은 public/game 아래 파일이 원본이다 (project.json + maps/<맵 id>.json).
// 게임은 읽기만 하고, 편집기는 로컬 개발 모드에서 저장하면 파일에 바로 쓴다 (/api/game/project)
import { PROJECT_URL, assembleProject, mapUrl, parseIndex, parseMap } from "./fileFormat";
import { createMockProject, type GameProject } from "./types";

export const editorEnabled = process.env.NODE_ENV === "development";

export interface GameAssets {
  tiles: string[];
  backgrounds: string[];
  characters: string[];
}

export const EMPTY_ASSETS: GameAssets = { tiles: [], backgrounds: [], characters: [] };

class MissingFileError extends Error {
  constructor(public url: string) {
    super(`${url} 파일이 없습니다`);
  }
}

async function getJson(url: string): Promise<unknown> {
  // 저장 직후 바로 반영되게 캐시를 쓰지 않는다
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) throw new MissingFileError(url);
  if (!res.ok) throw new Error(`${url}을 읽지 못했습니다 (${res.status})`);
  return res.json();
}

export async function fetchProject(): Promise<GameProject> {
  const index = parseIndex(await getJson(PROJECT_URL));
  const maps =
    index.inlineMaps ??
    (await Promise.all(
      (index.mapIds ?? []).map(async (id) => {
        try {
          return parseMap(await getJson(mapUrl(id)));
        } catch (e) {
          throw new Error(`maps/${id}.json을 읽지 못했습니다 — ${e instanceof Error ? e.message : e}`);
        }
      })
    ));
  return assembleProject(index, maps);
}

// project.json이 아예 없을 때만 샘플로 시작한다.
// 파일이 있는데 읽다 실패한 경우는 오류를 그대로 올려서, 샘플로 바뀐 채 저장해 실제 맵을 덮어쓰는 일이 없게 한다
export async function loadProjectOrMock(): Promise<{ project: GameProject; source: "file" | "mock" }> {
  try {
    return { project: await fetchProject(), source: "file" };
  } catch (e) {
    if (e instanceof MissingFileError && e.url === PROJECT_URL) return { project: createMockProject(), source: "mock" };
    throw e;
  }
}

export async function saveProjectToFile(
  project: GameProject
): Promise<{ ok: true; written: string[]; deleted: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/game/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? `저장 실패 (${res.status})` };
    return { ok: true, written: data.written ?? [], deleted: data.deleted ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchAssets(): Promise<GameAssets> {
  const res = await fetch(`/api/game/assets?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return EMPTY_ASSETS;
  return { ...EMPTY_ASSETS, ...(await res.json()) };
}
