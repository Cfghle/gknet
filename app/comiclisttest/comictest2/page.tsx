import Monitor from "@/app/components/Monitor";

export default function ComicTest2() {
  
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
      <h1>테스트2</h1>
      <Monitor src="/media/comic/무제527.png" />
    </>
  );
}
