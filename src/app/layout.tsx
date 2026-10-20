import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cord — Better. Faster. Together.",
  description: "Your people. Your space. Your Cord. A home for the conversations and communities that make being online feel more human.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
