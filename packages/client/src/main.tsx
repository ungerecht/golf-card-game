import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource/unifontex";
import "@fontsource-variable/material-symbols-outlined";
import "./app/global.css";
import { App } from "./app/App";
import { allAvatarUrls } from "./lib/avatars";
import { allCardUrls } from "./lib/cards";
import { preloadImages } from "./lib/preload";

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
