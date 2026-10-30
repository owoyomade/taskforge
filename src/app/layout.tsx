import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Plus Jakarta Sans: rounded and friendly but still crisp at small sizes.
// One family for everything; headings get weight, not a second typeface.
const jakarta = Plus_Jakarta_Sans({
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // suppressHydrationWarning: the theme script sets class="dark" on <html>
    // before React loads, so the server and browser markup differ there on purpose.
    <html lang="en" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes
          to <body> before React loads. This ignores attribute differences on
          <body> itself only; mismatches inside the page are still reported. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {/* Light by default: it's the designed look. People can pick Dark or
            "Match my computer" from the user menu; the choice is saved in this
            browser. The nonce lets the tiny no-flash script pass the CSP. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange nonce={nonce}>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
