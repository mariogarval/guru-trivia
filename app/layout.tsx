import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUTGURU — World Cup 2026 Trivia",
  description:
    "Test your soccer knowledge with AI-powered trivia during World Cup 2026. Compete globally, earn points, and become a soccer guru.",
  keywords: "World Cup 2026, soccer trivia, football quiz, FIFA trivia",
  openGraph: {
    title: "FUTGURU — World Cup 2026 Trivia",
    description: "AI-powered soccer trivia for the World Cup 2026",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-[#f0f0f0] antialiased">
        <div className="mx-auto max-w-md min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
