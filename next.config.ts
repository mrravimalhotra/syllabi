import type { NextConfig } from "next";

// Content Security Policy, in report-only mode first: the browser logs what
// it would block (DevTools console) without blocking anything. Once a full
// test pass shows no reports, switch the header name to
// "Content-Security-Policy" to enforce it.
const CSP = [
  "default-src 'self'",
  // Next.js injects small inline scripts and styles.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Book page images and generated PDFs are served from R2 via signed URLs;
  // photo previews are data: URLs.
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
  "font-src 'self' data:",
  // Read-aloud voice clips are played from in-memory blobs.
  "media-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co",
  // pdf.js renders uploaded PDFs in a worker.
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  // Which version of the app this is, so an open window can tell when a newer one has been deployed.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? `dev-${Date.now()}` },
  // The PDF renderer reads its embedded fonts from disk at runtime; make sure
  // they ship with the routes that render PDFs.
  outputFileTracingIncludes: {
    "/api/documents/**": ["src/lib/pdf/fonts/**/*"],
    "/api/library/**": ["src/lib/pdf/fonts/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The service worker file must always be fetched fresh, or an update could take a day to reach installed apps.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      // The PDF reading worker is large and rarely changes: keep it on the phone for a day.
      { source: "/pdf.worker.min.mjs", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default nextConfig;
