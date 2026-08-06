export default function ComicTest2() {
  return (
    <>
      <style>{`
        .monitor {
            width: 710px;
            height: 540px; /* 높이 고정 */
            display: block;
            margin: auto;
            border-radius: 5%;
            border: 30px solid;
            margin-bottom: 50px;
            text-align: center;
            /*image-rendering: crisp-edges;*/
            image-rendering: pixelated;
        }
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
      <div className="monitor">...</div>
    </>
  );
}
