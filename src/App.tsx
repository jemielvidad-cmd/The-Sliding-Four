import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { LucideIcon, User, Cpu, Wallet, Trophy, History, ArrowUp, ArrowDown, Minus, Info, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GameState, Player, BankerCard, Card as CardType, Suit, COLOR_MAP } from './types';

const JAZZ_MUSIC_URL = 'https://cdn.pixabay.com/audio/2022/05/27/audio_180873748b.mp3';

interface CardProps {
  card: CardType | null;
  isRevealed: boolean;
  label?: string;
  slide?: string;
  isLocked?: boolean;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  'Spades': '♠',
  'Hearts': '♥',
  'Diamonds': '♦',
  'Clubs': '♣'
};

const Card = ({ card, isRevealed, label, slide, isLocked }: CardProps) => {
  const isRed = card && (card.suit === 'Hearts' || card.suit === 'Diamonds');
  
  return (
    <div className="flex flex-col items-center gap-2">
      {label && <span className="text-[10px] font-mono uppercase tracking-widest text-text-secondary">{label}</span>}
      <motion.div 
        layout
        initial={{ y: 0 }}
        animate={{ 
          y: slide === 'UP' ? -40 : slide === 'DOWN' ? 40 : 0,
          scale: isLocked ? 1.05 : 1
        }}
        className={`relative w-24 h-36 rounded-lg border-2 flex items-center justify-center transition-colors duration-300 ${
          isLocked ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-white/10'
        } ${isRevealed ? 'bg-white text-black shadow-xl' : 'bg-card-bg'}`}
      >
        {isRevealed && card ? (
          <div className={`flex flex-col items-center justify-between w-full h-full p-2 ${isRed ? 'text-red-600' : 'text-black'}`}>
            <div className="flex justify-between w-full">
              <span className="text-lg font-bold leading-none">{card.rank}</span>
              <span className="text-lg leading-none">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <span className="text-4xl">{SUIT_SYMBOLS[card.suit]}</span>
            <div className="flex justify-between w-full rotate-180">
              <span className="text-lg font-bold leading-none">{card.rank}</span>
              <span className="text-lg leading-none">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20">
            <div className="w-16 h-24 border-2 border-dashed border-white/30 rounded-md" />
          </div>
        )}
        {slide && slide !== 'NONE' && (
          <div className="absolute -right-6 top-1/2 -translate-y-1/2 flex flex-col items-center">
            {slide === 'UP' && <ArrowUp size={16} className="text-emerald-400" />}
            {slide === 'DOWN' && <ArrowDown size={16} className="text-rose-400" />}
            {slide === 'CENTERED' && <Minus size={16} className="text-amber-400" />}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('stateUpdate', (state: GameState) => {
      setGameState(state);
      if (state.phase === 'ended') {
        const me = state.players.find(p => p.id === newSocket.id);
        const winner = state.log[state.log.length - 1].includes(me?.name || '');
        if (winner) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.log]);

  const handleJoin = () => {
    if (socket && name) {
      socket.emit('join', name);
      setJoined(true);
      
      // Start music on user interaction
      if (audioRef.current) {
        audioRef.current.volume = 0.3;
        audioRef.current.play().catch(e => console.log("Audio play blocked:", e));
      }
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleAction = (type: 'bid' | 'pass' | 'fold' | 'raise', amount?: number) => {
    socket?.emit('action', { type, amount });
  };

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <div className="w-full max-w-md p-8 bg-card-bg border border-white/10 rounded-2xl shadow-2xl">
          <h1 className="text-4xl font-bold mb-2 tracking-tighter text-center">THE SLIDING FOUR</h1>
          <p className="text-text-secondary text-sm mb-8 text-center uppercase tracking-widest">Multiplayer Deduction Engine</p>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="ENTER OPERATOR NAME"
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20"
            >
              INITIALIZE SESSION
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="p-8 font-mono text-emerald-500">CONNECTING TO ENGINE...</div>;

  const me = gameState.players.find(p => p.id === socket?.id);
  const isMyTurn = gameState.phase === 'bidding' && gameState.players[gameState.turnIndex]?.id === socket?.id;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col lg:flex-row overflow-x-hidden max-w-[100vw]">
      <audio ref={audioRef} src={JAZZ_MUSIC_URL} loop />
      
      {/* Sidebar - Players & Stats (Top Bar on Mobile) */}
      <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-white/10 bg-card-bg p-4 lg:p-6 flex flex-col gap-4 lg:gap-6 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] lg:text-xs font-mono uppercase tracking-widest text-text-secondary">Active Session</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleMute}
              className="text-text-secondary hover:text-white transition-colors"
              title={isMuted ? "Unmute Music" : "Mute Music"}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] lg:text-[10px] font-mono text-emerald-500">LIVE</span>
            </div>
          </div>
        </div>

        {/* Horizontal scroll on mobile for players if many, or just grid */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-hide">
          {gameState.players.map((p, i) => (
            <div 
              key={p.id} 
              className={`p-2 lg:p-3 rounded-xl border transition-all min-w-[140px] lg:min-w-0 flex-shrink-0 ${
                gameState.turnIndex === i ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 bg-black/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1 lg:mb-2">
                <div className="flex items-center gap-1.5 lg:gap-2">
                  {p.isAI ? <Cpu size={12} className="text-amber-400" /> : <User size={12} className="text-blue-400" />}
                  <span className="text-[11px] lg:text-sm font-medium truncate max-w-[80px] lg:max-w-[120px]">{p.name}</span>
                </div>
                <span className={`text-[8px] lg:text-[10px] font-mono px-1 py-0.5 rounded uppercase ${
                  p.status === 'locked' ? 'bg-emerald-500/20 text-emerald-400' :
                  p.status === 'folded' ? 'bg-rose-500/20 text-rose-400' :
                  p.status === 'bidding' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-white/5 text-text-secondary'
                }`}>
                  {p.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] lg:text-xs font-mono text-text-secondary">
                <div className="flex items-center gap-1">
                  <Wallet size={10} />
                  <span>${p.balance}</span>
                </div>
                {p.lockedCardIndex !== null && <span className="text-emerald-500 text-[8px] lg:text-[10px]">LOCKED C{p.lockedCardIndex + 1}</span>}
              </div>
              
              {/* Show player card during showdown or if it's the current player */}
              {(gameState.phase === 'showdown' || gameState.phase === 'ended' || p.id === socket?.id) && p.card && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className={`text-[10px] font-bold ${COLOR_MAP[p.card.suit] === 'red' ? 'text-rose-500' : 'text-white'}`}>
                    {p.card.rank}{SUIT_SYMBOLS[p.card.suit]}
                  </span>
                  <div className={`w-4 h-6 rounded-[2px] bg-white flex items-center justify-center text-[8px] font-bold ${COLOR_MAP[p.card.suit] === 'red' ? 'text-red-600' : 'text-black'}`}>
                    {p.card.rank[0]}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto hidden lg:flex flex-col border-t border-white/10 pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono text-text-secondary uppercase">Grand Pot</span>
            <span className="text-xl font-bold text-emerald-500">${gameState.pot}</span>
          </div>
          <div className="p-4 rounded-xl bg-black/40 border border-white/5">
            <div className="text-[10px] font-mono text-text-secondary uppercase mb-2">Your Hand</div>
            {me?.card ? (
              <div className="flex items-center justify-between">
                <span className={`text-lg font-bold ${COLOR_MAP[me.card.suit] === 'red' ? 'text-rose-500' : 'text-white'}`}>
                  {me.card.rank} {SUIT_SYMBOLS[me.card.suit]}
                </span>
                <div className={`w-8 h-12 rounded border border-white/20 bg-white flex items-center justify-center ${COLOR_MAP[me.card.suit] === 'red' ? 'text-red-600' : 'text-black'}`}>
                  <span className="text-xl font-bold">{SUIT_SYMBOLS[me.card.suit]}</span>
                </div>
              </div>
            ) : (
              <span className="text-xs italic text-text-secondary">Waiting for deal...</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Mobile Stats Bar */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-black/40 border-b border-white/10">
          <div className="flex flex-col">
            <span className="text-[8px] font-mono text-text-secondary uppercase">Grand Pot</span>
            <span className="text-sm font-bold text-emerald-500">${gameState.pot}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-mono text-text-secondary uppercase">Your Hand</span>
              {me?.card ? (
                <span className={`text-[10px] font-bold ${COLOR_MAP[me.card.suit] === 'red' ? 'text-rose-500' : 'text-white'}`}>
                  {me.card.rank}{SUIT_SYMBOLS[me.card.suit]}
                </span>
              ) : (
                <span className="text-[8px] italic text-text-secondary">...</span>
              )}
            </div>
          </div>
        </div>

        {/* Banker Row */}
        <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-12 max-w-full">
            {gameState.bankerCards.map((bc, i) => (
              <div key={i} className="flex justify-center">
                <Card 
                  card={bc.card}
                  isRevealed={bc.isRevealed}
                  label={`Card ${i + 1}${i === 0 ? ' (REF)' : ''}`}
                  slide={bc.slide}
                  isLocked={!!bc.lockedPlayerId}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 lg:p-8 border-t border-white/10 bg-card-bg/50 backdrop-blur-md sticky bottom-0 z-10">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 lg:gap-6">
            <div className="flex flex-col gap-0.5 lg:gap-1 items-center md:items-start">
              <span className="text-[8px] lg:text-[10px] font-mono text-text-secondary uppercase tracking-widest">Current Phase</span>
              <div className="flex items-center gap-2 lg:gap-3">
                <span className="text-sm lg:text-lg font-bold uppercase tracking-tight">
                  {gameState.phase === 'bidding' ? `Bidding: Card ${gameState.currentCardIndex + 1}` : gameState.phase}
                </span>
                {gameState.currentBid > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-mono">
                    ${gameState.currentBid}
                  </span>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isMyTurn ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 lg:gap-3 w-full md:w-auto"
                >
                  {gameState.currentBid === 0 ? (
                    <>
                      <button 
                        onClick={() => handleAction('bid', 10)}
                        className="flex-1 md:flex-none px-4 lg:px-6 py-2.5 lg:py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-xs lg:text-base transition-all shadow-lg shadow-emerald-900/20"
                      >
                        BID $10
                      </button>
                      <button 
                        onClick={() => handleAction('pass')}
                        className="flex-1 md:flex-none px-4 lg:px-6 py-2.5 lg:py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-xs lg:text-base transition-all"
                      >
                        PASS
                      </button>
                      <button 
                        onClick={() => handleAction('fold')}
                        className="flex-1 md:flex-none px-4 lg:px-6 py-2.5 lg:py-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded-xl font-bold text-xs lg:text-base transition-all"
                      >
                        FOLD
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleAction('raise', gameState.currentBid + 5)}
                        className="flex-1 md:flex-none px-4 lg:px-6 py-2.5 lg:py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-xs lg:text-base transition-all shadow-lg shadow-blue-900/20"
                      >
                        RAISE ${gameState.currentBid + 5}
                      </button>
                      <button 
                        onClick={() => handleAction('fold')}
                        className="flex-1 md:flex-none px-4 lg:px-6 py-2.5 lg:py-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded-xl font-bold text-xs lg:text-base transition-all"
                      >
                        FOLD
                      </button>
                    </>
                  )}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center md:items-end gap-1">
                  <div className="text-text-secondary font-mono text-[10px] lg:text-sm animate-pulse">
                    {gameState.phase === 'waiting' ? 'WAITING FOR PLAYERS...' : 
                     gameState.phase === 'ended' ? 'ROUND ENDED' :
                     gameState.phase === 'showdown' ? 'SHOWDOWN IN PROGRESS' :
                     `WAITING FOR ${gameState.players[gameState.turnIndex]?.name.toUpperCase()}...`}
                  </div>
                  {me?.status === 'locked' && (
                    <div className="flex items-center gap-1.5 text-emerald-500 text-[8px] lg:text-[10px] font-mono uppercase tracking-widest">
                      <Trophy size={10} />
                      <span>Locked to Card {me.lockedCardIndex! + 1}</span>
                    </div>
                  )}
                  {me?.status === 'folded' && (
                    <div className="flex items-center gap-1.5 text-rose-500 text-[8px] lg:text-[10px] font-mono uppercase tracking-widest">
                      <Info size={10} />
                      <span>You have Folded</span>
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Log - Right Panel (Bottom on Mobile) */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/40 p-4 lg:p-6 flex flex-col h-48 lg:h-auto shrink-0">
        <div className="flex items-center gap-2 mb-3 lg:mb-6">
          <History size={12} className="text-text-secondary" />
          <h2 className="text-[10px] lg:text-xs font-mono uppercase tracking-widest text-text-secondary">System Logs</h2>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 lg:space-y-3 font-mono text-[9px] lg:text-[11px] leading-relaxed scrollbar-hide">
          {gameState.log.map((entry, i) => (
            <div key={i} className="text-text-secondary border-l border-white/10 pl-2 lg:pl-3 py-0.5 lg:py-1">
              <span className="text-emerald-500/50 mr-1.5 lg:mr-2">[{i.toString().padStart(3, '0')}]</span>
              {entry}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
