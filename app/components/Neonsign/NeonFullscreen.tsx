"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NeonBoard from "./NeonBoard";
import type { NeonConfig } from "./types";
import styles from "./Neonsign.module.css";

const PAD = 16;

// 방향 고정은 브라우저마다 있기도 없기도 해서 있으면 쓰고 없으면 넘어간다
type OrientationLock = { lock?: (orientation: string) => Promise<void>; unlock?: () => void };

// 전광판만 기기 화면에 꽉 채워 보여주는 모드. 켜 두는 용도라 화면이 꺼지지 않게 하고 가로 방향으로 고정해 본다
export default function NeonFullscreen({ config, onClose }: { config: NeonConfig; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;

    (async () => {
      // 전체화면을 못 쓰는 브라우저면 페이지 위에 덮은 채로 그대로 보여준다
      try {
        await el.requestFullscreen();
      } catch {}
      try {
        await (screen.orientation as unknown as OrientationLock)?.lock?.("landscape");
      } catch {}
      try {
        const lock = await navigator.wakeLock?.request("screen");
        if (cancelled) lock?.release().catch(() => {});
        else wakeLock = lock ?? null;
      } catch {}
    })();

    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // 사용자가 Esc나 브라우저 UI로 전체화면을 빠져나가면 이 모드도 같이 닫는다
    const onFsChange = () => {
      if (!document.fullscreenElement) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      wakeLock?.release().catch(() => {});
      try {
        (screen.orientation as unknown as OrientationLock)?.unlock?.();
      } catch {}
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // 화면 높이에 맞춰 도트를 키우고, 그 크기로 가로를 꽉 채울 만큼 칼럼을 잡는다.
  // 가로 칼럼 수를 직접 정해 둔 설정이면 그 수를 지키면서 화면에 들어갈 만큼만 키운다
  const fullConfig = useMemo<NeonConfig | null>(() => {
    if (!size) return null;
    const rows = Math.min(32, Math.max(5, config.rows | 0));
    const availW = Math.max(40, size.w - PAD * 2);
    const availH = Math.max(40, size.h - PAD * 2);
    if (config.width > 0) {
      return { ...config, cell: Math.max(2, Math.floor(Math.min(availW / config.width, availH / rows))) };
    }
    const cell = Math.max(2, Math.floor(availH / rows));
    return { ...config, cell, width: Math.max(8, Math.floor(availW / cell)) };
  }, [config, size]);

  return (
    <div className={styles.fsStage} ref={stageRef}>
      {fullConfig ? <NeonBoard config={fullConfig} /> : null}
      <button className={styles.fsExit} onClick={() => closeRef.current()}>
        ✕ 나가기 (Esc)
      </button>
    </div>
  );
}
