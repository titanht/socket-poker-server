import { Server } from 'socket.io';
import { stripId } from '../../../tests/testUtils';
import { cardEvents } from '../card/card.events';
import { PokerCounts, pokerSuiteValues } from '../card/cardTypes';
import { gameEvents, SocketArg } from './game.events';
import { ICard, IGame } from './game.interfaces';
import { getPlayer } from './game.service';
import playerMoves from './playerMoves.service';

const writePlayerMove = async (io: Server, game: IGame, cards: ICard[]) => {
  const playerIndex = game.players.findIndex(
    i => i.socketId === game.currentPlayerSocketId,
  );
  const updatedGame = await playerMoves.writePlayerMove(
    game,
    game.currentPlayerSocketId,
    cards,
  );

  io.to(game.currentPlayerSocketId).emit(
    gameEvents.playerCards,
    stripId(updatedGame.toJSON().players[playerIndex].cards),
  );

  return updatedGame;
};

const changeSuiteAtopJoker = async (io: Server, game: IGame, card: ICard) => {
  if (
    game.currentSuite === pokerSuiteValues.joker ||
    (game.topCard && game.topCard.suite === pokerSuiteValues.joker)
  ) {
    console.log('Change top suite');
    await playerMoves.setCurrentSuite(game, card.suite);
    io.in(game.id).emit(cardEvents.cardCurrentSuite, card.suite);
  }
};

export default {
  async onRestMove({ io }: SocketArg, game: IGame, cards: ICard[]) {
    const chosenCard = cards[cards.length - 1];
    await playerMoves.setCurrentValue(game, chosenCard.value);
    await changeSuiteAtopJoker(io, game, chosenCard);
    await playerMoves.setTopCard(game, chosenCard);

    let updatedGame = await writePlayerMove(io, game, cards);
    updatedGame = await playerMoves.moveToNextPlayer(game, {});
    await playerMoves.clearDealtCards(updatedGame);

    io.in(updatedGame.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
    io.in(updatedGame.id).emit(
      cardEvents.cardTop,
      updatedGame.toJSON().topCard,
    );
  },

  async onSuiteChanger(
    { io }: SocketArg,
    game: IGame,
    card: ICard,
    asSuite: string,
  ) {
    await playerMoves.setCurrentSuite(game, asSuite);
    await playerMoves.setCurrentValue(game, card.value);
    await playerMoves.setTopCard(game, card);
    let updatedGame = await writePlayerMove(io, game, [card]);
    updatedGame = await playerMoves.moveToNextPlayer(game, {});
    await playerMoves.clearDealtCards(updatedGame);

    io.in(updatedGame.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
    io.in(updatedGame.id).emit(
      cardEvents.cardTop,
      updatedGame.toJSON().topCard,
    );
    if (asSuite) {
      io.in(updatedGame.id).emit(cardEvents.cardCurrentSuite, asSuite);
    }
  },

  async onDraw({ io }: SocketArg, game: IGame) {
    const updatedGame = await playerMoves.dealCard(
      game,
      1,
      game.currentPlayerSocketId,
    );
    await playerMoves.clearDealtCards(game);
    const playerIndex = updatedGame.players.findIndex(
      i => i.socketId === game.currentPlayerSocketId,
    );

    io.to(game.currentPlayerSocketId).emit(
      gameEvents.playerCards,
      stripId(updatedGame.toJSON().players[playerIndex].cards),
    );
  },

  async onAce({ io }: SocketArg, game: IGame, card: ICard) {
    await playerMoves.setCurrentValue(game, card.value);
    await changeSuiteAtopJoker(io, game, card);

    await playerMoves.setTopCard(game, card);
    let updatedGame = await writePlayerMove(io, game, [card]);
    updatedGame = await playerMoves.moveToNextPlayer(game, {});
    updatedGame = await playerMoves.dealCard(
      updatedGame,
      PokerCounts.ace,
      updatedGame.currentPlayerSocketId,
    );

    io.in(updatedGame.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
    io.in(updatedGame.id).emit(
      cardEvents.cardTop,
      updatedGame.toJSON().topCard,
    );

    const player = await updatedGame
      .toJSON()
      .players.find(i => i.socketId === updatedGame.currentPlayerSocketId);
    io.to(updatedGame.currentPlayerSocketId).emit(
      gameEvents.playerCards,
      stripId(player.cards),
    );
  },

  async onSkipper({ io }: SocketArg, game: IGame, card: ICard) {
    await changeSuiteAtopJoker(io, game, card);
    await playerMoves.setCurrentValue(game, card.value);
    await playerMoves.setTopCard(game, card);
    let updatedGame = await writePlayerMove(io, game, [card]);
    updatedGame = await playerMoves.moveToNextPlayer(game, {
      skips: 1,
    });
    updatedGame = await playerMoves.transferDealtCard(
      updatedGame,
      game.currentPlayerSocketId,
      updatedGame.currentPlayerSocketId,
    );

    io.in(updatedGame.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
    io.in(updatedGame.id).emit(
      cardEvents.cardTop,
      updatedGame.toJSON().topCard,
    );

    updatedGame = updatedGame.toJSON();
    // Emit current card to from and to players
    const player1Index = updatedGame.players.findIndex(
      player => player.socketId === game.currentPlayerSocketId,
    );
    const player1 = updatedGame.players[player1Index];
    io.to(player1.socketId).emit(
      gameEvents.playerCards,
      stripId(player1.cards),
    );

    const player2Index = updatedGame.players.findIndex(
      player => player.socketId === updatedGame.currentPlayerSocketId,
    );
    const player2 = updatedGame.players[player2Index];
    io.to(player2.socketId).emit(
      gameEvents.playerCards,
      stripId(player2.cards),
    );
  },

  async onDirectionChanger({ io }: SocketArg, game: IGame, card: ICard) {
    await playerMoves.setCurrentValue(game, card.value);
    await changeSuiteAtopJoker(io, game, card);
    await playerMoves.setTopCard(game, card);
    let updatedGame = await writePlayerMove(io, game, [card]);
    updatedGame = await playerMoves.changeDirection(game);
    updatedGame = await playerMoves.moveToNextPlayer(updatedGame, {});
    await playerMoves.clearDealtCards(updatedGame);

    io.in(game.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
    io.in(game.id).emit(cardEvents.cardDirection, updatedGame.direction);
    io.in(game.id).emit(cardEvents.cardTop, updatedGame.toJSON().topCard);
  },

  async onJoker({ io }: SocketArg, game: IGame, card: ICard) {
    await playerMoves.setCurrentSuite(game, pokerSuiteValues.joker);
    await playerMoves.setTopCard(game, card);
    let updatedGame = await writePlayerMove(io, game, [card]);
    updatedGame = await playerMoves.moveToNextPlayer(game, {});
    updatedGame = await playerMoves.dealCard(
      game,
      PokerCounts.joker,
      updatedGame.currentPlayerSocketId,
    );
    const player = updatedGame.players.find(
      p => p.socketId === updatedGame.currentPlayerSocketId,
    );

    io.in(game.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
    io.in(game.id).emit(cardEvents.cardTop, updatedGame.toJSON().topCard);
    io.to(updatedGame.currentPlayerSocketId).emit(
      gameEvents.playerCards,
      player.cards,
    );
  },

  async onEmpty({ io }: SocketArg, game: IGame) {
    let updatedGame = await playerMoves.moveToNextPlayer(game, {});
    await playerMoves.clearDealtCards(updatedGame);
    io.in(game.id).emit(
      gameEvents.playerCurrent,
      getPlayer(updatedGame.players, updatedGame.currentPlayerSocketId),
    );
  },

  async onCrazy({ socket }: SocketArg, game: IGame) {
    const updatedGame = await playerMoves.dealCard(
      game,
      PokerCounts.crazy,
      game.currentPlayerSocketId,
    );
    const playerIndex = updatedGame.players.findIndex(
      i => i.socketId === socket.id,
    );

    socket.emit(gameEvents.playerCards, updatedGame.players[playerIndex].cards);
  },
};
