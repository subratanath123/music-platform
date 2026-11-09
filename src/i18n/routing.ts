import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
  localePrefix: "as-needed",
  // Keep the first visit in Bangla. A phone set to English is common in
  // Bangladesh and should not redirect `/` to `/en`. The toggle uses the URL.
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
