import { createContext } from "react";
import type { LobbyStore } from "./lobbyStore";

export const StoreContext = createContext<LobbyStore | null>(null);
