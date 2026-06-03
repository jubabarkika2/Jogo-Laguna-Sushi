import React, { useState } from 'react';
import { OrderInfo, OrderStatus } from './types';
import SushiGame from './components/SushiGame';
import CouponModal from './components/CouponModal';
import { soundManager } from './utils/sound';
import { Gift } from 'lucide-react';
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
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [hasUnlockedCoupon, setHasUnlockedCoupon] = useState(false);

  // Triggered when client crosses 200 pts target
  const handleMilestoneReached = (score: number) => {
    if (!hasUnlockedCoupon) {
      setHasUnlockedCoupon(true);
      setIsCouponModalOpen(true);
      soundManager.playVictory();
    }
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
        <div className="max-w-7xl mx-auto flex flex-row flex-wrap sm:flex-nowrap items-center justify-between gap-3 sm:gap-4">
          
          {/* Logo Brand with custom Japanese elements */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-salmon-500 via-rose-500 to-amber-500 flex items-center justify-center text-xl sm:text-2xl shadow-lg shadow-salmon-500/10 shrink-0">
              🍣
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1 uppercase">
                LAGUNA SUSHI <span className="text-[9px] sm:text-[10px] bg-salmon-500/20 text-salmon-400 font-mono font-bold px-1 py-0.5 rounded border border-salmon-500/35 leading-none shrink-0">DELIVERY</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-400 leading-tight">Jogue e ganhe descontos reais!</p>
            </div>
          </div>

          {/* Center Info Status Header box */}
          <div className="hidden md:flex gap-6 text-xs bg-slate-950/40 px-4 py-2 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-300 font-medium font-mono">STATUS DO JOGADOR:</span>
              <span className="font-bold text-amber-400 font-mono">
                {gameScore >= 200 ? '⚔️ SAMURAI DO SUSHI ⚔️' : '🥋 APRENDIZ 🥋'}
              </span>
            </div>
          </div>

          {/* Right Navigation / Rewards Access panel */}
          <div className="flex items-center gap-2 shrink-0">
            <AnimatePresence>
              {hasUnlockedCoupon && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [1, 1.05, 1], opacity: 1 }}
                  transition={{ repeat: Infinity, repeatDelay: 4, duration: 0.8 }}
                  onClick={() => setIsCouponModalOpen(true)}
                  id="coupon-indicator-btn"
                  className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-[10px] sm:text-[11px] px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl flex items-center gap-1 shadow-md shadow-amber-500/15 cursor-pointer border border-yellow-400/30"
                >
                  <Gift className="w-3.5 h-3.5 text-slate-950 animate-bounce" />
                  <span className="hidden xs:inline">CUPOM</span> <span>5% OFF!</span>
                </motion.button>
              )}
            </AnimatePresence>

            <div className="flex gap-1 items-center bg-slate-950 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl border border-slate-800 font-mono text-[10px] sm:text-[11px] text-slate-400 shrink-0">
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
      <footer className="bg-slate-950 py-6 border-t border-slate-900 text-center text-xs text-slate-600 font-mono flex flex-col md:flex-row items-center justify-between px-6 max-w-7xl w-full mx-auto select-none">
        <p className="flex items-center gap-1.5">
          <span>🎎 Jogo do Delivery fabricado artesanalmente © 2026.</span>
        </p>
        <p className="text-[10px] text-slate-600 mt-2 md:mt-0">
          Suporte: <strong>(11) 99999-SUSHI</strong> • Termos e Condições do Clã.
        </p>
      </footer>

      {/* Coupon Modal triggered on victories */}
      <CouponModal
        isOpen={isCouponModalOpen}
        onClose={() => setIsCouponModalOpen(false)}
        couponCode="SUSHI_GAMER_5"
        discountValue="5% OFF"
        score={gameScore}
      />
      
    </div>
  );
}
