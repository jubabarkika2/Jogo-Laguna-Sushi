import React, { useState, useEffect, useRef } from 'react';
import { OrderInfo, OrderStatus, ChatMessage } from '../types';
import { Clock, ShoppingBag, MapPin, Send, MessageSquare, Flame, CheckCircle, ChefHat, Bike, Compass, HeartHandshake } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OrderTrackerProps {
  order: OrderInfo;
  setOrder: React.Dispatch<React.SetStateAction<OrderInfo>>;
  onAdvanceStatus: (nextStatus: OrderStatus) => void;
  gameScore: number;
}

export default function OrderTracker({ order, setOrder, onAdvanceStatus, gameScore }: OrderTrackerProps) {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'kitchen',
      text: 'Olá! Recebemos seu pedido por aqui. O sushiman já preparou a faca yanagiba e os ingredientes frescos! 🔪🍣',
      timestamp: new Date(),
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Simulate automatic status advancement or countdown
  useEffect(() => {
    const timer = setInterval(() => {
      if (order.timeRemaining > 0 && order.status !== 'delivered') {
        setOrder(prev => ({
          ...prev,
          timeRemaining: prev.timeRemaining - 1
        }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [order.status, order.timeRemaining, setOrder]);

  // Trigger contextual messages when order status changes
  useEffect(() => {
    let text = '';
    let sender: 'kitchen' | 'delivery' = 'kitchen';

    if (order.status === 'preparing') {
      text = 'Seu pedido entrou em preparação! O arroz do sushi (shari) está sendo temperado perfeitamente e o salmão premium está sendo cortado no capricho. Enjoy the game! 👨‍🍳🔥';
    } else if (order.status === 'dispatched') {
      sender = 'delivery';
      text = 'Uhu! O motoboy Cleiton acelerou a moto! Suas embalagens térmicas lacradas estão a caminho para garantir que tudo chegue fresquinho e os rolinhos quentes estejam crocantes. 🛵💨';
    } else if (order.status === 'delivered') {
      sender = 'delivery';
      text = 'Cleiton informou que chegou no portão! Seu banquete japonês acaba de ser entregue. Muito obrigado por escolher o nosso Sushi Delivery! Bom apetite! 🍣❤️🏆';
    }

    if (text) {
      setIsTyping(true);
      const delay = setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: String(Date.now()),
            sender,
            text,
            timestamp: new Date()
          }
        ]);
        setIsTyping(false);
      }, 1500);
      return () => clearTimeout(delay);
    }
  }, [order.status]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: String(Date.now() + 1),
      sender: 'user',
      text: inputText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // Contextual bot reply
    setTimeout(() => {
      let replyText = 'Estamos focados em preparar seu sushi com perfeição samurai! Continue coletando pontos no jogo! 🍣🥋';
      const prompt = userMsg.text.toLowerCase();

      if (prompt.includes('demora') || prompt.includes('tempo') || prompt.includes('atras') || prompt.includes('demorar')) {
        if (order.status === 'preparing') {
          replyText = 'O arroz do sushi está no ponto perfeito e os sashimis estão sendo montados. Tempo estimado: aprox. ' + Math.ceil(order.timeRemaining / 60) + ' minutinhos! Segura a ansiedade no joguinho!';
        } else if (order.status === 'dispatched') {
          replyText = 'O Cleiton é o piloto mais rápido de delivery da avenida! Ele já está pertinho de colar no seu endereço. Segura os hashis!';
        } else {
          replyText = 'Nosso clã está voando! Seu pedido acabará de chegar logo logo.';
        }
      } else if (prompt.includes('wasabi') || prompt.includes('gengibre') || prompt.includes('shoyu')) {
        replyText = 'Adicionamos sachês adicionais de shoyu premium, gengibre fatiado doce artesanal e aquela porção caprichada de wasabi forte! 🥢🔥';
      } else if (prompt.includes('cupom') || prompt.includes('desconto')) {
        replyText = 'Sabia que se você coletar pelo menos 80 pontos no Jogo do Sushi você ganha um cupom de 5% OFF de verdade no próximo pedido? Jogue para vencer! 🎟️✨';
      } else if (prompt.includes('bebida') || prompt.includes('refrigerante') || prompt.includes('coca')) {
        replyText = 'A bebida está acondicionada no compartimento isolado e ultra-gelado da mochila do motoboy! Vai chegar trincando! 🥤❄️';
      } else if (prompt.includes('obrigado') || prompt.includes('valeu') || prompt.includes('obrigada')) {
        replyText = 'Nós que agradecemos pela preferência, mestre do sushi! Divirta-se jogando e bom apetite ao receber!';
      } else if (prompt.includes('fome') || prompt.includes('comer')) {
        replyText = 'Dá até água na boca ver sushis flutuando no jogo, né? Falta pouquinho! Continue correndo no jogo para acalmar as lombrigas! 😋';
      }

      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 2),
          sender: order.status === 'dispatched' ? 'delivery' : 'kitchen',
          text: replyText,
          timestamp: new Date()
        }
      ]);
      setIsTyping(false);
    }, 1200);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const getStatusStepClass = (stepStatus: OrderStatus) => {
    const orderStatusPriority: Record<OrderStatus, number> = {
      received: 1,
      preparing: 2,
      dispatched: 3,
      delivered: 4
    };

    const currentPriority = orderStatusPriority[order.status];
    const stepPriority = orderStatusPriority[stepStatus];

    if (currentPriority > stepPriority) {
      return 'bg-emerald-500 text-white border-emerald-500';
    } else if (currentPriority === stepPriority) {
      return 'bg-salmon-500 text-white border-salmon-500 animate-pulse ring-4 ring-salmon-500/20';
    } else {
      return 'bg-slate-800 text-slate-500 border-slate-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative" id="order-tracker-panel">
      {/* Interactive Kitchen / Motoboy Live Chat */}
      <div className="flex-1 flex flex-col min-h-[400px]">
        {/* Chat Title */}
        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-salmon-400" />
            Fale com a Cozinha & Entrega
          </span>
          <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Cleiton & Clã Online
          </span>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/60 custom-scrollbar max-h-[380px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
            >
              <div className="flex items-center gap-1 text-[9px] font-mono font-semibold text-slate-400 mb-0.5">
                <span className="capitalize">
                  {msg.sender === 'user' ? 'Você (Cliente)' : msg.sender === 'kitchen' ? 'Sushiman Chef' : 'Motoboy Cleiton'}
                </span>
                <span className="opacity-60">•</span>
                <span>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div
                className={`p-3 rounded-2xl text-xs leading-relaxed border ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-salmon-600 to-salmon-500 text-white border-salmon-400/20 rounded-tr-none shadow-md shadow-salmon-550/10'
                    : msg.sender === 'delivery'
                    ? 'bg-slate-800 text-slate-100 border-slate-700/80 rounded-tl-none shadow-sm'
                    : 'bg-slate-950 text-slate-200 border-slate-850/80 rounded-tl-none shadow-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex flex-col items-start max-w-[80%] mr-auto">
              <span className="text-[9px] font-mono font-semibold text-slate-400 mb-0.5">Cleiton está digitando...</span>
              <div className="p-3 bg-slate-950/80 border border-slate-850 text-slate-400 rounded-2xl rounded-tl-none flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-salmon-500 round rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-salmon-500 round rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-salmon-500 round rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
          <input
            type="text"
            id="chat-input-text"
            placeholder="Pergunte sobre shoyu, entrega ou wasabi..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-salmon-500/50 focus:ring-2 focus:ring-salmon-500/10 placeholder-slate-500"
          />
          <button
            type="submit"
            id="chat-send-btn"
            className="p-2 bg-salmon-500 hover:bg-salmon-600 transition-colors text-white rounded-xl shadow-lg shadow-salmon-500/20 active:scale-95 duration-100 flex items-center justify-center cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
