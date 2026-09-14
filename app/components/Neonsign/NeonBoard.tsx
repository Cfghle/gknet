"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createBoardController, type BoardController } from "./engine";
import type { ExportTarget } from "./exporter";
import type { NeonConfig } from "./types";
import styles from "./Neonsign.module.css";

export type NeonBoardHandle = ExportTarget;

const NeonBoard = forwardRef<NeonBoardHandle, { config: NeonConfig }>(function NeonBoard({ config }, ref) {
  const screenRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<BoardController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const screen = screenRef.current;
    const canvas = canvasRef.current;
    if (!screen || !canvas) return;
    const controller = createBoardController(screen, canvas, configRef.current);
    controllerRef.current = controller;
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setConfig(config);
  }, [config]);

  useImperativeHandle(ref, () => ({
    restart: () => controllerRef.current?.restart(),
    setPlaying: (v: boolean) => controllerRef.current?.setPlaying(v),
    isPlaying: () => controllerRef.current?.isPlaying() ?? true,
    step: (dt: number) => controllerRef.current?.step(dt),
    cycleDuration: () => controllerRef.current?.cycleDuration() ?? 0,
    getCanvas: () => canvasRef.current,
    getCssSize: () => controllerRef.current?.getCssSize() ?? { width: 0, height: 0 },
  }));

  return (
    <div ref={screenRef} className={styles["ledbrd-screen"]}>
      <canvas ref={canvasRef} className={styles["ledbrd-canvas"]} />
    </div>
  );
});

export default NeonBoard;
