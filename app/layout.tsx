import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RIVER 德扑竞技 | 沉浸式德州扑克",
  description: "沉浸式德州扑克牌桌，包含实时操作、牌局战绩与账户资金流水。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
