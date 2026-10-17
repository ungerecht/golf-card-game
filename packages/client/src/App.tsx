import { useMemo } from "react";
import { Route, Routes } from "react-router";
import { createColyseusConnector } from "./net/colyseusConnector";
import type { Connector } from "./net/types";
import { usePixelScale } from "./pixel";
import { HostSettings } from "./screens/HostSettings";
import { Landing } from "./screens/Landing";
import { WaitingRoom } from "./screens/WaitingRoom";
import { createLobbyStore, type LobbyStore } from "./store/lobbyStore";
import { StoreProvider } from "./store/StoreProvider";

export function App({ store }: { store?: LobbyStore }) {
  usePixelScale();
  const ownStore = useMemo(
    () => store ?? createLobbyStore(createColyseusConnector()),
    [store],
  );
  return (
    <StoreProvider store={ownStore}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<HostSettings />} />
        <Route path="/room/:code" element={<WaitingRoom />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </StoreProvider>
  );
}

export type { Connector };
