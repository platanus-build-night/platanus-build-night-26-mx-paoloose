// Popup entrypoint — minimal, no Clerk, no fetches.
import { createRoot } from "react-dom/client";
import { App } from "./ui/popup/App.tsx";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
