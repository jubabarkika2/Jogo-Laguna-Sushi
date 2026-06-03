import React, { useEffect, useRef, useState } from 'react';
import { GameState, CharacterType, GameObstacle, GameCollectible, GameParticle, HighScore, OrderInfo } from '../types';
import { soundManager } from '../utils/sound';
import { Play, RotateCcw, Volume2, VolumeX, Pause, Trophy, Info, Eye, Zap, Flame, ShieldAlert, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getLeaderboard, saveHighScoreToFirestore, testConnection } from '../utils/firebase';
import { getSupabaseLeaderboard, saveHighScoreToSupabase, isSupabaseConfigured } from '../utils/supabase';

interface SushiGameProps {
  order: OrderInfo;
  onMilestoneReached: (score: number) => void;
  gameScore: number;
  setGameScore: React.Dispatch<React.SetStateAction<number>>;
  onStartGame?: () => void;
}

export default function SushiGame({ order, onMilestoneReached, gameScore, setGameScore, onStartGame }: SushiGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Game Settings & States
  const [gameState, setGameState] = useState<GameState>('menu');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterType>('maki');
  const [muted, setMuted] = useState(false);
  const [lives, setLives] = useState(3);
  const [highScores, setHighScores] = useState<HighScore[]>([
    { name: 'Sushiman Jiro', score: 120, date: '03/06/2026' },
    { name: 'Motoboy Cleiton', score: 95, date: '02/06/2026', isOrderCourier: true },
    { name: 'Sushiwoman Sara 👩‍🍳', score: 70, date: '01/06/2026' }
  ]);
  const [showInstructions, setShowInstructions] = useState(false);
  const [playerName, setPlayerName] = useState('Seu Nome');

  // References for Animation & Loops
  const gameStateRef = useRef<GameState>('menu');
  const frameIdRef = useRef<number>(0);
  const obstaclesRef = useRef<GameObstacle[]>([]);
  const collectiblesRef = useRef<GameCollectible[]>([]);
  const particlesRef = useRef<GameParticle[]>([]);

  // Physics & Game Constants
  const BASE_WIDTH = 800;
  const BASE_HEIGHT = 400;
  const GROUND_Y = 320;

  // Player state variables
  const playerRef = useRef({
    x: 100,
    y: GROUND_Y - 50,
    width: 48,
    height: 48,
    vy: 0,
    gravity: 0.6,
    jumpForce: -12.5,
    isJumping: false,
    doubleJumpAvailable: true,
    isSliding: false,
    slideTimer: 0,
    rotation: 0,
    animFrame: 0,
    invulnerableFrames: 0
  });

  const levelDistanceRef = useRef(0);
  const speedScaleRef = useRef(1.0);
  const obstacleTimerRef = useRef(0);
  const collectibleTimerRef = useRef(0);

  // Background environments linking to OrderStatus
  const getThemeColors = () => {
    switch (order.status) {
      case 'received':
      case 'preparing':
        return {
          bgGradStart: '#1e112a', // Kitchen Tatami / warm Purple night
          bgGradEnd: '#0b0610',
          groundColor: '#421a10', // Bamboo brown board
          accentColor: '#ffa07a' // Salmon
        };
      case 'dispatched':
        return {
          bgGradStart: '#08142c', // Neon Tokyo City Dark Blue
          bgGradEnd: '#02050c',
          groundColor: '#1c2438', // Asphalt street slate
          accentColor: '#00ffff' // Cyan neon
        };
      case 'delivered':
        return {
          bgGradStart: '#021e17', // Japanese Garden / soft Green sunset
          bgGradEnd: '#010907',
          groundColor: '#073a25', // Raining moss grass
          accentColor: '#ffb7c5' // Sakura pink
        };
      default:
        return {
          bgGradStart: '#111827',
          bgGradEnd: '#030712',
          groundColor: '#1f2937',
          accentColor: '#ff6b6b'
        };
    }
  };

  // Sync state refs to avoid closure stale state in draw loop
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Load High scores from database with localstorage as fallback setup
  useEffect(() => {
    if (!isSupabaseConfigured) {
      testConnection(); // Verify connection on boot for Firebase if using Firebase
    }
    
    const loadScores = async () => {
      try {
        const scores = isSupabaseConfigured
          ? await getSupabaseLeaderboard()
          : await getLeaderboard();

        if (scores && scores.length > 0) {
          setHighScores(scores);
        } else {
          // If Database is empty/new, load the defaults or localstorage
          const saved = localStorage.getItem('sushi_delivery_scores');
          if (saved) {
            setHighScores(JSON.parse(saved));
          }
        }
      } catch (error) {
        console.error('Error loading cloud scores, fallback to local:', error);
        const saved = localStorage.getItem('sushi_delivery_scores');
        if (saved) {
          try {
            setHighScores(JSON.parse(saved));
          } catch (e) {
            console.error(e);
          }
        }
      }
    };
    
    loadScores();
  }, []);

  // Set Mute Status
  const handleToggleMute = () => {
    const isMuted = soundManager.toggleMute();
    setMuted(isMuted);
  };

  // Resize canvas responsively
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      
      if (rect.width < 640) {
        // On mobile, let the game occupies a taller aspect ratio to use vertical screen space
        // Maximize game canvas to fill more space beautifully
        const mobileHeight = Math.min(rect.width * 1.1, rect.height || 450);
        canvas.height = Math.max(mobileHeight, 350);
      } else {
        canvas.height = Math.min(rect.width * 0.5, 420); // Maintain 2:1 aspect ratio or caps at 420
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Event Listeners for Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current !== 'playing') return;

      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        triggerJump();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        triggerSlide(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') {
        triggerSlide(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Handle Game Loop
  useEffect(() => {
    if (gameState === 'playing') {
      frameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      cancelAnimationFrame(frameIdRef.current);
    }
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [gameState, selectedCharacter]);

  // Physics Actions
  const triggerJump = () => {
    const p = playerRef.current;
    if (!p.isJumping) {
      p.vy = p.jumpForce;
      p.isJumping = true;
      p.doubleJumpAvailable = true;
      p.isSliding = false;
      soundManager.playJump();
      createJumpDust(p.x + p.width / 2, p.y + p.height);
    } else if (p.doubleJumpAvailable) {
      p.vy = p.jumpForce * 0.85;
      p.doubleJumpAvailable = false;
      p.rotation = 0; // Trigger neat spin
      soundManager.playJump();
      createDoubleJumpRing(p.x + p.width / 2, p.y + p.height / 2);
    }
  };

  const triggerSlide = (active: boolean) => {
    const p = playerRef.current;
    if (active) {
      if (!p.isJumping) {
        p.isSliding = true;
        // Reduce vertical hitbox height to slide beneath sticks
        p.height = 24;
        p.y = GROUND_Y - 24;
      }
    } else {
      if (p.isSliding) {
        p.isSliding = false;
        p.height = 48;
        p.y = GROUND_Y - 48;
      }
    }
  };

  // Particles generator
  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        color,
        alpha: 1.0,
        size: Math.random() * 4 + 2,
        life: 30 + Math.random() * 20
      });
    }
  };

  const createJumpDust = (x: number, y: number) => {
    for (let i = 0; i < 6; i++) {
      particlesRef.current.push({
        x,
        y: y - 5,
        vx: -Math.random() * 2 - 1,
        vy: -Math.random() * 1,
        color: 'rgba(255, 255, 255, 0.4)',
        alpha: 0.6,
        size: Math.random() * 6 + 3,
        life: 20
      });
    }
  };

  const createDoubleJumpRing = (x: number, y: number) => {
    for (let i = 0; i < 360; i += 30) {
      const angle = (i * Math.PI) / 180;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        color: 'rgba(255, 127, 80, 0.6)',
        alpha: 0.8,
        size: 3,
        life: 15
      });
    }
  };

  const createSlideTrail = (x: number, y: number) => {
    if (Math.random() > 0.4) return;
    particlesRef.current.push({
      x,
      y,
      vx: -2 - Math.random() * 2,
      vy: -Math.random() * 0.5,
      color: 'rgba(255, 255, 255, 0.3)',
      alpha: 0.4,
      size: Math.random() * 5 + 2,
      life: 15
    });
  };

  // Main Logic Loop inside Animation Frame
  const gameLoop = (time: number) => {
    if (gameStateRef.current !== 'playing') return;

    updatePhysics();
    updateSpawners();
    drawGameOffscreen();

    frameIdRef.current = requestAnimationFrame(gameLoop);
  };

  const updatePhysics = () => {
    // 1. Player Physics
    const p = playerRef.current;

    if (p.isJumping) {
      p.vy += p.gravity;
      p.y += p.vy;

      if (selectedCharacter === 'maki') {
        p.rotation += 0.15; // Cool cylinder rolling
      } else if (selectedCharacter === 'temaki') {
        p.rotation += 0.08;
      }

      if (p.y >= GROUND_Y - p.height) {
        p.y = GROUND_Y - p.height;
        p.vy = 0;
        p.isJumping = false;
        p.doubleJumpAvailable = true;
        p.rotation = 0;
      }
    } else if (p.isSliding) {
      createSlideTrail(p.x, GROUND_Y - 5);
    } else {
      // Gentle running bounce
      p.animFrame += 0.15;
    }

    if (p.invulnerableFrames > 0) {
      p.invulnerableFrames--;
    }

    // 2. Adjust Difficulty speed based on overall score / progress
    speedScaleRef.current = 1.0 + Math.min(gameScore * 0.005, 0.8);

    // 3. Update obstacles
    obstaclesRef.current.forEach(obs => {
      obs.x -= obs.speed * speedScaleRef.current;

      // Check collision
      if (
        obs.x < p.x + p.width - 8 &&
        obs.x + obs.width > p.x + 8 &&
        obs.y < p.y + p.height - 4 &&
        obs.y + obs.height > p.y + 4
      ) {
        if (p.invulnerableFrames === 0) {
          handlePlayerHit();
        }
      }
    });

    // Remove passed obstacles
    obstaclesRef.current = obstaclesRef.current.filter(obs => {
      if (obs.x + obs.width < 0) {
        // Safe dodge point gain!
        setGameScore(s => {
          const newS = s + 5;
          if (newS > 0 && newS % 100 === 0) {
            soundManager.playScoreMilestone();
          }
          return newS;
        });
        return false;
      }
      return true;
    });

    // 4. Update collectibles
    collectiblesRef.current.forEach(col => {
      col.x -= 4.2 * speedScaleRef.current;
      col.pulse += 0.15;

      // Collect collision check
      if (
        col.x < p.x + p.width &&
        col.x + col.width > p.x &&
        col.y < p.y + p.height &&
        col.y + col.height > p.y
      ) {
        col.collected = true;
        let pointsEarned = col.points;

        // Custom bonus particles based on Sushi type!
        const colColor = col.type === 'soy_sauce' ? '#ffd700' : '#ff4500';
        createExplosion(col.x + col.width / 2, col.y + col.height / 2, colColor);

        setGameScore(s => {
          const newS = s + pointsEarned;
          // Trigger milestone sound if cross boundaries or hit target
          if (newS >= 200 && s < 200) {
            soundManager.playScoreMilestone();
            onMilestoneReached(newS);
          } else if (Math.floor(newS / 50) > Math.floor(s / 50)) {
            soundManager.playScoreMilestone();
          }
          return newS;
        });

        soundManager.playCollect();
      }
    });

    collectiblesRef.current = collectiblesRef.current.filter(col => !col.collected && col.x + col.width > 0);

    // 5. Update Particles
    particlesRef.current.forEach(part => {
      part.x += part.vx;
      part.y += part.vy;
      part.vy += 0.05; // Fall slowly
      part.life--;
      part.alpha = Math.max(part.life / 50, 0);
    });

    particlesRef.current = particlesRef.current.filter(part => part.life > 0);

    levelDistanceRef.current += 1 * speedScaleRef.current;
  };

  const updateSpawners = () => {
    obstacleTimerRef.current++;
    collectibleTimerRef.current++;

    // Spawn obstacles dynamically with random interval pacing
    const baseSpawnRate = 120 - Math.min(gameScore * 0.4, 45);
    if (obstacleTimerRef.current >= baseSpawnRate + (Math.random() * 50 - 25)) {
      obstacleTimerRef.current = 0;

      // Choose obstacle types
      const types: ('wasabi' | 'chopsticks' | 'cone' | 'pothole')[] = ['wasabi', 'chopsticks', 'cone', 'pothole'];
      const randType = types[Math.floor(Math.random() * types.length)];

      let height = 30;
      let width = 30;
      let y = GROUND_Y - height;

      if (randType === 'chopsticks') {
        // High floating chopsticks that you slide under or double-jump over
        width = 45;
        height = 14;
        y = GROUND_Y - 46;
      } else if (randType === 'pothole') {
        width = 40;
        height = 10;
        y = GROUND_Y - 5;
      }

      obstaclesRef.current.push({
        x: BASE_WIDTH,
        y,
        width,
        height,
        type: randType,
        speed: 5.5,
        passed: false
      });
    }

    // Spawn rich delicious collectibles (Sushis flying in air patterns!)
    if (collectibleTimerRef.current >= 80) {
      collectibleTimerRef.current = 0;

      const types: ('sushi_maki' | 'sushi_nigiri' | 'sushi_temaki' | 'soy_sauce' | 'ginger')[] = 
        ['sushi_maki', 'sushi_nigiri', 'sushi_temaki', 'soy_sauce'];
      const randType = types[Math.floor(Math.random() * types.length)];

      const heightY = GROUND_Y - 60 - Math.random() * 120; // different heights
      const points = randType === 'soy_sauce' ? 20 : 10;

      collectiblesRef.current.push({
        x: BASE_WIDTH,
        y: heightY,
        width: 25,
        height: 25,
        type: randType,
        points,
        collected: false,
        pulse: 0
      });
    }
  };

  const handlePlayerHit = () => {
    setLives(l => {
      const nextL = l - 1;
      playerRef.current.invulnerableFrames = 60; // 1 second protection
      createExplosion(playerRef.current.x + 24, playerRef.current.y + 24, '#ff3b30');

      if (nextL <= 0) {
        soundManager.playGameOver();
        setGameState('gameover');
        saveHighScore();
      } else {
        soundManager.playHit();
      }
      return nextL;
    });
  };

  const saveHighScore = async () => {
    const scoreItem: HighScore = {
      name: playerName.slice(0, 15) || 'Estrela Faminta',
      score: gameScore,
      date: new Date().toLocaleDateString('pt-BR')
    };

    // Save to Database in background
    if (isSupabaseConfigured) {
      try {
        await saveHighScoreToSupabase(scoreItem);
      } catch (err) {
        console.error('Could not save to Supabase:', err);
      }
    } else {
      try {
        await saveHighScoreToFirestore(scoreItem);
      } catch (err) {
        console.error('Could not save to Cloud Firestore:', err);
      }
    }

    // Save locally and update state immediately
    setHighScores(prev => {
      const updated = [...prev, scoreItem]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Keep top 5
      localStorage.setItem('sushi_delivery_scores', JSON.stringify(updated));
      return updated;
    });

    // Refresh from Database to retrieve any other player's scores
    try {
      const freshScores = isSupabaseConfigured
        ? await getSupabaseLeaderboard()
        : await getLeaderboard();
      if (freshScores && freshScores.length > 0) {
        setHighScores(freshScores);
      }
    } catch (err) {
      console.error('Error refreshing scoreboard:', err);
    }
  };

  // Graphics Custom Draw Operations inside Canvas Context
  const drawGameOffscreen = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Canvas and stretch base resolution
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Scale everything relative to base resolution
    const scale = canvas.width / BASE_WIDTH;
    ctx.scale(scale, scale);

    const virtualHeight = canvas.height / scale;

    // 1. Draw Environmental Beautiful Background Gradient linking to status
    const tCol = getThemeColors();
    const grad = ctx.createLinearGradient(0, 0, 0, virtualHeight);
    grad.addColorStop(0, tCol.bgGradStart);
    grad.addColorStop(1, tCol.bgGradEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BASE_WIDTH, virtualHeight);

    // Draw Parallax decorative assets based on level theme
    drawParallaxDecorations(ctx);

    // 2. Draw ground platform
    ctx.fillStyle = tCol.groundColor;
    ctx.fillRect(0, GROUND_Y, BASE_WIDTH, virtualHeight - GROUND_Y);
    // Draw neon lining on ground edge
    ctx.strokeStyle = tCol.accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(BASE_WIDTH, GROUND_Y);
    ctx.stroke();

    // 3. Draw obstacles
    obstaclesRef.current.forEach(obs => {
      ctx.save();
      if (obs.type === 'wasabi') {
        // Draw cute annoyed wasabi blob
        ctx.fillStyle = '#66cd11';
        ctx.strokeStyle = '#2e8b57';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.width / 2, obs.y);
        ctx.quadraticCurveTo(obs.x + obs.width, obs.y + obs.height, obs.x + obs.width, obs.y + obs.height);
        ctx.lineTo(obs.x, obs.y + obs.height);
        ctx.quadraticCurveTo(obs.x, obs.y + obs.height, obs.x + obs.width / 2, obs.y);
        ctx.fill();
        ctx.stroke();

        // Eyes & angry eyebrows
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(obs.x + 10, obs.y + 18, 2.5, 0, Math.PI * 2);
        ctx.arc(obs.x + 20, obs.y + 18, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        // eyebrows
        ctx.beginPath();
        ctx.moveTo(obs.x + 6, obs.y + 12);
        ctx.lineTo(obs.x + 12, obs.y + 15);
        ctx.moveTo(obs.x + 24, obs.y + 12);
        ctx.lineTo(obs.x + 18, obs.y + 15);
        ctx.stroke();
      } else if (obs.type === 'chopsticks') {
        // High chopsticks hurdle
        ctx.fillStyle = '#c59b6d';
        ctx.strokeStyle = '#5a3d21';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y + 4, obs.width, obs.height - 4, 3);
        ctx.fill();
        ctx.stroke();
        // Chopstick accent line
        ctx.fillStyle = '#8a0303';
        ctx.fillRect(obs.x + obs.width - 12, obs.y + 5, 8, obs.height - 6);
      } else if (obs.type === 'cone') {
        // Orange traffic hurdle
        ctx.fillStyle = '#ff5100';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.width / 2, obs.y);
        ctx.lineTo(obs.x + obs.width - 4, obs.y + obs.height);
        ctx.lineTo(obs.x + 4, obs.y + obs.height);
        ctx.closePath();
        ctx.fill();
        // White reflector stripes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(obs.x + obs.width / 2 - 5, obs.y + 10, 10, 8);
        // Base plate
        ctx.fillStyle = '#333333';
        ctx.fillRect(obs.x, obs.y + obs.height - 4, obs.width, 4);
      } else {
        // Pothole/spilled soy puddle
        ctx.fillStyle = 'rgba(29, 14, 4, 0.85)';
        ctx.strokeStyle = 'rgba(255, 127, 80, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });

    // 4. Draw Collectibles
    collectiblesRef.current.forEach(col => {
      ctx.save();
      const wave = Math.sin(col.pulse) * 3;
      const yOffset = col.y + wave;

      // Pulse circular halo glow
      ctx.fillStyle = col.type === 'soy_sauce' ? 'rgba(255, 215, 0, 0.15)' : 'rgba(250, 128, 114, 0.15)';
      ctx.beginPath();
      ctx.arc(col.x + col.width / 2, yOffset + col.height / 2, col.width * 1.0, 0, Math.PI * 2);
      ctx.fill();

      if (col.type === 'soy_sauce') {
        // Draw soy sauce gold pot
        ctx.fillStyle = '#DAA520';
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(col.x + 4, yOffset + 6, col.width - 8, col.height - 6, 4);
        ctx.fill();
        ctx.stroke();
        // Spout red cap
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(col.x + 8, yOffset + 1, col.width - 16, 5);
      } else if (col.type === 'sushi_maki') {
        // DRAW RED/GREEN CYLINDER MAKI
        ctx.fillStyle = '#17402a'; // Nori dark seaweed green
        ctx.beginPath();
        ctx.arc(col.x + col.width / 2, yOffset + col.height / 2, col.width / 2, 0, Math.PI * 2);
        ctx.fill();
        // Inner white rice circle
        ctx.fillStyle = '#fbfcfc';
        ctx.beginPath();
        ctx.arc(col.x + col.width / 2, yOffset + col.height / 2, col.width * 0.38, 0, Math.PI * 2);
        ctx.fill();
        // Core orange fish circle
        ctx.fillStyle = 'rgba(255, 99, 71, 0.9)';
        ctx.beginPath();
        ctx.arc(col.x + col.width / 2, yOffset + col.height / 2, col.width * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Draw elegant orange Nigiri slices
        // White Rice oval
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(col.x + col.width / 2, yOffset + col.height * 0.65, col.width * 0.45, col.height * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        // Orange Salmon topping
        ctx.fillStyle = '#fa8072';
        ctx.beginPath();
        ctx.ellipse(col.x + col.width / 2, yOffset + col.height * 0.4, col.width * 0.5, col.height * 0.22, 0.08, 0, Math.PI * 2);
        ctx.fill();
        // Little white food-stripes detailing salmon slice
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(col.x + 4, yOffset + col.height * 0.45);
        ctx.lineTo(col.x + 10, yOffset + col.height * 0.3);
        ctx.moveTo(col.x + 14, yOffset + col.height * 0.48);
        ctx.lineTo(col.x + 20, yOffset + col.height * 0.32);
        ctx.stroke();
      }
      ctx.restore();
    });

    // 5. Draw particles
    particlesRef.current.forEach(part => {
      ctx.save();
      ctx.globalAlpha = part.alpha;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 6. Draw Hero Player
    const p = playerRef.current;
    ctx.save();

    // Invulnerability blinking effect
    if (p.invulnerableFrames > 0 && Math.floor(p.invulnerableFrames / 4) % 2 === 0) {
      ctx.globalAlpha = 0.25;
    }

    ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
    ctx.rotate(p.rotation);

    if (selectedCharacter === 'maki') {
      // CUSTOM SUSHI MAKI HERO ARTWORKS
      // Seaweed body
      ctx.fillStyle = '#1e3518';
      ctx.strokeStyle = '#2e8b57';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Rice body
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, p.width * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Salmon meat center
      ctx.fillStyle = '#ff6b5a';
      ctx.beginPath();
      ctx.arc(0, 0, p.width * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Draw cute cartoon face inside!
      ctx.fillStyle = '#111111';
      // Blinking or jumping face expression
      if (p.isJumping) {
        // happy closed anime eyes: ^^
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-10, -2, 4, Math.PI, 0, false);
        ctx.arc(10, -2, 4, Math.PI, 0, false);
        ctx.stroke();
      } else {
        // Round open anime eyes
        ctx.beginPath();
        ctx.arc(-9, -2, 3.5, 0, Math.PI * 2);
        ctx.arc(9, -2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Highlight reflection dots
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-10.5, -3.5, 1.2, 0, Math.PI * 2);
        ctx.arc(7.5, -3.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rosy cheeks blushing details
      ctx.fillStyle = 'rgba(255, 105, 180, 0.55)';
      ctx.beginPath();
      ctx.arc(-14, 4, 3.5, 0, Math.PI * 2);
      ctx.arc(14, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Happy open smile
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 3, 4, 0, Math.PI, false);
      ctx.stroke();
    } else if (selectedCharacter === 'scooter') {
      // COOL MOTOBOY COURIER SUSHIMAN ON ELECTRICAL VESPA
      // Draw scooter body
      ctx.fillStyle = '#fa5a5a';
      ctx.strokeStyle = '#2e1111';
      ctx.lineWidth = 2;

      // Scooter chassis
      ctx.beginPath();
      ctx.roundRect(-22, 4, 40, p.height / 2 - 4, 6);
      ctx.fill();
      ctx.stroke();

      // Steering column
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8a9ea7';
      ctx.beginPath();
      ctx.moveTo(12, 4);
      ctx.lineTo(16, -14);
      ctx.stroke();

      // Handlebar
      ctx.fillStyle = '#333';
      ctx.fillRect(10, -18, 10, 4);

      // Cute round head on top wearing green wasabi helmet!
      ctx.fillStyle = '#fedbb4'; // Skin tone
      ctx.beginPath();
      ctx.arc(2, -15, 9, 0, Math.PI * 2);
      ctx.fill();

      // Green wasabi helmet
      ctx.fillStyle = '#6ab82e';
      ctx.beginPath();
      ctx.arc(1, -17, 10, Math.PI, 0);
      ctx.fill();
      // Helmet strap
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, -15);
      ctx.lineTo(2, -7);
      ctx.lineTo(8, -15);
      ctx.stroke();

      // Goggles
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(2, -21, 8, 4);

      // Delivery Backpack Box (Lacrada box) behind!
      ctx.fillStyle = '#ffe4b5';
      ctx.strokeStyle = '#c59b6d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-24, -14, 16, 20, 3);
      ctx.fill();
      ctx.stroke();
      // Logo sushi detailing on backpack box
      ctx.fillStyle = '#fa8072';
      ctx.beginPath();
      ctx.arc(-16, -4, 4, 0, Math.PI * 2);
      ctx.fill();

      // Wheels
      const spinAngle = p.animFrame;
      ctx.save();
      ctx.translate(-14, 18);
      ctx.rotate(spinAngle);
      drawScooterWheel(ctx);
      ctx.restore();

      ctx.save();
      ctx.translate(14, 18);
      ctx.rotate(spinAngle);
      drawScooterWheel(ctx);
      ctx.restore();
    } else {
      // BEAUTIFUL CUTE FEMALE SUSHIMAN (CHEF YUKI) ARTWORK
      // 1. Draw Chef white kimono/body robe
      ctx.fillStyle = '#ffffff'; // White kimono
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-16, 2, 32, p.height / 2 - 2, [0, 0, 4, 4]);
      ctx.fill();
      ctx.stroke();

      // Red Sash belt (Obi wrapper)
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.rect(-16, 12, 32, 6);
      ctx.fill();

      // Kimono overlapping folds (V-neck neckliner)
      ctx.strokeStyle = '#dfe4ea';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-10, 2);
      ctx.lineTo(0, 10);
      ctx.lineTo(10, 2);
      ctx.stroke();

      // 2. Head background hair layer (cute buns that bounce)
      ctx.fillStyle = '#1e272e'; // Silky black/dark-slate hair color
      const hairBounce = Math.sin(p.animFrame * 1.5) * 2.5;
      ctx.beginPath();
      ctx.arc(-16, -11 + hairBounce, 7, 0, Math.PI * 2); // left hair bun
      ctx.arc(16, -11 + hairBounce, 7, 0, Math.PI * 2);  // right hair bun
      ctx.fill();

      // Cute red ribbon ties for buns
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(-17, -7 + hairBounce, 3, 4);
      ctx.fillRect(14, -7 + hairBounce, 3, 4);

      // 3. Round cute head skin base
      ctx.fillStyle = '#fedbb4'; // warm skin tone
      ctx.beginPath();
      ctx.arc(0, -8, 14, 0, Math.PI * 2);
      ctx.fill();

      // 4. Front overlay hair (Bangs & sides framing face)
      ctx.fillStyle = '#1e272e';
      ctx.beginPath();
      ctx.arc(0, -11, 14, Math.PI, 0); // Hair bangs cap
      ctx.fill();

      // Side strands
      ctx.beginPath();
      ctx.moveTo(-14, -8);
      ctx.lineTo(-14, 0);
      ctx.lineTo(-10, -4);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(14, -8);
      ctx.lineTo(14, 0);
      ctx.lineTo(10, -4);
      ctx.closePath();
      ctx.fill();

      // 5. White Hachimaki (Chef headband) with red sun symbol
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-12, -16, 24, 5); // Headband strip

      // Red sun emblem in center of headband
      ctx.fillStyle = '#fc3d39';
      ctx.beginPath();
      ctx.arc(0, -13.5, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Back hanging headband tie ribbons
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-12, -14);
      ctx.lineTo(-18, -17 + Math.sin(p.animFrame) * 1.5);
      ctx.moveTo(-12, -14);
      ctx.lineTo(-17, -11 + Math.sin(p.animFrame + 1) * 1.5);
      ctx.stroke();

      // 6. Draw eyes & face expressions based on state
      ctx.fillStyle = '#111111';
      if (p.isJumping) {
        // Joyful closed anime eyes ^^ when jumping/double jumping
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-6, -8, 3, Math.PI, 0, false);
        ctx.arc(6, -8, 3, Math.PI, 0, false);
        ctx.stroke();
      } else {
        // Beautiful shiny rounded cartoon eyes
        ctx.beginPath();
        ctx.arc(-5.5, -8, 3.2, 0, Math.PI * 2);
        ctx.arc(5.5, -8, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Shiny reflections
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-6.5, -9, 0.9, 0, Math.PI * 2);
        ctx.arc(4.5, -9, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rosy blush on cheeks
      ctx.fillStyle = 'rgba(255, 105, 180, 0.65)';
      ctx.beginPath();
      ctx.arc(-10, -4, 2.5, 0, Math.PI * 2);
      ctx.arc(10, -4, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Cute smile
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, -3.5, 2.5, 0, Math.PI, false);
      ctx.stroke();
    }

    ctx.restore(); // Restore Player Transform
    ctx.restore(); // Restore Base Resolution scale
  };

  const drawScooterWheel = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wheel hubs lines showing rolling movement
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.moveTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.stroke();
  };

  const drawParallaxDecorations = (ctx: CanvasRenderingContext2D) => {
    // 3 layers of distant elements depending on delivery status!
    const dist = levelDistanceRef.current;

    if (order.status === 'received' || order.status === 'preparing') {
      // KITCHEN BACKDROP: Traditional lanterns, bamboo blinds
      ctx.fillStyle = 'rgba(255, 235, 205, 0.05)';
      // Draw 3 tatami sliding panel frames
      for (let i = 0; i < 4; i++) {
        const xCoord = (i * 260 - (dist * 0.15)) % (BASE_WIDTH + 100);
        ctx.fillRect(xCoord, 10, 180, GROUND_Y - 20);
        ctx.strokeStyle = 'rgba(120, 80, 40, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(xCoord, 10, 180, GROUND_Y - 20);
      }

      // Draw red decorative lanterns glowing up high
      ctx.fillStyle = 'rgba(250, 40, 10, 0.4)';
      for (let i = 0; i < 3; i++) {
        const xLantern = (i * 320 - (dist * 0.25)) % (BASE_WIDTH + 100);
        ctx.beginPath();
        ctx.roundRect(xLantern, 20, 25, 38, 5);
        ctx.fill();
        // Yellow lantern glow
        ctx.fillStyle = 'rgba(255, 215, 0, 0.255)';
        ctx.beginPath();
        ctx.arc(xLantern + 12.5, 39, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(250, 40, 10, 0.4)';
      }
    } else if (order.status === 'dispatched') {
      // TOKYO STREETS: Neon outline towers, skyline silhouettes
      ctx.fillStyle = 'rgba(15, 24, 48, 0.4)';
      for (let i = 0; i < 5; i++) {
        const xBuilding = (i * 220 - (dist * 0.1)) % (BASE_WIDTH + 120);
        const wBuilding = 140;
        const hBuilding = 240 + (i % 2) * 80; // MUCH taller buildings (was 160 + (i % 2) * 50)
        ctx.fillRect(xBuilding, GROUND_Y - hBuilding, wBuilding, hBuilding);

        // Grid windows
        ctx.fillStyle = 'rgba(255, 255, 50, 0.09)';
        const rows = Math.min(8, Math.floor((hBuilding - 30) / 30));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.fillRect(xBuilding + 15 + c * 40, GROUND_Y - hBuilding + 15 + r * 30, 20, 15);
          }
        }
        ctx.fillStyle = 'rgba(15, 24, 48, 0.4)';
      }

      // Beautiful glowing distant mountains (Mt Fuji lookalike)
      ctx.fillStyle = 'rgba(18, 12, 38, 0.65)';
      ctx.beginPath();
      ctx.moveTo(400 - (dist * 0.04) % 1000, GROUND_Y);
      ctx.lineTo(550 - (dist * 0.04) % 1000, 120); // slightly higher peak
      ctx.lineTo(590 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(740 - (dist * 0.04) % 1000, GROUND_Y);
      ctx.fill();

      // Fuji snow cap outline
      ctx.fillStyle = 'rgba(255, 250, 250, 0.5)';
      ctx.beginPath();
      ctx.moveTo(515 - (dist * 0.04) % 1000, 150);
      ctx.lineTo(550 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(590 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(625 - (dist * 0.04) % 1000, 150);
      ctx.fill();
    } else {
      // SACRED SAKURA GARDEN: Cherry trees raining petals
      // Huge Glowing full Golden Moon
      ctx.fillStyle = 'rgba(255, 223, 137, 0.25)';
      ctx.beginPath();
      ctx.arc(640, 90, 50, 0, Math.PI * 2);
      ctx.fill();
      // Moon corona halo ring
      ctx.strokeStyle = 'rgba(255, 223, 137, 0.05)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(640, 90, 62, 0, Math.PI * 2);
      ctx.stroke();

      // Tree silhouette trunk
      ctx.fillStyle = 'rgba(14, 42, 33, 0.8)';
      ctx.beginPath();
      const treeX = 180 - (dist * 0.15) % 1000;
      ctx.moveTo(treeX, GROUND_Y);
      ctx.quadraticCurveTo(treeX + 15, GROUND_Y - 120, treeX + 5, GROUND_Y - 220); // taller tree
      ctx.lineTo(treeX + 18, GROUND_Y - 220);
      ctx.quadraticCurveTo(treeX + 25, GROUND_Y - 110, treeX + 45, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      // Cherry blossom canopy fluff circles
      ctx.fillStyle = '#ffb7c5';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(treeX - 10, GROUND_Y - 228, 65, 0, Math.PI * 2); // wider leaves
      ctx.arc(treeX + 25, GROUND_Y - 235, 75, 0, Math.PI * 2);
      ctx.arc(treeX + 10, GROUND_Y - 190, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Single flying sakura petals drifting right down
      ctx.fillStyle = '#ffb7c5';
      for (let i = 0; i < 12; i++) {
        const petalX = (i * 90 - (dist * 0.5)) % (BASE_WIDTH + 60);
        const petalY = (15 * i + (dist * 0.23)) % 320;
        ctx.beginPath();
        ctx.ellipse(petalX, petalY, 5, 2.5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const handleStartGame = () => {
    setLives(3);
    setGameScore(0);
    levelDistanceRef.current = 0;
    obstaclesRef.current = [];
    collectiblesRef.current = [];
    particlesRef.current = [];

    // Reset player position refs
    const p = playerRef.current;
    p.x = 110;
    p.y = GROUND_Y - 48;
    p.vy = 0;
    p.isJumping = false;
    p.isSliding = false;
    p.rotation = 0;
    p.invulnerableFrames = 0;

    soundManager.playScoreMilestone();
    setGameState('playing');
    onStartGame?.();
  };

  return (
    <div className="flex flex-col h-full flex-1 bg-slate-950 border border-slate-900/50 rounded-2xl overflow-hidden shadow-2xl relative select-none font-sans" id="game-arcade-screen">
      {/* Top Console Bar */}
      <div className="p-2.5 sm:p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Logo element resembling game tag */}
          <div className="h-7 sm:h-9 px-2 sm:px-3 bg-gradient-to-r from-salmon-500 to-amber-500 text-slate-950 rounded-lg flex items-center justify-center font-black tracking-tight text-xs sm:text-sm shadow-lg shadow-salmon-500/20 shrink-0">
            🍣 <span className="hidden xs:inline ml-1">SUSHI RUSH</span>
          </div>
          <div>
            <h3 className="text-[10px] sm:text-xs font-bold font-mono tracking-wider text-slate-400 capitalize">
              Fase: {order.status === 'received' || order.status === 'preparing' ? '1. Cozinha' : order.status === 'dispatched' ? '2. Trânsito' : '3. Jardim'}
            </h3>
          </div>
        </div>

        {/* Live score and lives displays */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 bg-slate-950/80 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-slate-900/45">
            <span className="text-[9px] font-mono text-slate-500 hidden sm:inline">PONTOS:</span>
            <span className="font-mono text-xs sm:text-sm font-black text-amber-400 min-w-[24px] sm:min-w-[36px] text-right">{gameScore}</span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 text-sm sm:text-lg">
            {[1, 2, 3].map((heart) => (
              <span
                key={heart}
                className={`transition-transform duration-300 ${
                  heart <= lives ? 'text-red-500 scale-100' : 'text-slate-800 scale-90'
                }`}
              >
                ❤️
              </span>
            ))}
          </div>

          <button
            onClick={handleToggleMute}
            className="p-1 sm:p-1.5 bg-slate-800 hover:bg-slate-700/80 rounded-lg text-slate-300 transition-colors cursor-pointer"
            title="Mute"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Space */}
      <div className="relative flex-1 bg-slate-950 min-h-[450px] xs:min-h-[490px] sm:min-h-[470px] md:min-h-[520px] shadow-inner flex items-center justify-center overflow-hidden" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="block w-full max-w-full cursor-pointer touch-none bg-slate-950 border-b border-slate-900"
          onClick={gameState === 'playing' ? triggerJump : undefined}
        />

        {/* --- OVERLAY SCREENS DEPENDING ON GAME STATES --- */}
        <AnimatePresence mode="wait">
          {/* 1. Start Main Menu Screen */}
          {gameState === 'menu' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 sm:p-8 text-center z-10 overflow-y-auto"
            >
              {/* Animated Floating Sushi */}
              <motion.div 
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 2.5 }}
                className="w-14 h-14 sm:w-20 sm:h-20 bg-salmon-500 rounded-full flex items-center justify-center text-3xl sm:text-5xl shadow-xl shadow-salmon-500/20 mb-4 xs:mb-5 sm:mb-6 shrink-0"
              >
                🍣
              </motion.div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex items-center gap-2">
                Sushi Rush Online
              </h2>
              <p className="text-xs sm:text-sm md:text-base text-slate-350 mt-2 mb-5 xs:mb-7 sm:mb-9 max-w-sm leading-relaxed">
                Divirta-se enquanto espera seu pedido. Marque mais de <span className="text-amber-400 font-extrabold">200 pontos</span> e receberá um cupom!
              </p>

              {/* Name field input */}
              <div className="mb-5 xs:mb-7 sm:mb-9 w-full max-w-[220px] sm:max-w-[280px]">
                <input
                  type="text"
                  id="game-player-name"
                  placeholder="Seu Nome..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full text-center bg-slate-900/90 border border-slate-800 text-slate-100 text-xs sm:text-sm px-4 py-3 rounded-xl sm:rounded-2xl focus:outline-none focus:border-salmon-500/40"
                />
              </div>

              <div className="flex flex-col items-center gap-4 w-full max-w-[240px] sm:max-w-[320px]">
                <button
                  onClick={() => setGameState('character_select')}
                  id="btn-character-select"
                  className="w-full py-3.5 sm:py-4 px-6 sm:px-8 bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 hover:brightness-110 active:scale-[0.98] transition-all text-slate-950 font-black text-xs sm:text-sm tracking-widest rounded-full shadow-xl shadow-orange-500/25 cursor-pointer flex items-center justify-center gap-2 uppercase"
                >
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-slate-950 stroke-none" />
                  <span>JOGAR AGORA</span>
                </button>
                <button
                  onClick={() => setShowInstructions(true)}
                  id="btn-show-instructions"
                  className="px-5 sm:px-6 py-2 bg-slate-900/60 hover:bg-slate-850 transition-all text-slate-400 hover:text-slate-200 font-bold text-xs rounded-full border border-slate-800/80 cursor-pointer"
                >
                  Controles
                </button>
              </div>
            </motion.div>
          )}

          {/* 2. Character Choice Select Screen */}
          {gameState === 'character_select' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 sm:p-8 text-center z-10 overflow-y-auto"
            >
              <h3 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-white mb-2 sm:mb-3">
                Selecione seu Herói do Sushi! 🥋
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-5 xs:mb-7 sm:mb-9 font-medium">Cada um tem um jeito especial de correr.</p>

              <div className="grid grid-cols-3 gap-3 sm:gap-4.5 max-w-md mb-6 xs:mb-8 sm:mb-10">
                {/* Maki choice */}
                <button
                  onClick={() => setSelectedCharacter('maki')}
                  id="char-select-maki"
                  className={`p-3 sm:p-4.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center ${
                    selectedCharacter === 'maki'
                      ? 'bg-salmon-500/10 border-salmon-500 text-white shadow-xl shadow-salmon-500/5'
                      : 'bg-slate-900/65 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2.5">🍣</span>
                  <span className="text-xs sm:text-sm font-black">Maki Ninja</span>
                  <span className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-tight hidden xs:block">Corta o vento!</span>
                </button>

                {/* Scooter choice */}
                <button
                  onClick={() => setSelectedCharacter('scooter')}
                  id="char-select-scooter"
                  className={`p-3 sm:p-4.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center ${
                    selectedCharacter === 'scooter'
                      ? 'bg-salmon-500/10 border-salmon-500 text-white shadow-xl shadow-salmon-500/5'
                      : 'bg-slate-900/65 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2.5">🛵</span>
                  <span className="text-xs sm:text-sm font-black">Cleiton Moto</span>
                  <span className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-tight hidden xs:block">Moto veloz!</span>
                </button>

                {/* Temaki choice */}
                <button
                  onClick={() => setSelectedCharacter('temaki')}
                  id="char-select-temaki"
                  className={`p-3 sm:p-4.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center ${
                    selectedCharacter === 'temaki'
                      ? 'bg-salmon-500/10 border-salmon-500 text-white shadow-xl shadow-salmon-500/5'
                      : 'bg-slate-900/65 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2.5">👩‍🍳</span>
                  <span className="text-xs sm:text-sm font-black">Sushiwoman Sara</span>
                  <span className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-tight hidden xs:block">Salto duplo!</span>
                </button>
              </div>

              <div className="flex gap-3.5 w-full max-w-[220px] sm:max-w-[260px]">
                <button
                  onClick={handleStartGame}
                  id="btn-character-start-game"
                  className="flex-1 py-3 sm:py-3.5 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 hover:brightness-110 active:scale-[0.98] transition-all text-slate-950 font-black text-xs sm:text-sm tracking-widest rounded-full shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2 uppercase"
                >
                  Começar! 🏁
                </button>
                <button
                  onClick={() => setGameState('menu')}
                  className="py-3 sm:py-3.5 px-4 sm:px-5 bg-slate-900 hover:bg-slate-850 transition-all text-slate-400 font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl border border-slate-800 cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          )}

          {/* 3. Game Over Screen Overlay */}
          {gameState === 'gameover' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 sm:p-8 text-center z-10 overflow-y-auto"
            >
              <Award className="w-12 h-12 sm:w-16 sm:h-16 text-slate-400 mb-3 sm:mb-4 stroke-1 shrink-0 animate-pulse" />
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-rose-500 tracking-tight">Fim de Jogo! 🛑</h2>
              <p className="text-xs sm:text-sm md:text-base text-slate-300 mt-2 mb-4 xs:mb-6 sm:mb-8 leading-relaxed max-w-sm">
                {playerName}, seu herói caiu no trânsito! Mas se divertiu e somou <span className="text-amber-400 font-bold">{gameScore} pontos</span>.
              </p>

              {/* Reward prompt directly */}
              {gameScore >= 200 ? (
                <div className="mb-5 xs:mb-7 sm:mb-9 bg-amber-500/15 border border-amber-500/30 px-4 py-2.5 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl max-w-sm text-xs sm:text-sm text-amber-300 leading-snug">
                  ✨ Você obteve {gameScore} pontos! Clique em <strong>Cupom</strong> na barra superior ou continue jogando!
                </div>
              ) : (
                <p className="text-[10px] sm:text-xs text-slate-500 mb-5 xs:mb-7 sm:mb-9 leading-normal max-w-sm">
                  Chegue a pelo menos <span className="font-bold text-salmon-400">200 pontos</span> para ganhar um cupom de desconto real de 5% OFF! Falta pouco!
                </p>
              )}

              <div className="flex gap-3 sm:gap-4">
                <button
                  onClick={handleStartGame}
                  className="px-5 sm:px-7 py-3 sm:py-3.5 bg-salmon-500 hover:bg-salmon-600 transition-all text-white font-black text-xs sm:text-sm rounded-xl sm:rounded-2xl flex items-center gap-1.5 sm:gap-2 shadow-lg cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Repetir
                </button>
                <button
                  onClick={() => setGameState('character_select')}
                  className="px-4 sm:px-6 py-3 sm:py-3.5 bg-slate-900 hover:bg-slate-850 transition-all text-slate-300 font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl border border-slate-800 cursor-pointer"
                >
                  Personagem
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 4. Instructions popup modal inside Canvas screen */}
        <AnimatePresence>
          {showInstructions && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 sm:p-8 text-slate-200 z-20 text-center overflow-y-auto"
            >
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white mb-3 sm:mb-5">Como Jogar: Sushi Rush 🍱</h3>
              <div className="space-y-3 sm:space-y-4 text-left text-xs sm:text-sm md:text-base text-slate-300 max-w-sm mb-5 sm:mb-7 leading-relaxed">
                <div className="flex gap-3 items-start">
                  <div className="bg-slate-900 border border-slate-800 px-2 py-1 text-[10px] sm:text-xs font-bold rounded font-mono shrink-0">ESPAÇO / ↑</div>
                  <span>Pula! Pressione 2x no ar para o <strong>Salto Duplo</strong>.</span>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="bg-slate-900 border border-slate-800 px-2 py-1 text-[10px] sm:text-xs font-bold rounded font-mono shrink-0">SETA ↓</div>
                  <span>Escorrega/Abaixa! Deslize sob os hashis fáceis.</span>
                </div>
                <div className="flex gap-3 items-start text-salmon-400">
                  <span className="text-base sm:text-lg">⭐️</span>
                  <span><strong>Dispositivos Móveis:</strong> Use os botões abaixo da tela do jogo para saltar e deslizar com alta precisão!</span>
                </div>
              </div>

              <button
                onClick={() => setShowInstructions(false)}
                className="px-6 sm:px-8 py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs sm:text-sm font-bold rounded-xl sm:rounded-2xl cursor-pointer"
              >
                Entendi!
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Arcade controls floor panel, great for touch devices */}
      {gameState === 'playing' && (
        <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800/80 flex md:hidden items-stretch justify-around gap-3.5 select-none h-20 sm:h-24 shrink-0">
          <button
            onTouchStart={() => triggerSlide(true)}
            onTouchEnd={() => triggerSlide(false)}
            onMouseDown={() => triggerSlide(true)}
            onMouseUp={() => triggerSlide(false)}
            id="mobile-btn-slide"
            className="flex-1 bg-slate-950 active:bg-slate-800 border border-slate-800/80 rounded-2xl flex items-center justify-center flex-col text-slate-300 cursor-pointer text-sm gap-1 focus:outline-none"
          >
            <span className="text-xl sm:text-2xl">👇</span>
            <span className="font-bold text-[10px] sm:text-[11px] tracking-wider uppercase font-mono">Deslizar</span>
          </button>

          <button
            onClick={triggerJump}
            id="mobile-btn-jump"
            className="flex-1 bg-salmon-500 active:bg-salmon-600 text-white rounded-2xl flex items-center justify-center flex-col shadow-lg shadow-salmon-500/10 cursor-pointer text-sm gap-1 focus:outline-none"
          >
            <span className="text-xl sm:text-2xl">⚡️</span>
            <span className="font-bold text-[10px] sm:text-[11px] tracking-wider uppercase font-mono">Pular</span>
          </button>
        </div>
      )}

      {/* High Scoreboard footer list toggler */}
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-950 flex flex-col xs:flex-row items-center justify-between gap-1 xs:gap-3 text-[10px] sm:text-[11px] text-slate-500 border-t border-slate-900 select-all font-mono">
        <span className="flex items-center gap-1 shrink-0">
          <Trophy className="w-3 h-3 text-amber-500" />
          RANKING DO DELIVERY:
        </span>
        <div className="flex gap-2 sm:gap-3 overflow-hidden text-[9px] sm:text-[10.5px]">
          {highScores.map((hs, i) => (
            <span key={hs.name} className={`${hs.isOrderCourier ? 'text-amber-400 font-bold' : ''}`}>
              #{i+1} {hs.name.slice(0, 7)} ({hs.score}p)
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
