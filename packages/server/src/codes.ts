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

/** Codes are typed by hand, so accept any case and stray spaces. */
export function normalizeLobbyCode(input: string): string {
  return input.trim().toUpperCase();
}
