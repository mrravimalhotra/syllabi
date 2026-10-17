import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF renderer reads its embedded fonts from disk at runtime; make sure
  // they ship with the routes that render PDFs.
  outputFileTracingIncludes: {
    "/api/generate/*": ["src/lib/pdf/fonts/**/*"],
  },
};

export default nextConfig;
