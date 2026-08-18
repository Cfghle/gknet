import Image from "next/image";
import styles from './page.module.css';
import Rocketgame from "@/public/projects/Rocketgame";
import Monitor from "./components/Monitor";


export default function Home() {
  return (
    <div>
      <p>홈페이지 처음생성했습니다</p>

      <h2 className = "text-lg font-semibold">만든거 목록</h2>
      <ul className = {styles['projects-list']}>
        <li><a href = "/projects/미니미니샷건.html">미니미니샷건</a></li>
        <li><a href = "/projects/사각형생성.html">사각형생성</a></li>
        <li><a href = "https://cfghle.github.io/guitar.net/">Guitar.net</a></li>
        <li><a href = "https://cfghle.github.io/Cfghle/">잡동사니 스페이스</a></li>
        <li><a href = "/projects/cardgame/index.html">카드게임</a></li>
      </ul>

      <div style = {{stroke: "black", border: "4px solid black", padding: 10, marginTop: 20}}>
        <Rocketgame></Rocketgame>
      </div>
    </div>
  );
}
