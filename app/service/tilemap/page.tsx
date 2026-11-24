import MapEditorClient from "@/app/components/Rpg/MapEditorClient";

export default function TilemapPage() {
  // 나만 쓰는 편집기라 로컬 개발 모드(npm run dev)에서만 연다. 저장이 프로젝트 파일에 바로 쓰기 때문
  if (process.env.NODE_ENV !== "development") {
    return (
      <>
        <h2>타일맵 편집기</h2>
        <p>이 편집기는 로컬 개발 환경에서만 열립니다.</p>
      </>
    );
  }

  return (
    <>
      <h2>타일맵 편집기</h2>
      <p>
        64×64 타일로 맵을 그리고 바로 돌아다녀 볼 수 있는 편집기입니다. 그림은 <code>public/game/tiles</code>,{" "}
        <code>public/game/backgrounds</code> 폴더에 넣으면 목록에 뜨고, 저장하면 <code>public/game/project.json</code>과 맵마다{" "}
        <code>public/game/maps/(파일 이름).json</code>에 바로 기록됩니다.
      </p>
      <MapEditorClient />
    </>
  );
}
