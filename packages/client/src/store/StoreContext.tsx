import type { ReactNode } from "react";
import type { LobbyStore } from "./lobbyStore";
import { StoreContext } from "./storeContext";

export function StoreProvider({
  store,
  children,
}: {
  store: LobbyStore;
  children: ReactNode;
}) {
  return <StoreContext value={store}>{children}</StoreContext>;
}
