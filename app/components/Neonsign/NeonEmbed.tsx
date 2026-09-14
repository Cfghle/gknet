"use client";

import { useEffect, useState } from "react";
import Neonsign, { type NeonsignInput } from "./Neonsign";
import { configFromLocation } from "./share";

// iframe으로 다른 사이트에 붙이는 용도. 주소의 ?c= (예전 링크는 #c=) 에 담긴 설정으로 전광판만 화면 가득 보여준다.
// 루트 레이아웃의 헤더·푸터를 뺄 수 없어서 고정 위치로 화면 전체를 덮는다
export default function NeonEmbed() {
  const [input, setInput] = useState<NeonsignInput | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      setInput(configFromLocation(window.location.search, window.location.hash) as NeonsignInput | undefined);
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    const html = document.documentElement.style.overflow;
    const body = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("hashchange", read);
      document.documentElement.style.overflow = html;
      document.body.style.overflow = body;
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#0b0b0d",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "100%" }}>{ready ? <Neonsign input={input} /> : null}</div>
    </div>
  );
}
