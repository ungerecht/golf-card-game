# Shared
The game engine including rule validation, scoring, and turn flow.


## Game rules
This game is built off my own house-hold rules and has a few differences to the "classic" version.

### Goal
Each player has six cards in a grid with two rows and three columns. The goal is to score lower than the other players each round, and finish all holes with the lowest accumulative score.

### Deck
Standard 52 card deck with no jokers.

### Card values
Ace is 1, 2-10 are face value, Jacks are 11, Queens 12, and Kings 0.
When two matching cards are in the same column their values cancel out to 0.

### Gameplay
<ins>SETUP</ins>  
The cards are shuffled and dealt face down one at a time until every player has six cards forming their grid - two rows of three columns.
The cards are dealt starting with the player to the left of the dealer.
The dealer for the first hole is the room host, for every other round the dealer is "The Biggest Loser" from the previous round.

<ins>INITIAL FLIP</ins>  
Before the game begins each player gets to flip two cards.
Whoever has the lowest showing score after the initial flip gets to go first.
> It's a good strategy to choose two cards from the same column :wink:

<ins>TURNS</ins>  
When it is the player's turn they are able to either:
 - flip one of their face down cards
 - draw from the discard pile and replace any card in their grid
 - draw from the draw pile, then choose to replace any card in their grid or discard it
Turn direction goes to the left (clockwise) around the table.

<ins>GOING OUT</ins>  
When a player ends their turn with all of the cards in their grid facing up they finish the round and their score is locked in. Every other player has their cards flipped up and they each get one more turn.

Every player's score is recorded for that hole and the next round begins.
The player with the highest accumulative score becomes the dealer.


## Game settings
**Private** - Whether the room is private: true(default) or false  
**Max players** - How many players can join the lobby: 2, 3, 4(default)  
**Holes** - Number of rounds in a game: 3, 6, or 9(default)  
**Bots** - Whether empty player slots will be bots: true or false(default)  