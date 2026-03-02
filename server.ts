import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GameState, Player, BankerCard, SlideState, PlayerStatus } from "./src/types";
import { createDeck } from "./src/utils";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = 3000;

let gameState: GameState = {
  roomId: "main",
  players: [],
  bankerCards: Array(4).fill(null).map(() => ({
    card: null,
    isRevealed: false,
    slide: 'NONE',
    lockedPlayerId: null
  })),
  currentCardIndex: 0,
  pot: 0,
  currentBid: 0,
  highBidderId: null,
  turnIndex: 0,
  phase: 'waiting',
  log: ["Waiting for players to join..."]
};

function resetGame() {
  const deck = createDeck();
  
  // Deal to players
  gameState.players.forEach((p, i) => {
    p.card = deck.pop()!;
    p.status = 'waiting';
    p.lockedCardIndex = null;
    p.lastBid = 0;
  });

  // Deal to banker
  gameState.bankerCards = Array(4).fill(null).map((_, i) => {
    const card = deck.pop()!;
    return {
      card,
      isRevealed: i === 0, // First card revealed immediately
      slide: 'NONE',
      lockedPlayerId: null
    };
  });

  gameState.currentCardIndex = 0;
  gameState.pot = gameState.players.length * 5; // Ante $5
  gameState.players.forEach(p => p.balance -= 5);
  gameState.currentBid = 0;
  gameState.highBidderId = null;
  gameState.turnIndex = 0;
  gameState.phase = 'bidding';
  gameState.log = ["Round started! Ante $5 paid.", `Card 1 revealed: ${gameState.bankerCards[0].card?.rank} of ${gameState.bankerCards[0].card?.suit}`];
  
  broadcastState();
}

function broadcastState() {
  io.emit("stateUpdate", gameState);
}

function addAIPlayers() {
  const aiCount = 4 - gameState.players.length;
  for (let i = 0; i < aiCount; i++) {
    const aiPlayer: Player = {
      id: `ai-${Math.random().toString(36).substr(2, 9)}`,
      name: `AI Player ${i + 2}`,
      card: null,
      balance: 1000,
      status: 'waiting',
      lockedCardIndex: null,
      isAI: true,
      lastBid: 0,
      tilt: 0
    };
    gameState.players.push(aiPlayer);
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (name: string) => {
    if (gameState.players.length >= 4) {
      socket.emit("error", "Game full");
      return;
    }

    const newPlayer: Player = {
      id: socket.id,
      name: name || `Player ${gameState.players.length + 1}`,
      card: null,
      balance: 1000,
      status: 'waiting',
      lockedCardIndex: null,
      isAI: false,
      lastBid: 0
    };

    gameState.players.push(newPlayer);
    
    if (gameState.players.length === 1) {
      // If first player, wait a bit then fill with AI if needed
      setTimeout(() => {
        if (gameState.players.length < 4) {
          addAIPlayers();
          resetGame();
        }
      }, 5000);
    } else if (gameState.players.length === 4) {
      resetGame();
    }

    broadcastState();
  });

  socket.on("action", (data: { type: 'bid' | 'pass' | 'fold' | 'raise', amount?: number }) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || gameState.phase !== 'bidding') return;
    
    handlePlayerAction(player, data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    if (gameState.players.filter(p => !p.isAI).length === 0) {
      gameState.players = [];
      gameState.phase = 'waiting';
    }
    broadcastState();
  });
});

function handlePlayerAction(player: Player, action: { type: 'bid' | 'pass' | 'fold' | 'raise', amount?: number }) {
  const currentPlayer = gameState.players[gameState.turnIndex];
  if (currentPlayer.id !== player.id) return;

  if (action.type === 'pass') {
    player.status = 'passed';
    gameState.log.push(`${player.name} passed on Card ${gameState.currentCardIndex + 1}`);
    nextTurn();
  } else if (action.type === 'bid') {
    const bidAmount = action.amount || 10;
    if (player.balance < bidAmount) return;
    
    player.balance -= bidAmount;
    gameState.pot += bidAmount;
    gameState.currentBid = bidAmount;
    player.lastBid = bidAmount;
    gameState.highBidderId = player.id;
    player.status = 'bidding';
    gameState.log.push(`${player.name} bid $${bidAmount} on Card ${gameState.currentCardIndex + 1}`);
    nextTurn();
  } else if (action.type === 'raise') {
    const raiseAmount = action.amount || (gameState.currentBid + 5);
    const diff = raiseAmount - player.lastBid;
    if (player.balance < diff) return;

    player.balance -= diff;
    gameState.pot += diff;
    gameState.currentBid = raiseAmount;
    player.lastBid = raiseAmount;
    gameState.highBidderId = player.id;
    player.status = 'bidding';
    gameState.log.push(`${player.name} raised to $${raiseAmount} on Card ${gameState.currentCardIndex + 1}`);
    nextTurn();
  } else if (action.type === 'fold') {
    player.status = 'folded';
    gameState.log.push(`${player.name} folded!`);
    nextTurn();
  }

  broadcastState();
}

function nextTurn() {
  // Logic to move to next player or next card
  // This is complex because of the "bidding war" vs "passing"
  
  const activePlayers = gameState.players.filter(p => p.status !== 'folded' && p.status !== 'locked');
  
  if (activePlayers.length === 0) {
    // Everyone folded or locked? Should not happen normally
    endRound();
    return;
  }

  gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
  
  // Priced Out Logic
  const player = gameState.players[gameState.turnIndex];
  if (gameState.highBidderId && 
      gameState.highBidderId !== player.id && 
      player.status !== 'folded' && 
      player.status !== 'locked' && 
      player.status !== 'passed') {
    
    const minRaise = gameState.currentBid + 5;
    const diff = minRaise - player.lastBid;
    if (player.balance < diff) {
      player.status = 'folded';
      gameState.log.push(`${player.name} is priced out (Balance: $${player.balance}, Need: $${diff}) and must fold!`);
      return nextTurn();
    }
  }

  // Skip players who can't act
  let attempts = 0;
  while (
    (gameState.players[gameState.turnIndex].status === 'folded' || 
     gameState.players[gameState.turnIndex].status === 'locked' ||
     (gameState.highBidderId && gameState.players[gameState.turnIndex].status === 'passed')) &&
    attempts < 4
  ) {
    gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
    attempts++;
  }

  // Check if bidding phase for current card is over
  checkPhaseTransition();
}

function checkPhaseTransition() {
  const eligibleToBid = gameState.players.filter(p => p.status === 'waiting' || p.status === 'bidding');
  
  // If everyone passed or one person is high bidder and others folded/passed
  const othersCanAct = eligibleToBid.filter(p => p.id !== gameState.highBidderId);
  
  // Banker's Shortcut: Check if anyone is left who can bid at all in the future
  const totalEligible = gameState.players.filter(p => p.status !== 'locked' && p.status !== 'folded');
  if (totalEligible.length === 0) {
    gameState.log.push("No eligible players left. Banker goes straight to the Grand Reveal!");
    endRound();
    return;
  }

  if (gameState.highBidderId && othersCanAct.every(p => p.status === 'folded' || p.status === 'passed')) {
    // High bidder wins the card
    const winner = gameState.players.find(p => p.id === gameState.highBidderId)!;
    winner.status = 'locked';
    winner.lockedCardIndex = gameState.currentCardIndex;
    gameState.bankerCards[gameState.currentCardIndex].lockedPlayerId = winner.id;
    gameState.log.push(`${winner.name} locked onto Card ${gameState.currentCardIndex + 1}!`);
    moveToNextCard();
  } else if (!gameState.highBidderId && gameState.players.every(p => p.status === 'passed' || p.status === 'folded' || p.status === 'locked')) {
    // Everyone passed on this card
    gameState.log.push(`Everyone passed on Card ${gameState.currentCardIndex + 1}.`);
    moveToNextCard();
  } else {
    // Continue bidding
    const nextPlayer = gameState.players[gameState.turnIndex];
    if (nextPlayer.isAI) {
      setTimeout(() => aiDecision(nextPlayer), 1500);
    }
  }
}

function moveToNextCard() {
  gameState.currentCardIndex++;
  
  // Banker's Shortcut check before moving to next card
  const totalEligible = gameState.players.filter(p => p.status !== 'locked' && p.status !== 'folded');
  
  if (gameState.currentCardIndex >= 4 || totalEligible.length === 0) {
    if (totalEligible.length === 0 && gameState.currentCardIndex < 4) {
      gameState.log.push("No eligible players left. Banker goes straight to the Grand Reveal!");
    }
    endRound();
  } else {
    // Reset statuses for next card (except locked/folded)
    gameState.players.forEach(p => {
      if (p.status === 'passed' || p.status === 'bidding') p.status = 'waiting';
      p.lastBid = 0;
    });
    gameState.currentBid = 0;
    gameState.highBidderId = null;
    gameState.turnIndex = 0;
    
    // Banker Slide Logic
    const refCard = gameState.bankerCards[0].card!;
    const currentBankerCard = gameState.bankerCards[gameState.currentCardIndex].card!;
    if (currentBankerCard.value > refCard.value) {
      gameState.bankerCards[gameState.currentCardIndex].slide = 'UP';
    } else if (currentBankerCard.value < refCard.value) {
      gameState.bankerCards[gameState.currentCardIndex].slide = 'DOWN';
    } else {
      gameState.bankerCards[gameState.currentCardIndex].slide = 'CENTERED';
    }
    
    gameState.log.push(`Banker moves to Card ${gameState.currentCardIndex + 1}. Slide: ${gameState.bankerCards[gameState.currentCardIndex].slide}`);
    
    const firstPlayer = gameState.players[0];
    if (firstPlayer.isAI) {
      setTimeout(() => aiDecision(firstPlayer), 1500);
    }
  }
  broadcastState();
}

function aiDecision(player: Player) {
  if (gameState.phase !== 'bidding' || gameState.players[gameState.turnIndex].id !== player.id) return;

  const bankerCard = gameState.bankerCards[gameState.currentCardIndex].card!;
  const distance = Math.abs(player.card!.value - bankerCard.value);
  
  let action: 'bid' | 'pass' | 'fold' | 'raise' = 'pass';
  let amount = 0;

  // Pot Gravity: If pot is high, AI is more likely to bid
  const potGravity = gameState.pot > 100 ? 0.1 : 0;
  const tiltBonus = (player as any).tilt || 0;
  
  // Bankroll Sensitivity: AI is more conservative if their balance is low
  const bankrollRatio = player.balance / 1000; // Assuming 1000 is starting balance
  const bankrollFactor = bankrollRatio < 0.2 ? -0.2 : (bankrollRatio < 0.5 ? -0.1 : 0);

  // Comfort Threshold: AI folds if the bid is too high relative to their balance
  // Hand strength (distance) significantly impacts how much they're willing to risk
  const handStrengthMultiplier = distance === 0 ? 0.8 : (distance <= 1 ? 0.6 : (distance <= 2 ? 0.4 : 0.2));
  const comfortThreshold = player.balance * handStrengthMultiplier; 
  const currentInvestment = gameState.currentBid - player.lastBid;

  if (gameState.highBidderId) {
    // In a bidding war
    // If the next bid would push them over their comfort threshold, they fold
    if ((gameState.currentBid + 5 - player.lastBid) > comfortThreshold) {
      handlePlayerAction(player, { type: 'fold' });
      return;
    }

    let chance = distance <= 2 ? 0.7 : (distance <= 5 ? 0.3 : 0.05);
    chance += potGravity + tiltBonus + bankrollFactor;
    if (Math.random() < chance) {
      action = 'raise';
      amount = gameState.currentBid + 5;
    } else {
      action = 'fold';
    }
  } else {
    // Initial decision
    let chance = distance <= 2 ? 0.7 : (distance <= 5 ? 0.3 : 0.1);
    chance += potGravity + tiltBonus + bankrollFactor;
    
    // If they have a poor hand and low bankroll, they are much more likely to pass
    if (distance > 3 && bankrollRatio < 0.5) chance -= 0.2;

    if (Math.random() < chance) {
      action = 'bid';
      amount = 10;
    } else {
      action = 'pass';
    }
  }

  handlePlayerAction(player, { type: action, amount });
}

function endRound() {
  gameState.phase = 'showdown';
  gameState.bankerCards.forEach(bc => bc.isRevealed = true);
  
  let winnerId: string | null = null;
  let minDistance = Infinity;
  
  const lockedPlayers = gameState.players.filter(p => p.status === 'locked');
  
  lockedPlayers.forEach(p => {
    const bankerCard = gameState.bankerCards[p.lockedCardIndex!].card!;
    const dist = Math.abs(p.card!.value - bankerCard.value);
    
    if (dist < minDistance) {
      minDistance = dist;
      winnerId = p.id;
    } else if (dist === minDistance && winnerId) {
      // Tie breakers
      const currentWinner = gameState.players.find(pw => pw.id === winnerId)!;
      const currentWinnerBankerCard = gameState.bankerCards[currentWinner.lockedCardIndex!].card!;
      
      // Color match
      const pColorMatch = p.card!.suit === bankerCard.suit || (p.card!.suit === 'Hearts' && bankerCard.suit === 'Diamonds') || (p.card!.suit === 'Diamonds' && bankerCard.suit === 'Hearts') || (p.card!.suit === 'Spades' && bankerCard.suit === 'Clubs') || (p.card!.suit === 'Clubs' && bankerCard.suit === 'Spades');
      // Wait, simpler color match:
      const pColor = (p.card!.suit === 'Hearts' || p.card!.suit === 'Diamonds') ? 'red' : 'black';
      const bColor = (bankerCard.suit === 'Hearts' || bankerCard.suit === 'Diamonds') ? 'red' : 'black';
      const pMatchesColor = pColor === bColor;

      const wColor = (currentWinner.card!.suit === 'Hearts' || currentWinner.card!.suit === 'Diamonds') ? 'red' : 'black';
      const wbColor = (currentWinnerBankerCard.suit === 'Hearts' || currentWinnerBankerCard.suit === 'Diamonds') ? 'red' : 'black';
      const wMatchesColor = wColor === wbColor;

      if (pMatchesColor && !wMatchesColor) {
        winnerId = p.id;
      } else if (pMatchesColor === wMatchesColor) {
        // Suit rank
        const SUIT_RANK: any = { 'Spades': 4, 'Hearts': 3, 'Diamonds': 2, 'Clubs': 1 };
        if (SUIT_RANK[p.card!.suit] > SUIT_RANK[currentWinner.card!.suit]) {
          winnerId = p.id;
        }
      }
    }
  });

  if (winnerId) {
    const winner = gameState.players.find(p => p.id === winnerId)!;
    const houseCut = Math.floor(gameState.pot * 0.05);
    const payout = gameState.pot - houseCut;
    winner.balance += payout;
    gameState.log.push(`SHOWDOWN: ${winner.name} wins the pot of $${payout}! (House took $${houseCut})`);
    
    // Reset tilt for winner, set tilt for others who lost a lot
    gameState.players.forEach(p => {
      if (p.id === winner.id) (p as any).tilt = 0;
      else if (p.isAI && gameState.pot > 50) (p as any).tilt = 0.2;
    });
  } else {
    gameState.log.push("SHOWDOWN: No one locked. House keeps the pot.");
  }

  gameState.phase = 'ended';
  broadcastState();

  // Restart after 10 seconds
  setTimeout(() => {
    resetGame();
  }, 10000);
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
