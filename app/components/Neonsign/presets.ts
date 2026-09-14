// 프리셋 저장소. 옵시디언 버전은 볼트의 마크다운 표에 저장했지만,
// 웹 버전은 백엔드가 없어서 브라우저 localStorage에 저장한다 (이 브라우저에서만 보임).
import type { NeonConfig } from "./types";

const STORAGE_KEY = "neonsign-presets";

export interface Preset {
  name: string;
  cfg: Partial<NeonConfig>;
}

function readAll(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: Preset[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function loadPresets(): Promise<Preset[]> {
  return readAll();
}

export async function loadPresetByName(name: string): Promise<Preset | undefined> {
  return readAll().find((p) => p.name === name);
}

export async function savePreset(name: string, cfg: Partial<NeonConfig>): Promise<void> {
  const next = readAll().filter((p) => p.name !== name).concat([{ name, cfg }]);
  writeAll(next);
}

export async function deletePreset(name: string): Promise<void> {
  writeAll(readAll().filter((p) => p.name !== name));
}
