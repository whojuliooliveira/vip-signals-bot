import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "VIP Signals Console",
  description: "Fast Telegram signal sender for VIP channels",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}