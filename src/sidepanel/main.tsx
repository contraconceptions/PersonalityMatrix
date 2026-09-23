import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ContentProvider } from "./ContentContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContentProvider>
      <App />
    </ContentProvider>
  </StrictMode>,
);
