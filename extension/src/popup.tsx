// Popup entrypoint — wrapped with ClerkProvider.
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import { App } from "./ui/popup/App.tsx";
import { CLERK_PUBLISHABLE_KEY } from "./shared/clerk.ts";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>,
  );
}
