"use client";

import { useSyncExternalStore } from "react";
import ErrorBoundary from "./ErrorBoundary";
import MapEditor from "./MapEditor";

// 편집기는 저장된 맵(localStorage)을 읽어야 해서 브라우저에서만 그린다.
// 따로 떼어 늦게 불러오면(next/dynamic) 개발 중 청크가 어긋났을 때 "불러오는 중"에서 멈출 수 있어,
// 같은 묶음에 넣고 화면에 붙은 뒤에만 그리도록 했다
const emptySubscribe = () => () => {};

export default function MapEditorClient() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  if (!mounted) {
    return (
      <p style={{ color: "#8a8a8a" }}>
        편집기를 불러오는 중… (이 문구가 계속 보이면 브라우저에서 자바스크립트가 실행되지 않은 상태입니다)
      </p>
    );
  }
  return (
    <ErrorBoundary>
      <MapEditor />
    </ErrorBoundary>
  );
}
