// Einstieg der eigenständigen Datei (ein HTML ohne Server, siehe
// scripts/preview-standalone.mjs). Mit Hash-Navigation statt Next.js.
import { createRoot } from "react-dom/client";
import { PreviewApp } from "./app";

const wurzel = document.getElementById("root");
if (wurzel) createRoot(wurzel).render(<PreviewApp />);
