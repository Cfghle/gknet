import Monitor from "@/app/components/Monitor";
import MockGame from "@/app/components/Rpg/MockGame";

export default function ComicTest1() {
  return (
    <>
      <style>{`
        .messagebox{
            display: inline-block;
            font-size: 20px;
            padding:5px;
            margin: 10px;

            /*테두리 설정*/
            background-color: white;
            border:2px solid black;
            outline:2px solid white;

            /*폰트 설정*/
            font-family: "gal";
            -webkit-font-smoothing: none;
        }
      `}</style>
      <h1>테스트1</h1>
      <Monitor src="/media/comic/Untitled.png" />
      <Monitor src="/media/comic/무제527.png" />
      <Monitor src="/media/comic/opening.png" style={{height: "fit-content"}}/>
      {/* 타일맵 미니게임: 클릭한 뒤 WASD·방향키로 이동, 스페이스로 조사 */}
      <Monitor>
        <MockGame />
      </Monitor>
    </>
  );
}
