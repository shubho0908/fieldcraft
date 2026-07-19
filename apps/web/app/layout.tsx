import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({
  src: "../../extension/public/fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fieldcraft | The careful application copilot",
  description:
    "Fieldcraft reads the job page, evaluates fit, researches the company, and drafts truthful answers for review.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
