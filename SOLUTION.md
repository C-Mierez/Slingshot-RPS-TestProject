# Reasoning and Solution for the [Slingshot Test Challenge](https://github.com/slingshot-finance/RockPaperScissors-test-project)

## Thought Process

Below is the process that took me to the final solution for this challenge.

As far as the description goes, the RockPaperScissors (`RPS`) smart contract should:

-   Allow creation of multiple "rooms" so parallel games are possible.
-   Create a room by placing an initial bet.
    -   The initial bet sets the required amount to be bet by the second player.
-   Betting transfers the ERC20 token and also commits a certain move. (Rock, Paper, Scissors)
-   A winner is chosen on two situations:
    -   Both players have submitted their moves and bets, so the winner is chosen using the game logic.
    -   Some player has not submitted their action after a certain time limit has passed, then:
        -   If it's the _Betting_ stage, whoever has already betted will just receive their money back.
        -   If it's the _Reveal_ stage:
            -   If one player has revealed, then they will be the winner.
            -   If no players have revealed, then no winner will be selected and they'll be able to claim their bets back.

One of the hidden requirements present here, _though briefly teased in the above description_, is that the values in the blockchain are completely public. This means that it would be unfair and straight up unfeasible to do a competitive game like this using raw values.

For this reason, the implementation will have to use some kind of encryption scheme to hide a player's action until the winner is chosen.

### Commit-Reveal Scheme

To solve the aforementioned problem, I've decided to make use of a **Commit-Reveal Scheme** [[1](#commit-reveal-schemes)]. This is a cryptographic scheme that allows an actor to _commit_ to a chosen value, while also keeping it hidden from others, and being able to **verifiably** _reveal_ it at a later time.

Thus, the idea in this project's case is to:

-   Divide the game process in to two phases: `Betting` and `Reveal`.
-   During the `Betting` phase, when a bet is placed, the user also commits to a certain action.
-   Once both bets have been placed, the `Reveal` phase begins and each user must reveal their action. It is then that the winner is decided.

### Games

I would also like to allow the creation of multiple parallel games so that many people can play against each other at any time.

For this I've decided to store each game's information separately.

In order for a player to join an existing game, they would need to have the game's ID.

But how does an end-user get a hold of these games IDs (without the creator just sending it to them). I have different ideas on how to manage this:

-   Maintain an array with only the Open games. Then query this list to see what available games there are.
-   Bind the games to the user that created it, and thus just using the user's address as the ID when joining a game. This would facilitate direct access to a game, but would likely still require maintaining some kind of array with the different owners if someone wanted to know all available games.
-   The possibly most efficient solution, would be not having the open games stored at all and just managing this whole deal from outside, aggregating the Events emitted when creating / closing the games, to see which ones are available.

# WIP

> ## 📚 Resources
>
> ### Commit-Reveal Schemes
>
> -   [Commit-Reveal Voting](https://karl.tech/learning-solidity-part-2-voting/), karl.tech - Karl Floersch
> -   [Commit Reveal Scheme on Ethereum](https://medium.com/gitcoin/commit-reveal-scheme-on-ethereum-25d1d1a25428), medium.com - Austin Thomas Griffith
> -   [High Stakes Roulette on Ethereum](https://soliditydeveloper.com/high-stakes-roulette), soliditydeveloper.com - Markus Waas
>
> -   [how does commit/reveal solve front-running?](https://ethereum.stackexchange.com/questions/93727/how-does-commit-reveal-solve-front-running) Ethereum Stack Exchange.
