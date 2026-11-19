import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { PwaBoot } from "@/components/pwa-boot";
import { BRAND } from "@/lib/brand";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://taskflow-one-bice.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND.name
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: `${BRAND.name} logo` }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    images: ["/og.png"]
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080B12" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__tfBip=e;window.dispatchEvent(new Event('tf:installable'));});"
          }}
        />
      </head>
      <body className="min-h-screen">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
        <PwaBoot />
      </body>
    </html>
  );
}
