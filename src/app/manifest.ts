import type { MetadataRoute } from "next";

// Lets parents and tutors install Syllabi: on a phone's home screen, or as a desktop app from Chrome or Edge.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Syllabi",
    short_name: "Syllabi",
    lang: "en-IN",
    categories: ["education"],
    scope: "/",
    description: "Study material from your child's or student's own books.",
    start_url: "/dashboard",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f8fafc",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Generate", url: "/dashboard", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "My books", url: "/dashboard/library", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "My documents", url: "/dashboard/documents", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
