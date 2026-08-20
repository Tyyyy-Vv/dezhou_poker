import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "RIVER 德扑竞技 | 沉浸式德州扑克";
const description = "沉浸式德州扑克牌桌，实时显示每位玩家的手牌状态、下注动作、牌局战绩与账户资金流水。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "river-poker-table-cn.xty-811811.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: imageUrl, width: 1672, height: 941, alt: "RIVER 德扑竞技牌桌" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

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
