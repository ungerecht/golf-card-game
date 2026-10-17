import { StrictMode } from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../App";
import { createLobbyStore } from "../store/lobbyStore";
import { FakeConnector } from "./fakes";

/** Show the whole app at a route, wired to a fake connector. */
export function renderApp(route = "/", connector = new FakeConnector()) {
  const store = createLobbyStore(connector);
  const user = userEvent.setup();
  const view = render(
    // Strict mode, like the real app, so double-running effects is covered.
    <StrictMode>
      <MemoryRouter initialEntries={[route]}>
        <App store={store} />
      </MemoryRouter>
    </StrictMode>,
  );
  return { ...view, user, store, connector };
}
