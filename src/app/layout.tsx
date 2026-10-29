import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Taskforge", template: "%s · Taskforge" },
  description: "Plan projects, track tasks, and keep your team in step.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${bricolage.variable} h-full antialiased`}>
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
