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
  const youtubeIcon: string = "https://i.namu.wiki/i/96PzWjU0X4PJWSDG6rRFFgG3dkGLIw06-YMpHg_CVHnURSIHuxA9sF9CrJoXsZISwWeo19Y3LgIQnL1krbrcOg.svg";
  const chzzkIcon: string = "https://i.namu.wiki/i/KS6dZ9Z7c1LBTNBUm5NIw1dOexcJ6CNV8uNoqwyYSuIX0I0qh_mWnUtq_eoTTmsYs7HEHSN4hnPuD9g51iZH_g.webp";

  return (
    <html lang="ko">
      <body className="" style = {{backgroundColor: "#f0f0f0"}}>
        <header className = "header">
            <h1 style = {{color: "orange", fontSize: "2rem", fontWeight: "bold", padding: "20px"}}><a href="/">기끽이넷</a></h1>
            <div className = "header-links">
              <a href = "https://www.youtube.com/@user-zc6rz4ez7d" style = {{display: "flex", flexDirection: "row"}}>
                <img src = {youtubeIcon} alt="YouTube" width="20" height="20"></img>
                유튜브
              </a>
              <a href = "https://chzzk.naver.com/bd0721480c0c5aacffc621134bee3f30" style = {{display: "flex", flexDirection: "row"}}>
                <img src = {chzzkIcon} alt="Chzzk" width="20" height="20" style = {{borderRadius: 4}}></img>
                치지직
              </a>
            </div>
        </header>
        <main>{children}</main>
        <footer style = {{color: "gray"}}>
          2026.05.10 생성
          2026.07.08 업데이트</footer>
      </body>
      
    </html>
    
  );
}
