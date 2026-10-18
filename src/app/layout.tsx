import type { Metadata, Viewport } from "next";
import {
  Andika,
  Atkinson_Hyperlegible,
  Comic_Neue,
  Inter,
  JetBrains_Mono,
  Lexend,
} from "next/font/google";
import localFont from "next/font/local";
import { APP_FONT_STORAGE_KEY, DEFAULT_APP_FONT } from "@/lib/app-font";
import { AppFontRestore } from "@/components/AppFontRestore";
import { UiScaleRestore } from "@/components/UiScaleRestore";
import { uiScaleBootScript } from "@/lib/ui-scale-boot";
import { COMPACT_MAX_HEIGHT, COMPACT_MAX_WIDTH, SNUG_MAX_WIDTH } from "@/lib/viewport-breakpoints";
import { Analytics } from "./Analytics";
import { AnalyticsHeartbeat } from "./AnalyticsHeartbeat";
import { WhatsNewGate } from "@/components/WhatsNewGate";
import { GlobalTitleTooltip } from "@/components/nei/GlobalTitleTooltip";
import "./globals.css";

const monocraft = localFont({
  src: [
    { path: "./fonts/Monocraft-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "./fonts/Monocraft-Light.ttf", weight: "300", style: "normal" },
    { path: "./fonts/Monocraft.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Monocraft-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Monocraft-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Monocraft-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-minecraft",
  display: "swap",
});

/*
 * The alternative fonts the settings dialog offers (src/lib/app-font.ts).
 * next/font downloads the Google ones at build time and serves everything
 * from our own origin, so offering them costs no runtime request to Google.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap",
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

const andika = Andika({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-andika",
  display: "swap",
});

const comicNeue = Comic_Neue({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-comic-neue",
  display: "swap",
});

/* Not on Google Fonts; vendored under its SIL OFL (OpenDyslexic-LICENSE). */
const openDyslexic = localFont({
  src: [
    { path: "./fonts/OpenDyslexic-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/OpenDyslexic-Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-open-dyslexic",
  display: "swap",
  // OpenDyslexic's x-height is far larger than the other faces' and overflows
  // fixed-height chrome; size-adjust scales the glyphs back down.
  declarations: [{ prop: "size-adjust", value: "82%" }],
});

/*
 * Restamps the saved font choice before anything paints, so a reload never
 * flashes the default font. Unknown values match no CSS rule and land on the
 * default; setAppFont owns the real validation.
 */
const appFontBootScript = `try{var f=localStorage.getItem(${JSON.stringify(
  APP_FONT_STORAGE_KEY,
)});if(f&&f!==${JSON.stringify(
  DEFAULT_APP_FONT,
)})document.documentElement.setAttribute("data-app-font",f)}catch(e){}`;

/*
 * Stamps the interface size (ui-scale.ts) and the compact/snug viewport
 * attributes before first paint, for the same reason: a page that painted at
 * one size and snapped to another would flash on every load.
 */
const uiScaleBoot = uiScaleBootScript({
  compactMaxWidth: COMPACT_MAX_WIDTH,
  compactMaxHeight: COMPACT_MAX_HEIGHT,
  snugMaxWidth: SNUG_MAX_WIDTH,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Monifactory Planner",
  title: "Monifactory Planner | Factory Recipe Planner",
  description:
    "Explore Monifactory recipes and plan production chains on an interactive flowchart.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  keywords: [
    "Monifactory Planner",
    "Monifactory recipes",
    "Monifactory factory planner",
    "GregTech Modern factory planner",
  ],
  openGraph: {
    title: "Monifactory Planner | Factory Recipe Planner",
    description:
      "Explore Monifactory recipes and plan production chains on an interactive flowchart.",
    siteName: "Monifactory Planner",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Monifactory Planner | Factory Recipe Planner",
    description:
      "Explore Monifactory recipes and plan production chains on an interactive flowchart.",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  other: {
    // The app is already dark. Without this, Dark Reader rewrites inline
    // styles before React hydrates (hydration mismatches). Next drops empty
    // metadata values, so it carries one; Dark Reader only checks the tag.
    "darkreader-lock": "true",
  },
};

export const viewport: Viewport = {
  // The app's charcoal, so the browser chrome around the page matches it.
  themeColor: "#1b1d21",
};

/**
 * What the site is, said in schema.org's terms for crawlers that read
 * structured data. Kept to claims a machine can verify: free, runs in a
 * browser, about Monifactory.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: "Monifactory Planner",
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#app`,
      url: `${siteUrl}/`,
      name: "Monifactory Planner",
      alternateName: "Monifactory Factory Planner",
      description:
        "Explore Monifactory recipes and draw production chains on a flowchart.",
      applicationCategory: "GameApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      image: `${siteUrl}/icon-512.png`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      about: {
        "@type": "VideoGame",
        name: "Monifactory",
        gamePlatform: "Minecraft",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${monocraft.variable} ${inter.variable} ${jetbrainsMono.variable} ${lexend.variable} ${atkinson.variable} ${andika.variable} ${comicNeue.variable} ${openDyslexic.variable} h-full`}
      // The boot script above stamps `data-app-font` on this element before
      // React ever renders, and the server markup does not carry it.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: appFontBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: uiScaleBoot }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
        {/* Above the app rather than inside it: what changed is a fact about
            the whole planner, not about whichever tab happens to be open. */}
        <div className="ui-zoom">
          <WhatsNewGate />
        </div>
        {/* Puts the saved font back if anything took it off after the boot
            script above; see the component. */}
        <AppFontRestore />
        {/* Every `title` attribute in the app, worn as the planner's own
            tooltip: the browser's grey box never renders again. */}
        <GlobalTitleTooltip />
        <Analytics />
        <AnalyticsHeartbeat />
      </body>
    </html>
  );
}
