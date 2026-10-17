/** Where the game server lives. Set `VITE_SERVER_URL` to point somewhere else. */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

/** The same address over HTTP, for the room check. */
export function httpUrl(serverUrl: string): string {
  return serverUrl.replace(/^ws/, "http");
}
