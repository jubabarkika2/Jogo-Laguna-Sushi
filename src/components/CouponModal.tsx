import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Copy, Check, X, ShieldAlert, Sparkles, Gift } from 'lucide-react';
import { soundManager } from '../utils/sound';

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  couponCode: string;
  discountValue: string;
  score: number;
}

export default function CouponModal({ isOpen, onClose, couponCode, discountValue, score }: CouponModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback if clipboard API is blocked in iframe
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl relative z-10 overflow-hidden text-center text-slate-100"
            id="coupon-reward-modal"
          >
            {/* Top decorative circle patterns */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-salmon-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -z-10 pointer-events-none" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Gold Trophy Icon */}
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-xl shadow-yellow-500/20 mb-5 relative">
              <Award className="w-9 h-9 text-slate-950 stroke-[2]" />
              <Sparkles className="w-4 h-4 text-white absolute -top-1.5 -right-1.5 animate-pulse" />
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 opacity-30 blur animate-pulse -z-10" />
            </div>

            {/* Congratulations */}
            <h3 className="text-2xl font-black tracking-tight text-white mb-2">
              Banquete Desbloqueado! 🍣🎉
            </h3>
            <p className="text-slate-300 text-sm mb-5 leading-relaxed">
              Você atingiu uma pontuação incrível de <span className="font-bold text-salmon-400 text-base">{score} pontos</span> desviando dos perigos do delivery! Para recompensar seu apetite samurai, liberamos um cupom especial:
            </p>

            {/* Coupon Code Block */}
            <div className="bg-slate-950 border border-slate-900 p-5 rounded-2xl mb-5 space-y-3 relative group">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5 text-salmon-400" />
                  CUPOM EXCLUSIVO
                </span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
                  {discountValue}
                </span>
              </div>

              <div className="flex gap-2 items-stretch">
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 flex items-center justify-center font-mono text-xl font-black text-amber-400 tracking-wider">
                  {couponCode}
                </div>
                <button
                  onClick={handleCopy}
                  id="copy-coupon-btn"
                  className={`px-4 rounded-xl flex items-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                    copied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-salmon-500 hover:bg-salmon-600 text-white shadow-lg shadow-salmon-500/20 active:scale-95'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10.5px] text-slate-500 font-medium">
                Válido para pedidos efetuados hoje! Informe este código na finalização ou no chat.
              </p>
            </div>

            {/* Note on wait */}
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-900/50 flex gap-2.5 items-center text-left text-[11px] text-slate-400 leading-snug">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Dica: Mostre esta tela para o motoboy Cleiton caso ele já esteja chegando para garantir seu presentinho!</span>
            </div>

            {/* Continue Button */}
            <button
              onClick={onClose}
              className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
            >
              Continuar Jogando 🎮
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
