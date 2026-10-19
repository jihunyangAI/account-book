import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI가계부 챗봇",
  description: "대화로 기록하는 AI 가계부",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${outfit.variable} ${notoSansKr.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
