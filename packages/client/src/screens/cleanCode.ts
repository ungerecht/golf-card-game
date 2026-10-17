import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH } from "@golf/shared";

/** Codes are typed by hand: keep only characters that can be in one, in capitals. */
export function cleanCode(input: string): string {
  return [...input.toUpperCase()]
    .filter((c) => LOBBY_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, LOBBY_CODE_LENGTH);
}
