import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'NEXUS TOKYO — 出会いが、次を動かす。',
  description: '食卓を囲む時間から、本物のつながりが生まれるコミュニティ。ハロウィン、鍋パーティー、お祝い事まで——あなたの「次の一手」が始まる場所。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
