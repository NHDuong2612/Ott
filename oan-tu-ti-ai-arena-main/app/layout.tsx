import type { Metadata } from "next";
import "./globals.css";
import "./play.css";
import "./bot-library.css";
import "./uet-theme.css";

export const metadata: Metadata = {
  title: "UET Arena — Đấu trường lập trình bot",
  description: "Đấu trường lập trình bot UET – VNU. Viết bot Python. Thử chiến thuật trên bàn cờ 9×9. Tham gia giải đấu và khám phá từng nước đi.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
