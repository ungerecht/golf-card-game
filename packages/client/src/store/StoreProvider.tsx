import type { ReactNode } from "react";
import type { LobbyStore } from "./lobbyStore";
import { StoreContext } from "./context";

export function StoreProvider({
  store,
  children,
}: {
  store: LobbyStore;
  children: ReactNode;
}) {
  return <StoreContext value={store}>{children}</StoreContext>;
}
