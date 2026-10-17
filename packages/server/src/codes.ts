import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, type Rng } from "@golf/shared";

/** A random lobby code such as `K7QWM`. */
export function generateLobbyCode(rng: Rng = Math.random): string {
  let code = "";
  for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
    const index = Math.floor(rng() * LOBBY_CODE_ALPHABET.length);
    code += LOBBY_CODE_ALPHABET.charAt(index);
  }
  return code;
}

/** Codes are typed by hand: keep only characters that can be in one, in capitals. */
export function normalizeLobbyCode(input: string): string {
  return [...input.trim().toUpperCase()]
    .filter((c) => LOBBY_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, LOBBY_CODE_LENGTH);
}
