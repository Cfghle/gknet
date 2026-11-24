"use client";

import { useEffect, useState } from "react";
import GameCanvas from "./GameCanvas";
import { loadProjectOrMock } from "./storage";
import { createMockProject, type GameProject } from "./types";

// public/game 의 맵 파일을 읽어서 게임을 띄운다. 파일이 없거나 읽지 못하면 샘플 맵으로 돈다 (게임은 읽기만 하므로 괜찮다)
export default function MockGame() {
  const [project, setProject] = useState<GameProject | null>(null);

  useEffect(() => {
    let alive = true;
    loadProjectOrMock()
      .then(({ project }) => project)
      .catch((e) => {
        console.warn("맵 파일을 읽지 못해 샘플 맵으로 대신합니다:", e);
        return createMockProject();
      })
      .then((next) => {
        if (alive) setProject(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!project) return null;
  return <GameCanvas project={project} />;
}
