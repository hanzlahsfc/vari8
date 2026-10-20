import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "App",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="pro-dark" suppressHydrationWarning>
      <head>
        {/* FI-I3: browser-local appearance bootstrap. Reads the dedicated
            `appearance` key and applies it ONLY when the value is one of
            the two existing theme identifiers — malformed, foreign or
            injected content can never reach `data-theme`. Storage
            failures are swallowed; pro-dark remains the default. Runs
            before paint so a saved pro-white never flashes pro-dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var v=localStorage.getItem('appearance');" +
              "if(v==='pro-white'||v==='pro-dark')" +
              "document.documentElement.dataset.theme=v;}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
