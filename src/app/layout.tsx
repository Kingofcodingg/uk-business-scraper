import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UK Business Scraper",
  description: "Search UK business directories - Yell, Thomson Local, FreeIndex & more",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
