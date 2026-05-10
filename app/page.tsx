import Image from "next/image";

export default function Home() {
  return (
    <div>
      <p>홈페이지 처음생성했습니다</p>

      <h2 className = "text-lg font-semibold">만든거 목록</h2>
      <ul>
        <li><a href = "/projects/미니미니샷건.html">미니미니샷건</a></li>
        <li><a href = "/projects/사각형생성.html">사각형생성</a></li>
      </ul>
    </div>
  );
}
