// Clerk configuration for the extension.
// The publishable key is baked in at build time from the environment.

export const CLERK_PUBLISHABLE_KEY =
  process.env.CLERK_PUBLISHABLE_KEY ??
  "pk_test_aW50ZW50LW1vc3F1aXRvLTY4LmNsZXJrLmFjY291bnRzLmRldiQ";
