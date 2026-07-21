import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geist = localFont({
  src: "../../extension/public/fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fieldcraft.shubhojeet.me"),
  title: "Fieldcraft | The careful application copilot",
  description:
    "Fieldcraft reads the job page, evaluates fit, researches the company, and drafts truthful answers for review.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Fieldcraft | The careful application copilot",
    description:
      "Fieldcraft reads the job page, evaluates fit, researches the company, and drafts truthful answers for review.",
    url: "/",
    siteName: "Fieldcraft",
    type: "website",
    locale: "en_US",
    images: {
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "Fieldcraft - a careful job application copilot",
    },
  },
  twitter: {
    card: "summary_large_image",
    title: "Fieldcraft | The careful application copilot",
    description:
      "Fieldcraft reads the job page, evaluates fit, researches the company, and drafts truthful answers for review.",
    images: {
      url: "/og-image.png",
      alt: "Fieldcraft - a careful job application copilot",
    },
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027");
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Fieldcraft",
      url: "https://fieldcraft.shubhojeet.me/",
      description:
        "Fieldcraft reads the job page, evaluates fit, researches the company, and drafts truthful answers for review.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Fieldcraft",
      applicationCategory: "BrowserApplication",
      operatingSystem: "Chrome",
      description:
        "A local-first Chrome extension that helps you read job applications, judge fit, and fill forms only after reviewing each answer.",
      url: "https://fieldcraft.shubhojeet.me/",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
        />
      </head>
      <body className={geist.variable}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
