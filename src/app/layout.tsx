import type { Metadata } from "next";
import { Onest } from "next/font/google";
import { connection } from "next/server";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// One friendly, highly legible family for everything; headings get weight,
// not a second typeface.
const onest = Onest({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Taskforge", template: "%s · Taskforge" },
  description: "Pick a plan, set a finish date, and always know what to do next.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request. Pages built ahead of time would have no
  // CSP nonce on their scripts, and the browser would refuse to run them.
  await connection();

  return (
    <html lang="en" className={`${onest.variable} h-full antialiased`}>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes
          to <body> before React loads. This ignores attribute differences on
          <body> itself only; mismatches inside the page are still reported. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
