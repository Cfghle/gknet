import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "기끽이넷",
  description: "개인 웹사이트입니당",
};

export default function RootLayout({children,}: Readonly<{children: React.ReactNode;}>){
  return (
    <html lang="ko">
      
      <body className="">
        <header className = "header">
            <h1 style = {{color: "orange", fontSize: "2rem", fontWeight: "bold"}}><a href="/">기끽이넷</a></h1>
            <div className = "header-links">
              <a href = "https://www.youtube.com/@user-zc6rz4ez7d">유튜브</a>
              <a href = "https://chzzk.naver.com/bd0721480c0c5aacffc621134bee3f30">치지직</a>
            </div>
        </header>
        <main>{children}</main>
        <footer>2026.05.10 생성</footer>
      </body>
      
    </html>
    
  );
}
