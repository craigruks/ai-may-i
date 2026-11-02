// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import lucode from "lucode-starlight";

// The same theme and layout as x402-server-guard's docs, so the two sites read alike.
// https://astro.build/config
export default defineConfig({
  site: "https://craigruks.github.io",
  base: "/ai-may-i",
  integrations: [
    starlight({
      title: "ai-may-i",
      description:
        "Ask a human before an AI agent's command reaches production secrets in 1Password.",
      plugins: [lucode()],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/craigruks/ai-may-i",
        },
      ],
      sidebar: [
        {
          label: "Welcome",
          items: [{ label: "Introduction", slug: "index" }],
        },
        {
          label: "Getting Started",
          items: ["getting-started"],
        },
      ],
    }),
  ],
});
