import { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    RANKS.forEach((rank, index) => {
      deck.push({
        suit,
        rank,
        value: index + 1
      });
    });
  }
  return shuffle(deck);
}

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function calculateDistance(card1: Card, card2: Card): number {
  return Math.abs(card1.value - card2.value);
}
