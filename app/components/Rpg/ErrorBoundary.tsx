"use client";

import { Component, type ReactNode } from "react";

// 편집기에서 오류가 나면 화면이 빈 채로 멈추는 대신 무슨 오류인지 보여준다
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#2a1416",
          border: "1px solid #6b2b2b",
          borderRadius: 8,
          color: "#ffb4b4",
          padding: 12,
          fontSize: "0.75rem",
        }}
      >
        편집기를 그리다가 오류가 났습니다{"\n"}
        {error.message}
        {"\n\n"}
        {error.stack?.split("\n").slice(0, 6).join("\n")}
      </pre>
    );
  }
}
