import { useContext } from "react";
import { useStore } from "zustand";
import type { LobbyState } from "./lobbyStore";
import { StoreContext } from "./storeContext";

/** Read part of the lobby state. Re-renders only when that part changes. */
export function useLobby<T>(selector: (state: LobbyState) => T): T {
  const store = useContext(StoreContext);
  if (store === null) throw new Error("Wrap the app in a StoreProvider");
  return useStore(store, selector);
}
