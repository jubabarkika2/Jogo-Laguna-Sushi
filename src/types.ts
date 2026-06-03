export type OrderStatus = 'received' | 'preparing' | 'dispatched' | 'delivered';

export interface OrderInfo {
  number: string;
  status: OrderStatus;
  timeRemaining: number; // in seconds
  items: { name: string; qty: number }[];
  address: string;
}

export type CharacterType = 'maki' | 'scooter' | 'temaki';

export type GameState = 'menu' | 'character_select' | 'playing' | 'paused' | 'gameover' | 'victory';

export interface GameObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'wasabi' | 'chopsticks' | 'cone' | 'pothole';
  speed: number;
  passed: boolean;
}

export interface GameCollectible {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'sushi_maki' | 'sushi_nigiri' | 'sushi_temaki' | 'soy_sauce' | 'ginger';
  points: number;
  collected: boolean;
  pulse: number;
}

export interface GameParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  life: number;
}

export interface HighScore {
  name: string;
  score: number;
  date: string;
  isOrderCourier?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'kitchen' | 'delivery';
  text: string;
  timestamp: Date;
}
