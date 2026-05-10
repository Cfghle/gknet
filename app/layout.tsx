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
      <header>
        <h1 style = {{color: "blue", fontSize: "2rem", fontWeight: "bold"}}>기끽이넷</h1>
      </header>
      <body className="">{children}</body>
      <footer>2026.05.10 생성</footer>
    </html>
    
  );
}
