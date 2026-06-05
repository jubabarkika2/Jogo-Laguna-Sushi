import React, { useState } from 'react';
import { OrderInfo, OrderStatus } from './types';
import SushiGame from './components/SushiGame';
import { soundManager } from './utils/sound';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // 1. Core Order State for Tracker
  const [order, setOrder] = useState<OrderInfo>({
    number: '3084',
    status: 'preparing',
    timeRemaining: 1680, // 28:00 minutes
    items: [
      { name: 'Combo Rodízio Especial', qty: 1 },
      { name: 'Temaki Filadélfia Supreme', qty: 2 },
      { name: 'Guaraná Antarctica 350ml', qty: 1 }
    ],
    address: 'Av. Paulista, 1000 - Apto 82'
  });

  const [gameScore, setGameScore] = useState(0);

  // Triggered when client crosses milestone targets
  const handleMilestoneReached = (score: number) => {
    // Does nothing now that coupons are removed
  };

  const handleAdvanceStatus = (nextStatus: OrderStatus) => {
    setOrder(prev => {
      // Set remaining time dynamically based on status chosen
      let time = prev.timeRemaining;
      if (nextStatus === 'received') time = 1800;
      else if (nextStatus === 'preparing') time = 1500;
      else if (nextStatus === 'dispatched') time = 600;
      else if (nextStatus === 'delivered') time = 0;

      return {
        ...prev,
        status: nextStatus,
        timeRemaining: time
      };
    });
  };

  const handleGameStart = () => {
    setOrder(prev => ({
      ...prev,
      timeRemaining: 3600 // 60 minutes in seconds
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-salmon-500/20 selection:text-salmon-300">
      
      {/* Decorative Neon Header Logo & Delivery banner */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-3 sm:px-4 py-2.5 sm:py-3 select-none">
        <div className="max-w-7xl mx-auto flex flex-row flex-nowrap items-center justify-between gap-2.5 sm:gap-4">
          
          {/* Logo Brand with custom Japanese elements */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-salmon-500 via-rose-500 to-amber-500 flex items-center justify-center text-lg sm:text-2xl shadow-lg shadow-salmon-500/10 shrink-0">
              🍣
            </div>
            <div>
              <h1 className="text-xs sm:text-base font-black tracking-tight text-white flex items-center gap-1 uppercase">
                LAGUNA SUSHI <span className="text-[9px] sm:text-[10px] bg-salmon-500/20 text-salmon-400 font-mono font-bold px-1 py-0.5 rounded border border-salmon-500/35 leading-none shrink-0 hidden xs:inline-block">DELIVERY</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-400 leading-tight hidden xs:block">Desvie dos obstáculos e avance pelas fases!</p>
            </div>
          </div>

          {/* Center Info Status Header box */}
          <div className="hidden md:flex gap-6 text-xs bg-slate-950/40 px-4 py-2 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-300 font-medium font-mono">STATUS DO JOGADOR:</span>
              <span className="font-bold text-amber-400 font-mono">
                {gameScore >= 300 ? '⚔️ SAMURAI DO SUSHI ⚔️' : '🥋 APRENDIZ 🥋'}
              </span>
            </div>
          </div>

          {/* Right Navigation / Rewards Access panel */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

            <div className="flex gap-1 items-center bg-slate-950 px-1.5 py-1 xs:px-2 xs:py-1.5 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl border border-slate-800 font-mono text-[9px] xs:text-[10px] sm:text-[11px] text-slate-400 shrink-0">
              <span className="hidden xs:inline text-slate-400">Espera:</span>
              <span className="font-semibold text-slate-200">
                {order.status === 'delivered' ? 'Entregue' : `~${Math.ceil(order.timeRemaining / 60)} min`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workstation Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-2 sm:p-4 md:p-6 flex flex-col gap-4">
        {/* Main game board */}
        <SushiGame
          order={order}
          onMilestoneReached={handleMilestoneReached}
          gameScore={gameScore}
          setGameScore={setGameScore}
          onStartGame={handleGameStart}
        />
      </main>

      {/* Aesthetic lacquered footer */}
      <footer className="bg-slate-950 py-6 border-t border-slate-900 text-center text-xs text-slate-600 font-mono flex items-center justify-center px-6 max-w-7xl w-full mx-auto select-none">
        <p className="flex items-center gap-1.5">
          <span>🎎 Jogo do Laguna Sushi Delivery @2026</span>
        </p>
      </footer>
      
    </div>
  );
}
