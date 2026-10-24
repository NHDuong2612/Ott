import type { Metadata } from "next";
import "./globals.css";
import "./play.css";
import "./bot-library.css";
import "./uet-theme.css";

export const metadata: Metadata = {
  title: "Ott — Bản riêng có dashboard BTC",
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
      <body className="antialiased"><aside style={{ padding: "8px 16px", background: "#e8f1ff", color: "#16356b", textAlign: "center", fontSize: 13 }}>Ott · Bản độc lập — tài khoản và dữ liệu riêng</aside>{children}</body>
    </html>
  );
}
