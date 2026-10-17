import type { MetadataRoute } from "next";

// Lets parents and tutors add Syllabi to their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Syllabi",
    short_name: "Syllabi",
    description: "Study material from your child's or student's own books.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
