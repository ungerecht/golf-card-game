# Shared

The Six Card Golf game engine: rule validation, scoring and turn flow. It contains no networking or UI code, so the server, the client and the bots all play by exactly the same rules.

> **This README is the source of truth for the rules.** If the code and this document disagree, one of them has a bug. Decide which is right, update this document first, then fix the code.

## The game at a glance

Six Card Golf is played over several holes (rounds). Each player has a grid of six cards, mostly face down at the start. On your turn you flip or swap cards to make your grid score as low as possible. Once someone has all six cards face up, every other player gets one last turn and the hole is scored. After the final hole, the lowest cumulative score wins.

These are household rules, so they differ from the classic game in places. Where they do, this document is the authority.

## Glossary

| Term          | Meaning                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hole          | One round of play. A game lasts 3, 6 or 9 holes.                                                                                                     |
| Grid          | A player's six cards, laid out in two rows of three columns.                                                                                         |
| Slot          | One of the six positions in a grid. Slots 0 to 2 are the top row and 3 to 5 the bottom row, so the columns are slots (0, 3), (1, 4) and (2, 5).      |
| Draw pile     | The face-down deck in the middle of the table.                                                                                                       |
| Discard pile  | The face-up pile next to the draw pile. Only its top card can be taken.                                                                              |
| Showing score | The score of a player's face-up cards only. A column counts as a match only when both of its cards are face up. Used to decide who goes first.       |
| Going out     | Ending your turn with all six of your cards face up. This starts the end of the hole.                                                                |
| Dealer        | The player who deals the hole. Cards are dealt starting with the player to the dealer's left, and the dealer is the reference point for tie-breaks. |

## Cards and scoring

### Deck

One standard 52-card deck with no jokers, shuffled at the start of every hole.

### Card values

| Card    | Value      |
| ------- | ---------- |
| Ace     | 1          |
| 2 to 10 | Face value |
| Jack    | 11         |
| Queen   | 12         |
| King    | 0          |

### Matching columns

Two cards of the same rank in the same column cancel out, and that column scores 0. Suit does not matter.

### Example

|           | Column 1 | Column 2 | Column 3 |
| --------- | :------: | :------: | :------: |
| **Row 1** |    7     |    4     |    K     |
| **Row 2** |    7     |    9     |    3     |

Column 1 is a match, so it scores 0. Column 2 scores 4 + 9 = 13. Column 3 scores 0 + 3 = 3. The grid scores **16**.

## How a hole is played

**Setup** → **Initial flip** → **Turns** → **Going out** → **Scoring**

### Setup

1. Shuffle the deck and deal six cards face down to each player, one at a time, starting with the player to the dealer's left.
2. Place the rest of the deck in the middle as the draw pile, and turn its top card face up to start the discard pile.

The room host deals the first hole. After that, the deal passes one player to the left at the end of every hole.

### Initial flip

Every player flips two of their face-down cards. The player with the lowest showing score goes first.

> [!TIP]
> Flip two cards from the same column. If they match, that column is already worth 0.

**Breaking a tie**

1. Everyone flips one more card. Only the players who tied are still in the running, and the lowest showing score among them goes first.
2. Repeat until one player is lowest.
3. If every card is face up and the players are still tied, the tied player closest to the dealer's left goes first.

In the last case, and also when the tie is broken on the final flip, every card is already face up. The first player takes a single turn, which means they go out, and every other player then gets exactly one turn.

### Turns

Play passes to the left (clockwise). On your turn, choose one of these:

| Action                     | What happens                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flip                       | Turn one of your face-down cards face up.                                                                                                                        |
| Draw from the discard pile | Take the top discard and swap it with any card in your grid. The new card goes face up in that slot, and the card it replaces goes face up on the discard pile.  |
| Draw from the draw pile    | Take the top card, then either swap it with any card in your grid (same as above) or discard it.                                                                 |

Your turn then ends. Flip is only possible while you still have a face-down card.

If the draw pile is empty when someone needs to draw, shuffle the discard pile, except for its top card, to make a new draw pile.

### Going out

The first player to end a turn with all six cards face up is out. Then:

1. Every other player has their remaining face-down cards flipped up.
2. Each other player takes one final turn, in order. Because none of their cards are face down, they cannot flip. They draw from either pile and swap, or discard a card drawn from the draw pile.
3. The player who went out takes no more turns.

### Scoring

Every grid is scored with the card values and matching columns above, and the result is recorded for that hole. Going out carries no bonus and no penalty.

The deal then passes to the left and the next hole begins at Setup. After the last hole, the player with the lowest cumulative score wins. If players tie, they share the win.

## Game settings

The host chooses these before the lobby code is generated.

| Setting     | Options                 | Default | Description                                                         |
| ----------- | ----------------------- | ------- | ------------------------------------------------------------------- |
| Private     | `true`, `false`         | `true`  | Whether the room is private. Private rooms are joined by code only. |
| Max players | `2`, `3`, `4`           | `4`     | How many players can join the lobby.                                |
| Holes       | `3`, `6`, `9`           | `9`     | Number of rounds in a game.                                         |
| Bots        | `true`, `false`         | `false` | Whether empty player slots are filled with bots, up to Max players. |
| Bot difficulty | `easy`, `normal`     | `normal` | How well bots play. Easy bots choose any legal move at random. Normal bots take low cards and avoid bad swaps. Only used when Bots is on. |