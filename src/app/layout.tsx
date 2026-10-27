import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppUpdates } from "@/components/AppUpdates";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Only code blocks in answers use the mono face: don't hold up first paint for it.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Syllabi", template: "%s · Syllabi" },
  description: "Step-by-step solutions, revision notes and sample papers from your child's or student's own books.",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "Syllabi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // The phone's bar matches the page: dark on grown-up screens when the device is in dark mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
  // Lets the phone tab bar sit above the iPhone home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The saved theme is set on <html> before React starts (THEME_SCRIPT), so the server's copy differs.
      suppressHydrationWarning
    >
      <head>
        {/* A chosen Light or Dark theme, applied before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <AppUpdates />
      </body>
    </html>
  );
}
