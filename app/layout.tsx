import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "交大自由行",
  description: "北京交通大学个人校园服务网页版",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "交大自由行" },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-512.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head><meta name="theme-color" content="#ad1d35" /></head>
      <body>{children}</body>
    </html>
  );
}
