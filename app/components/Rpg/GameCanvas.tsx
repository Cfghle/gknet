"use client";

import { useEffect, useRef } from "react";
import { createGame, type GameController } from "./engine";
import { VIEW_H, VIEW_W, type GameProject } from "./types";

// Monitor 컴포넌트 안에 넣으면 테두리 안쪽 높이에 맞춰 커진다 (710×540 비율 유지)
export default function GameCanvas({ project, fit = "monitor" }: { project: GameProject; fit?: "monitor" | "block" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameController | null>(null);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createGame(canvas, projectRef.current);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    gameRef.current?.setProject(project);
  }, [project]);

  return (
    <canvas
      ref={canvasRef}
      width={VIEW_W}
      height={VIEW_H}
      tabIndex={0}
      aria-label="타일맵 미니게임"
      style={
        fit === "monitor"
          ? { display: "block", height: "100%", width: "auto", margin: "0 auto", imageRendering: "pixelated", outline: "none", touchAction: "none" }
          : { display: "block", width: "100%", maxWidth: VIEW_W, imageRendering: "pixelated", outline: "none", touchAction: "none" }
      }
    />
  );
}
