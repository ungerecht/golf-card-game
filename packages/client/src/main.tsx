import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/700.css";
import "./index.css";
import { App } from "./App";
import { allAvatarUrls } from "./avatars";
import { allCardUrls } from "./cards";
import { preloadImages } from "./preload";

// Start fetching and decoding the art now, so it is already there when the
// lobby and the table first draw it. Portraits go first: the lobby needs them.
void preloadImages([...allAvatarUrls(), ...allCardUrls()]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
