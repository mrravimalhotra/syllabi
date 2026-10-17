import { createGenerationRoute } from "@/lib/generation/handler";

export const POST = createGenerationRoute("sample_paper");

// A whole worksheet or an 80-mark paper can take well over a minute.
export const maxDuration = 300;
