import { createGenerationRoute } from "@/lib/generation/handler";

export const POST = createGenerationRoute("paper_check");

// Marking a paper of many sums (read from photos) can take a minute or two.
export const maxDuration = 300;
