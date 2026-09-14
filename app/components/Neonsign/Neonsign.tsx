"use client";

import { useEffect, useState } from "react";
import NeonBoard from "./NeonBoard";
import { cloneConfig, DEFAULTS, mergeConfig, resolveConfig, sanitizeConfig, type NeonConfig, type NeonMessage } from "./types";
import { loadPresetByName } from "./presets";

export type NeonsignInput = string | NeonMessage[] | Partial<NeonConfig>;

// 다른 페이지에 바로 붙이는 용도의 가벼운 표시 전용 컴포넌트.
// <Neonsign input="문구" /> · <Neonsign input={["문구1","문구2"]} /> · <Neonsign input="프리셋:이름" /> · <Neonsign input={{ messages: [...] }} />
export default function Neonsign({ input }: { input?: NeonsignInput }) {
  const [cfg, setCfg] = useState<NeonConfig>(() => mergeConfig(cloneConfig(DEFAULTS), {}));
  const key = JSON.stringify(input ?? null);

  useEffect(() => {
    let alive = true;
    resolveConfig(input ?? null, loadPresetByName)
      .then((c) => {
        if (alive) setCfg(sanitizeConfig(c));
      })
      .catch(() => {
        if (alive) setCfg(mergeConfig(cloneConfig(DEFAULTS), { messages: [{ text: "설정을 읽을 수 없습니다", color: "#ffb000", effect: "blink" }] }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <NeonBoard config={cfg} />;
}
