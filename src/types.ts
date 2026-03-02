
export type Suit = 'Spades' | 'Hearts' | 'Diamonds' | 'Clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // 1 to 13
}

export type PlayerStatus = 'waiting' | 'bidding' | 'locked' | 'folded' | 'passed';

export interface Player {
  id: string;
  name: string;
  card: Card | null;
  balance: number;
  status: PlayerStatus;
  lockedCardIndex: number | null; // 0 to 3
  isAI: boolean;
  lastBid: number;
  tilt?: number;
}

export type SlideState = 'UP' | 'DOWN' | 'CENTERED' | 'NONE';

export interface BankerCard {
  card: Card | null;
  isRevealed: boolean;
  slide: SlideState;
  lockedPlayerId: string | null;
}

export interface GameState {
  roomId: string;
  players: Player[];
  bankerCards: BankerCard[];
  currentCardIndex: number; // 0 to 3
  pot: number;
  currentBid: number;
  highBidderId: string | null;
  turnIndex: number;
  phase: 'waiting' | 'ante' | 'bidding' | 'showdown' | 'ended';
  log: string[];
}

export const SUIT_RANK: Record<Suit, number> = {
  'Spades': 4,
  'Hearts': 3,
  'Diamonds': 2,
  'Clubs': 1
};

export const COLOR_MAP: Record<Suit, 'red' | 'black'> = {
  'Spades': 'black',
  'Hearts': 'red',
  'Diamonds': 'red',
  'Clubs': 'black'
};
