import { z } from "zod";

/**
 * Host-selectable game settings. Every field has a default, so
 * `GameSettingsSchema.parse({})` gives the standard rules.
 *
 * House rules differ a lot between groups. Anything that varies lives here
 * rather than being hard-coded in the scoring or turn logic.
 */
export const GameSettingsSchema = z.object({
  // Room privacy
  private: z.boolean().default(true),
  // Max players: 2, 3, or 4
  maxPlayers: z.literal([2, 3, 4]).default(4),
  // Number of holes (rounds) in a game: 3, 6, or 9
  holes: z.literal([3, 6, 9]).default(9),
  // Fill empty player slots with bots
  bots: z.boolean().default(false),
});

export type GameSettings = z.infer<typeof GameSettingsSchema>;

export const DEFAULT_SETTINGS: GameSettings = GameSettingsSchema.parse({});
