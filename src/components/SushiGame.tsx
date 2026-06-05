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
  const [levelNotification, setLevelNotification] = useState<string | null>(null);
  const [showPhaseTransitionBanner, setShowPhaseTransitionBanner] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<number>(2);
  const isPhaseTransitionOpenRef = useRef(false);

  useEffect(() => {
    isPhaseTransitionOpenRef.current = showPhaseTransitionBanner;
  }, [showPhaseTransitionBanner]);

  // References for Animation & Loops
  const gameStateRef = useRef<GameState>('menu');
  const frameIdRef = useRef<number>(0);
  const obstaclesRef = useRef<GameObstacle[]>([]);
  const collectiblesRef = useRef<GameCollectible[]>([]);
  const particlesRef = useRef<GameParticle[]>([]);
  const canvasPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCanvasLongPressRef = useRef(false);
  const canvasPressStartRef = useRef(0);

  const gameScoreRef = useRef(gameScore);
  
  // Synchronize gameScore value immediately during render phase to keep animation loops fresh
  gameScoreRef.current = gameScore;

  // Physics & Game Constants
  const BASE_WIDTH = 800;
  const BASE_HEIGHT = 400;
  const GROUND_Y = 360;

  // Player state variables
  const playerRef = useRef({
    x: 100,
    y: GROUND_Y - 48,
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

  const getLevelIndex = (score: number): number => {
    if (score < 400) return 0;
    if (score < 600) return 1;
    if (score < 850) return 2;
    if (score < 1001) return 3;
    if (score < 1400) return 4;
    return 5;
  };

  const getLevelFromScore = (score: number): number => {
    return getLevelIndex(score) + 1;
  };

  // Background environments linking to OrderStatus
  const getThemeColors = (score = gameScoreRef.current) => {
    const levelIndex = getLevelIndex(score);
    switch (levelIndex) {
      case 0: // Level 1 (0-399)
        return {
          bgGradStart: '#1e112a', // Kitchen Tatami / warm Purple night
          bgGradEnd: '#0b0610',
          groundColor: '#421a10', // Bamboo brown board
          accentColor: '#ffa07a', // Salmon
          name: '1. Cozinha Ryotei 🍙'
        };
      case 1: // Level 2 (400-599)
        return {
          bgGradStart: '#4fc3f7', // Beautiful light sky blue
          bgGradEnd: '#b3e5fc',   // Gentle morning light
          groundColor: '#607d8b', // Slate grey asphalt
          accentColor: '#ff9800', // Daylight sun orange
          name: '2. Cidade de Dia ☀️'
        };
      case 2: // Level 3 (600-849)
        return {
          bgGradStart: '#4a607a', // Overcast dark blue/grey daytime sky
          bgGradEnd: '#90a4ae',   // Pale rainy horizon light
          groundColor: '#263238', // Wet graphite dark road asphalt
          accentColor: '#80d8ff', // Sky blue rainy glow
          name: '3. Chuva na Cidade 🌧️'
        };
      case 3: // Level 4 (850-1000)
        return {
          bgGradStart: '#04020f', // Deep infinite outer space black
          bgGradEnd: '#140c28',   // Glowing cosmos purple/violet sky
          groundColor: '#100b21', // Dark obsidian space rock platform
          accentColor: '#e040fb', // Stellar neon magenta glow
          name: '4. Espaço Sideral 🌌'
        };
      case 4: // Level 5 (1001-1399)
        return {
          bgGradStart: '#020d1a', // Abyssal zone darkest blue
          bgGradEnd: '#082545',   // Deep ocean teal-blue
          groundColor: '#0a162b', // Dark sandy seabed trench floor
          accentColor: '#00e5ff', // Luminescent cyan/turquoise glow
          name: '5. Fundo do Mar 🌊'
        };
      case 5: // Level 6 (1400+)
        return {
          bgGradStart: '#0f2027', // Snowy Glacier Blue
          bgGradEnd: '#203a43',
          groundColor: '#eceff1', // Ice snow floor
          accentColor: '#33b5e5', // Frozen icy cyan
          name: '6. Pico Fuji Gelado 🏔️'
        };
      default:
        return {
          bgGradStart: '#111827',
          bgGradEnd: '#030712',
          groundColor: '#1f2937',
          accentColor: '#ff6b6b',
          name: '1. Cozinha Ryotei 🍙'
        };
    }
  };

  // Sync state refs to avoid closure stale state in draw loop
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Score base levels observer to play sound milestone and update phase state notifications
  const lastLevelRef = useRef(1);
  const levelTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (levelTimerRef.current) {
        clearTimeout(levelTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      const currentLevel = getLevelFromScore(gameScore);
      if (currentLevel > lastLevelRef.current) {
        // Trigger 3D banner if transitioning from Level 1 to Level 2, or Level 2 to Level 3
        if (lastLevelRef.current === 1 && currentLevel === 2) {
          setTransitionPhase(2);
          setShowPhaseTransitionBanner(true);
          soundManager.playVictory();
        } else if (lastLevelRef.current === 2 && currentLevel === 3) {
          setTransitionPhase(3);
          setShowPhaseTransitionBanner(true);
          soundManager.playVictory();
        } else if (lastLevelRef.current === 3 && currentLevel === 4) {
          setTransitionPhase(4);
          setShowPhaseTransitionBanner(true);
          soundManager.playVictory();
        } else if (lastLevelRef.current === 4 && currentLevel === 5) {
          setTransitionPhase(5);
          setShowPhaseTransitionBanner(true);
          soundManager.playVictory();
        } else {
          soundManager.playScoreMilestone();
        }

        lastLevelRef.current = currentLevel;
        
        const levelNames = [
          'Cozinha Ryotei 🍙',
          'Cidade de Dia ☀️',
          'Chuva na Cidade 🌧️',
          'Espaço Sideral 🌌',
          'Fundo do Mar 🌊',
          'Pico Fuji Gelado 🏔️'
        ];
        const nextName = levelNames[(currentLevel - 1) % 6];
        setLevelNotification(`FASE ${currentLevel}!\n${nextName}`);

        if (levelTimerRef.current) {
          clearTimeout(levelTimerRef.current);
        }
        levelTimerRef.current = setTimeout(() => {
          setLevelNotification(null);
          levelTimerRef.current = null;
        }, 2200);
      }
    } else if (gameState === 'menu' || gameState === 'character_select') {
      lastLevelRef.current = 1;
      setLevelNotification(null);
      setShowPhaseTransitionBanner(false);
      if (levelTimerRef.current) {
        clearTimeout(levelTimerRef.current);
        levelTimerRef.current = null;
      }
    }
  }, [gameScore, gameState]);

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

  const handleCanvasPressStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchstart') {
      if (gameStateRef.current === 'playing') {
        e.preventDefault();
      }
    }

    if (gameStateRef.current !== 'playing') return;

    // Clear any previous timer
    if (canvasPressTimerRef.current) {
      clearTimeout(canvasPressTimerRef.current);
    }

    isCanvasLongPressRef.current = false;
    canvasPressStartRef.current = Date.now();

    // Set 220ms threshold for long click (abaixar/slide)
    canvasPressTimerRef.current = setTimeout(() => {
      isCanvasLongPressRef.current = true;
      triggerSlide(true);
    }, 220);
  };

  const handleCanvasPressEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchend' || e.type === 'touchcancel') {
      if (gameStateRef.current === 'playing') {
        e.preventDefault();
      }
    }

    if (gameStateRef.current !== 'playing') return;

    if (canvasPressTimerRef.current) {
      clearTimeout(canvasPressTimerRef.current);
      canvasPressTimerRef.current = null;
    }

    if (isCanvasLongPressRef.current) {
      // Release from long press -> stop sliding
      triggerSlide(false);
    } else {
      // Release from short tab/click -> jump
      const now = Date.now();
      if (now - canvasPressStartRef.current < 220) {
        triggerJump();
      }
    }

    isCanvasLongPressRef.current = false;
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

    if (!isPhaseTransitionOpenRef.current) {
      updatePhysics();
      updateSpawners();
    }
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

    // 2. Adjust Difficulty speed based on overall score / progress phase (completely stable within each phase)
    const currentPhase = getLevelFromScore(gameScoreRef.current) - 1;
    speedScaleRef.current = 1.0 + Math.min(currentPhase * 0.15, 0.60);

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

    // Spawn obstacles dynamically with completely stable interval pacing within each phase
    const currentPhase = getLevelFromScore(gameScoreRef.current) - 1;
    const baseSpawnRate = Math.max(120 - currentPhase * 12, 75);
    if (obstacleTimerRef.current >= baseSpawnRate + (Math.random() * 50 - 25)) {
      obstacleTimerRef.current = 0;

      // Choose obstacle types based on current score-based level
      const lenIdx = getLevelIndex(gameScoreRef.current);
      let availableTypes: ('wasabi' | 'chopsticks' | 'cone' | 'pothole')[];
      if (lenIdx === 0) {
        availableTypes = ['wasabi', 'chopsticks'];
      } else if (lenIdx === 1) {
        availableTypes = ['cone', 'pothole'];
      } else if (lenIdx === 2) {
        availableTypes = ['wasabi', 'chopsticks'];
      } else if (lenIdx === 3) {
        availableTypes = ['cone', 'chopsticks'];
      } else {
        availableTypes = ['wasabi', 'pothole'];
      }

      const randType = availableTypes[Math.floor(Math.random() * availableTypes.length)];

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

      const types: ('sushi_maki' | 'sushi_nigiri' | 'sushi_temaki' | 'soy_sauce' | 'ginger' | 'laguna_sushi')[] = 
        ['sushi_maki', 'sushi_nigiri', 'sushi_temaki', 'soy_sauce', 'laguna_sushi'];
      const randType = types[Math.floor(Math.random() * types.length)];

      const heightY = GROUND_Y - 60 - Math.random() * 120; // different heights
      const points = randType === 'laguna_sushi' ? 30 : (randType === 'soy_sauce' ? 20 : 10);
      const colWidth = randType === 'laguna_sushi' ? 104 : 25;
      const colHeight = randType === 'laguna_sushi' ? 52 : 25;

      collectiblesRef.current.push({
        x: BASE_WIDTH,
        y: heightY,
        width: colWidth,
        height: colHeight,
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
      const currentLevelIdx = getLevelIndex(gameScoreRef.current);

      if (obs.type === 'wasabi') {
        if (currentLevelIdx === 2) {
          // Level 3 (Sakura Garden): Sakura Pink Blossom Wasabi Blob!
          ctx.fillStyle = '#ffb7c5';
          ctx.strokeStyle = '#ff69b4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.width / 2, obs.y);
          ctx.quadraticCurveTo(obs.x + obs.width, obs.y + obs.height, obs.x + obs.width, obs.y + obs.height);
          ctx.lineTo(obs.x, obs.y + obs.height);
          ctx.quadraticCurveTo(obs.x, obs.y + obs.height, obs.x + obs.width / 2, obs.y);
          ctx.fill();
          ctx.stroke();

          // A small sakura petal on top of wasabi
          ctx.fillStyle = '#ff69b4';
          ctx.beginPath();
          ctx.ellipse(obs.x + obs.width / 2, obs.y + 2, 4, 2, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();

          // Eyes & cute happy face
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(obs.x + 10, obs.y + 18, 2, 0, Math.PI * 2);
          ctx.arc(obs.x + 20, obs.y + 18, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (currentLevelIdx === 3) {
          // Level 4 (Espaço Sideral): Glowing Purple Alien Slime with single cute eye!
          ctx.fillStyle = '#b388ff';
          ctx.strokeStyle = '#ea80fc';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.width / 2, obs.y);
          ctx.quadraticCurveTo(obs.x + obs.width, obs.y + obs.height, obs.x + obs.width, obs.y + obs.height);
          ctx.lineTo(obs.x, obs.y + obs.height);
          ctx.quadraticCurveTo(obs.x, obs.y + obs.height, obs.x + obs.width / 2, obs.y);
          ctx.fill();
          ctx.stroke();

          // Eyeball
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(obs.x + obs.width / 2, obs.y + 16, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff1744'; // Glowing red pupil
          ctx.beginPath();
          ctx.arc(obs.x + obs.width / 2, obs.y + 16, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (currentLevelIdx === 4) {
          // Level 5 (Fundo do Mar): Spike Sea Urchin (Ouriço do Mar) with cute eyes!
          ctx.fillStyle = '#110033';
          ctx.strokeStyle = '#ea80fc';
          ctx.lineWidth = 1.5;
          const uX = obs.x + obs.width / 2;
          const uY = obs.y + obs.height / 2;
          const r = 14;

          // Drawing urchin spikes
          for (let s = 0; s < 12; s++) {
            const angle = (s * Math.PI * 2) / 12;
            const sX = uX + Math.cos(angle) * 22;
            const sY = uY + Math.sin(angle) * 22;
            ctx.beginPath();
            ctx.moveTo(uX, uY);
            ctx.lineTo(sX, sY);
            ctx.stroke();
          }

          // Central body
          ctx.beginPath();
          ctx.arc(uX, uY, r, 0, Math.PI * 2);
          ctx.fill();

          // Cute eyes
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(uX - 4, uY - 2, 3, 0, Math.PI * 2);
          ctx.arc(uX + 4, uY - 2, 3, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#110033';
          ctx.beginPath();
          ctx.arc(uX - 4, uY - 2, 1.2, 0, Math.PI * 2);
          ctx.arc(uX + 4, uY - 2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (currentLevelIdx === 5) {
          // Level 6 (Fuji Peaks): Glacier blue crystal spire!
          ctx.fillStyle = '#e0f7fa';
          ctx.strokeStyle = '#00acc1';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.width / 2, obs.y);
          ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
          ctx.lineTo(obs.x, obs.y + obs.height);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Sparkles/glare lines
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.width / 2, obs.y + 2);
          ctx.lineTo(obs.x + obs.width / 2, obs.y + obs.height - 2);
          ctx.stroke();
        } else {
          // Standard Wasabi blob (Level 1, etc.)
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
          ctx.beginPath();
          ctx.moveTo(obs.x + 6, obs.y + 12);
          ctx.lineTo(obs.x + 12, obs.y + 15);
          ctx.moveTo(obs.x + 24, obs.y + 12);
          ctx.lineTo(obs.x + 18, obs.y + 15);
          ctx.stroke();
        }
      } else if (obs.type === 'chopsticks') {
        if (currentLevelIdx === 2) {
          // Level 3 (Sakura Garden): Green Zen Bamboo canes to slide under!
          ctx.fillStyle = '#2e7d32';
          ctx.strokeStyle = '#1b5e20';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y + 4, obs.width, obs.height - 4, 3);
          ctx.fill();
          ctx.stroke();
          // Bamboo rings segments
          ctx.fillStyle = '#81c784';
          ctx.fillRect(obs.x + 10, obs.y + 5, 4, obs.height - 6);
          ctx.fillRect(obs.x + 30, obs.y + 5, 4, obs.height - 6);
        } else if (currentLevelIdx === 3) {
          // Level 4 (Cyber Dojo): Cyber Laser beam scanner/dronish beam!
          ctx.fillStyle = '#e91e63';
          ctx.strokeStyle = '#ff80ab';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y + 4, obs.width, obs.height - 4, 2);
          ctx.fill();
          ctx.stroke();
          // Laser core glow
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(obs.x + 4, obs.y + 6, obs.width - 8, obs.height - 8);
        } else if (currentLevelIdx === 4) {
          // Level 5 (Fundo do Mar): Bioluminescent ocean laser grid / electric fence
          ctx.fillStyle = '#00e5ff';
          ctx.strokeStyle = '#00acc1';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y + 4, obs.width, obs.height - 4, 3);
          ctx.fill();
          ctx.stroke();

          // Sparking electricity cores
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const pX = obs.x + (i * 10) + 4;
            ctx.beginPath();
            ctx.moveTo(pX, obs.y + 6);
            ctx.lineTo(pX + 3, obs.y + 12);
            ctx.lineTo(pX - 1, obs.y + 12);
            ctx.lineTo(pX + 2, obs.y + 18);
            ctx.stroke();
          }
        } else {
          // Standard chopsticks
          ctx.fillStyle = '#c59b6d';
          ctx.strokeStyle = '#5a3d21';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y + 4, obs.width, obs.height - 4, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#8a0303';
          ctx.fillRect(obs.x + obs.width - 12, obs.y + 5, 8, obs.height - 6);
        }
      } else if (obs.type === 'cone') {
        if (currentLevelIdx === 3) {
          // Level 4 (Cyber Dojo): Cyber Holo Emitter Base with bright red laser grid lines!
          ctx.fillStyle = '#212121';
          ctx.strokeStyle = '#ff1744';
          ctx.lineWidth = 1.5;
          // Base plate
          ctx.fillRect(obs.x, obs.y + obs.height - 6, obs.width, 6);
          ctx.strokeRect(obs.x, obs.y + obs.height - 6, obs.width, 6);
          // Hologram triangle cone
          const gradHolo = ctx.createLinearGradient(0, obs.y, 0, obs.y + obs.height);
          gradHolo.addColorStop(0, 'rgba(255, 23, 68, 0.8)');
          gradHolo.addColorStop(1, 'rgba(255, 23, 68, 0.05)');
          ctx.fillStyle = gradHolo;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.width / 2, obs.y);
          ctx.lineTo(obs.x + obs.width - 4, obs.y + obs.height - 6);
          ctx.lineTo(obs.x + 4, obs.y + obs.height - 6);
          ctx.closePath();
          ctx.fill();
        } else if (currentLevelIdx === 4) {
          // Level 5 (Fundo do Mar): Sunken pirate-themed Rusty Anchor!
          ctx.fillStyle = '#b0bec5';
          ctx.strokeStyle = '#37474f';
          ctx.lineWidth = 2;
          const aX = obs.x + obs.width / 2;
          const aY = obs.y + 6;

          // Stock/Ring
          ctx.beginPath();
          ctx.arc(aX, aY + 6, 6, 0, Math.PI * 2);
          ctx.stroke();

          // Main vertical shank
          ctx.fillRect(aX - 3, aY + 12, 6, obs.height - 18);
          ctx.strokeRect(aX - 3, aY + 12, 6, obs.height - 18);

          // Horizontal stock crossbar
          ctx.fillRect(aX - 12, aY + 16, 24, 4);

          // Crescent-shaped fluke
          ctx.beginPath();
          ctx.arc(aX, obs.y + obs.height - 10, 15, 0, Math.PI, false);
          ctx.stroke();
        } else {
          // Standard traffic cone
          ctx.fillStyle = '#ff5100';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.width / 2, obs.y);
          ctx.lineTo(obs.x + obs.width - 4, obs.y + obs.height);
          ctx.lineTo(obs.x + 4, obs.y + obs.height);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(obs.x + obs.width / 2 - 5, obs.y + 10, 10, 8);
          ctx.fillStyle = '#333333';
          ctx.fillRect(obs.x, obs.y + obs.height - 4, obs.width, 4);
        }
      } else {
        // 'pothole'
        if (currentLevelIdx === 4) {
          // Level 5 (Fundo do Mar): Deep blue glowing oceanic whirlpool vortex!
          const vortexGrad = ctx.createRadialGradient(obs.x + obs.width / 2, obs.y + obs.height / 2, 2, obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2);
          vortexGrad.addColorStop(0, '#00e5ff'); // spinning cyan core
          vortexGrad.addColorStop(0.5, '#0057b7'); // dark ocean blue ring
          vortexGrad.addColorStop(1, 'rgba(2, 13, 26, 0)'); // fade out
          ctx.fillStyle = vortexGrad;
          ctx.beginPath();
          ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();

          // Spiral swirling lines on the whirlpool
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.save();
          ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
          ctx.rotate(levelDistanceRef.current * 0.08); // spin animation!
          ctx.beginPath();
          ctx.ellipse(0, 0, obs.width * 0.4, obs.height * 0.3, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (currentLevelIdx === 5) {
          // Level 6 (Fuji Peak): Icy slippery puddle with cool frosted blue glow!
          ctx.fillStyle = 'rgba(224, 247, 250, 0.8)';
          ctx.strokeStyle = 'rgba(0, 188, 212, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Standard dark soy puddle
          ctx.fillStyle = 'rgba(29, 14, 4, 0.85)';
          ctx.strokeStyle = 'rgba(255, 127, 80, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
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
      } else if (col.type === 'laguna_sushi') {
        // Draw Laguna Sushi custom badge/label with split background: Top white, Bottom red
        ctx.save();
        
        ctx.beginPath();
        ctx.roundRect(col.x, yOffset, col.width, col.height, 12);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        
        // Clip to draw bottom half in red cleanly inside the curved corners
        ctx.clip();
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(col.x, yOffset + col.height / 2, col.width, col.height / 2);
        
        ctx.restore();

        // Draw the red border around the whole badge
        ctx.strokeStyle = '#EF4444'; // Red-500
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(col.x, yOffset, col.width, col.height, 12);
        ctx.stroke();

        // Decorative dots: Top dots are red (on white), bottom dots are white (on red)
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(col.x + 12, yOffset + col.height / 2 - 9, 4, 0, Math.PI * 2);
        ctx.arc(col.x + col.width - 12, yOffset + col.height / 2 - 9, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(col.x + 12, yOffset + col.height / 2 + 9, 4, 0, Math.PI * 2);
        ctx.arc(col.x + col.width - 12, yOffset + col.height / 2 + 9, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw "LAGUNA" in RED (top half, white background) - Doubled font size to 16px!
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 16px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LAGUNA', col.x + col.width / 2, yOffset + col.height / 2 - 10);

        // Draw "SUSHI" in WHITE (bottom half, red background) - Doubled font size to 16px!
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Space Grotesk", sans-serif';
        ctx.fillText('SUSHI', col.x + col.width / 2, yOffset + col.height / 2 + 11);
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

    const isSpaceLevel = getLevelIndex(gameScoreRef.current) === 3;
    const isOceanLevel = getLevelIndex(gameScoreRef.current) === 4;

    ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
    ctx.rotate(p.rotation);

    if (p.isSliding && !isSpaceLevel) {
      // VISUALLY BEND DOWN AND SLIDE (SE ABAIXA E ESCORREGA)
      ctx.scale(1.4, 0.45);  // highly flat and wide to physically duck/slide
      ctx.translate(0, 10);   // nudge center downward to align perfectly with the floor
      ctx.rotate(-0.06);     // slightly tilt backward for sliding momentum
    }

    if (isSpaceLevel) {
      // DELUXE FUTURISTIC SPACESHIP WITH THE THREE CUTE HEROES (MAKI, SCOOTER, AND CHEF YUKI) INSIDE!
      // 1. Double engine thruster exhaust flame at the bottom
      const flicker = Math.sin(p.animFrame * 0.8) * 4;
      ctx.fillStyle = '#ff3d00';
      ctx.beginPath();
      ctx.moveTo(-12, 10);
      ctx.lineTo(-5, 23 + flicker);
      ctx.lineTo(2, 10);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(2, 10);
      ctx.lineTo(9, 23 + flicker);
      ctx.lineTo(16, 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.moveTo(-9, 10);
      ctx.lineTo(-5, 17 + flicker * 0.6);
      ctx.lineTo(-1, 10);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(5, 10);
      ctx.lineTo(9, 17 + flicker * 0.6);
      ctx.lineTo(13, 10);
      ctx.closePath();
      ctx.fill();

      // 2. Space capsule cockpit backing plate (so space background stars don't shine through characters)
      ctx.fillStyle = '#1c2035'; // dark navy interior
      ctx.beginPath();
      ctx.arc(0, -3, 22, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();

      // 3. Render Micro-Character #1: Sushi Maki (Left)
      ctx.save();
      ctx.translate(-13, -3);
      if (p.isJumping) {
        ctx.translate(0, -2); // little jump float
      }
      // Seaweed body
      ctx.fillStyle = '#112211';
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Rice body
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
      ctx.fill();
      // Salmon center
      ctx.fillStyle = '#ff6b5a';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      // Face
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(-2.5, -0.6, 0.8, 0, Math.PI * 2);
      ctx.arc(2.5, -0.6, 0.8, 0, Math.PI * 2);
      ctx.fill();
      // Soft blush
      ctx.fillStyle = 'rgba(255, 105, 180, 0.6)';
      ctx.beginPath();
      ctx.arc(-4, 1, 0.9, 0, Math.PI * 2);
      ctx.arc(4, 1, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Render Micro-Character #2: Chef Yuki (Center)
      ctx.save();
      ctx.translate(0, -5);
      const spaceYukiBounce = Math.sin(p.animFrame * 0.12) * 1.5;
      ctx.translate(0, spaceYukiBounce);
      // Face Skin
      ctx.fillStyle = '#fedbb4';
      ctx.beginPath();
      ctx.arc(0, -1, 7.5, 0, Math.PI * 2);
      ctx.fill();
      // Hair buns
      ctx.fillStyle = '#1e272e';
      ctx.beginPath();
      ctx.arc(-7.8, -6, 3.8, 0, Math.PI * 2);
      ctx.arc(7.8, -6, 3.8, 0, Math.PI * 2);
      ctx.fill();
      // Headband
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6.5, -7.2, 13, 2.5);
      // Red emblem
      ctx.fillStyle = '#fc3d39';
      ctx.beginPath();
      ctx.arc(0, -6, 1.1, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(-2.6, -1.8, 1.1, 0, Math.PI * 2);
      ctx.arc(2.6, -1.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
      // Smile
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 1.2, 1.6, 0, Math.PI, false);
      ctx.stroke();
      ctx.restore();

      // 5. Render Micro-Character #3: Scooter Courier (Right)
      ctx.save();
      ctx.translate(13, -3);
      if (p.isJumping) {
        ctx.translate(0, -2);
      }
      // Face
      ctx.fillStyle = '#fedbb4';
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Wasabi Helmet
      ctx.fillStyle = '#6ab82e';
      ctx.beginPath();
      ctx.arc(0, -1.5, 7, Math.PI, 0);
      ctx.fill();
      // Goggles
      ctx.fillStyle = '#00ffff';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.rect(-3, -2.5, 6, 2.2);
      ctx.fill();
      ctx.stroke();
      // Smiling mouth
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 2.2, 1.4, 0, Math.PI, false);
      ctx.stroke();
      ctx.restore();

      // 6. Draw the glowing clear spaceship glass dome overlay
      ctx.fillStyle = 'rgba(128, 222, 234, 0.3)'; // cyan shiny dome
      ctx.strokeStyle = 'rgba(128, 222, 234, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -3, 22, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Shiny dome reflection light
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -3, 18, Math.PI * 1.15, Math.PI * 1.35, false);
      ctx.stroke();

      // 7. Outer Metallic Saucer rim
      const saucerGrad = ctx.createLinearGradient(-28, 0, 28, 12);
      saucerGrad.addColorStop(0, '#eceff1');
      saucerGrad.addColorStop(0.3, '#b0bec5');
      saucerGrad.addColorStop(0.7, '#78909c');
      saucerGrad.addColorStop(1, '#37474f');
      ctx.fillStyle = saucerGrad;
      ctx.strokeStyle = '#1a237e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 8, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 8. Glowing control ring under body
      ctx.strokeStyle = '#e040fb';  // bright cosmic purple neon
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 8, 24, 5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Flashing pilot flight beacon lights
      const isBeaconOn = Math.floor(p.animFrame / 10) % 2 === 0;
      ctx.fillStyle = isBeaconOn ? '#00e5ff' : '#d500f9';
      ctx.beginPath();
      ctx.arc(-16, 7, 2.2, 0, Math.PI * 2);
      ctx.arc(16, 7, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isBeaconOn ? '#ff1744' : '#ffeb3b';
      ctx.beginPath();
      ctx.arc(0, 9, 2, 0, Math.PI * 2);
      ctx.fill();

    } else {
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

        if (isOceanLevel) {
          // UNDERWATER GLASS HELMET ON MAKI
          // Yellow connector collar base
          ctx.fillStyle = '#fffc33';
          ctx.strokeStyle = '#b58d3d';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(-14, 18, 28, 5, 2);
          ctx.fill();
          ctx.stroke();

          // Glass dome
          ctx.fillStyle = 'rgba(128, 222, 234, 0.25)'; // aqua shiny transparent
          ctx.strokeStyle = 'rgba(128, 222, 234, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 26, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Reflective light streak
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, 23, Math.PI * 1.1, Math.PI * 1.3, false);
          ctx.stroke();

          // Little bubbles stream
          const bubbleWobble = Math.sin(p.animFrame * 0.15) * 3;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.arc(22 + bubbleWobble, -12, 2, 0, Math.PI * 2);
          ctx.arc(16 + bubbleWobble, -18, 1.2, 0, Math.PI * 2);
          ctx.arc(26 - bubbleWobble, -24, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
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

        if (isOceanLevel) {
          // UNDERWATER GLASS HELMET ON SCOOTER HERO
          // Oxygen hose from helmet neck to lunchbox
          ctx.strokeStyle = 'rgba(128, 222, 234, 0.8)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-4, -11);
          ctx.quadraticCurveTo(-18, -12, -18, -4);
          ctx.stroke();

          // Metallic collar
          ctx.fillStyle = '#fffc33';
          ctx.strokeStyle = '#b58d3d';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(2, -5, 11, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Glass dome around scooter's head (head is at x=2, y=-15)
          ctx.fillStyle = 'rgba(128, 222, 234, 0.25)';
          ctx.strokeStyle = 'rgba(128, 222, 234, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(2, -15, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Reflection shine
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(2, -15, 12, Math.PI * 1.1, Math.PI * 1.3, false);
          ctx.stroke();

          // Little bubbles stream
          const bubbleWobble = Math.sin(p.animFrame * 0.15) * 3;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.arc(18 + bubbleWobble, -22, 2, 0, Math.PI * 2);
          ctx.arc(14 - bubbleWobble, -28, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
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

        if (isOceanLevel) {
          // UNDERWATER GLASS HELMET ON CHEF YUKI
          // Oxygen canister on her back (behind head/body)
          ctx.fillStyle = '#ff4d4d'; // coral reddish oxygen tank
          ctx.strokeStyle = '#2d3436';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(-24, -2, 8, 18, 3);
          ctx.fill();
          ctx.stroke();

          // Oxygen cylinder cap
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-22, -4, 4, 2);

          // Hose tube connecting tank to helmet neck
          ctx.strokeStyle = 'rgba(128, 222, 234, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-20, -2);
          ctx.quadraticCurveTo(-16, -10, -10, -10);
          ctx.stroke();

          // Shiny yellow copper collar rim at the neck / shoulders area
          ctx.fillStyle = '#fffc33';
          ctx.strokeStyle = '#b58d3d';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, 11, 15, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Glass bubble helmet (centered on y=-9 of radius 24 to overlay head and hair buns nicely)
          ctx.fillStyle = 'rgba(128, 222, 234, 0.25)';
          ctx.strokeStyle = 'rgba(128, 222, 234, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -9, 24, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Dome reflection line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, -9, 21, Math.PI * 1.1, Math.PI * 1.3, false);
          ctx.stroke();

          // Streaming bubbles rising from helmet
          const bubbleWobble = Math.sin(p.animFrame * 0.15) * 3;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.arc(24 + bubbleWobble, -18, 2, 0, Math.PI * 2);
          ctx.arc(20 - bubbleWobble, -26, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
    // Distant decorative elements depending on dynamic level!
    const dist = levelDistanceRef.current;
    const levelIndex = getLevelIndex(gameScoreRef.current);

    if (levelIndex === 0) {
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
    } else if (levelIndex === 1) {
      // TOKYO STREETS: Cidade de Dia ☀️
      // Sky clouds (since it is daytime, we can draw some beautiful soft white cumulus clouds drifting in the background)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      for (let i = 0; i < 4; i++) {
        const xCloud = (i * 260 - (dist * 0.15)) % (BASE_WIDTH + 150);
        ctx.beginPath();
        ctx.arc(xCloud, 40 + (i % 2) * 15, 20, 0, Math.PI * 2);
        ctx.arc(xCloud + 15, 30 + (i % 2) * 15, 25, 0, Math.PI * 2);
        ctx.arc(xCloud + 35, 40 + (i % 2) * 15, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // Skyline silhouettes in rich black day outline
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(15, 15, 15, 0.95)';
        const xBuilding = (i * 220 - (dist * 0.1)) % (BASE_WIDTH + 120);
        const wBuilding = 140;
        const hBuilding = 240 + (i % 2) * 80; // Taller buildings
        ctx.fillRect(xBuilding, GROUND_Y - hBuilding, wBuilding, hBuilding);

        // Glass reflection window panels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        const rows = Math.min(8, Math.floor((hBuilding - 30) / 30));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.fillRect(xBuilding + 15 + c * 40, GROUND_Y - hBuilding + 15 + r * 30, 20, 15);
          }
        }
      }

      // Beautiful Mt Fuji in daytime blue/snow
      ctx.fillStyle = 'rgba(45, 80, 115, 0.22)';
      ctx.beginPath();
      ctx.moveTo(400 - (dist * 0.04) % 1000, GROUND_Y);
      ctx.lineTo(550 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(590 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(740 - (dist * 0.04) % 1000, GROUND_Y);
      ctx.fill();

      // Fuji snow cap outline
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.moveTo(515 - (dist * 0.04) % 1000, 150);
      ctx.lineTo(550 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(590 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(625 - (dist * 0.04) % 1000, 150);
      ctx.fill();
    } else if (levelIndex === 2) {
      // OVERCAST RAINY DAY CITY: Black city buildings and diagonal falling rain 🌧️
      // Overcast dark grey/blue rain clouds
      ctx.fillStyle = 'rgba(84, 110, 122, 0.45)';
      for (let i = 0; i < 4; i++) {
        const xCloud = (i * 260 - (dist * 0.15)) % (BASE_WIDTH + 150);
        ctx.beginPath();
        ctx.arc(xCloud, 40 + (i % 2) * 15, 25, 0, Math.PI * 2);
        ctx.arc(xCloud + 18, 30 + (i % 2) * 15, 30, 0, Math.PI * 2);
        ctx.arc(xCloud + 40, 40 + (i % 2) * 15, 25, 0, Math.PI * 2);
        ctx.fill();
      }

      // Skyline silhouettes in solid rich black
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#0a0d10';
        const xBuilding = (i * 220 - (dist * 0.1)) % (BASE_WIDTH + 1205) - 100;
        const wBuilding = 140;
        const hBuilding = 240 + (i % 2) * 80; // High buildings
        ctx.fillRect(xBuilding, GROUND_Y - hBuilding, wBuilding, hBuilding);

        // Glass reflection window panels highlighted in cold ambient blue
        ctx.fillStyle = 'rgba(128, 216, 255, 0.25)';
        const rows = Math.min(8, Math.floor((hBuilding - 30) / 30));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.fillRect(xBuilding + 15 + c * 40, GROUND_Y - hBuilding + 15 + r * 30, 20, 15);
          }
        }
      }

      // Beautiful Mt Fuji silhouetted in dark indigo storm rest
      ctx.fillStyle = 'rgba(38, 50, 56, 0.5)';
      ctx.beginPath();
      ctx.moveTo(400 - (dist * 0.04) % 1000, GROUND_Y);
      ctx.lineTo(550 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(590 - (dist * 0.04) % 1000, 120);
      ctx.lineTo(740 - (dist * 0.04) % 1000, GROUND_Y);
      ctx.fill();

      // Beautiful diagonal falling rain drops
      ctx.strokeStyle = 'rgba(179, 229, 252, 0.42)';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 50; i++) {
        const rainSpeedX = 5;
        const rainSpeedY = 13;
        const dropX = (i * 22 + dist * rainSpeedX) % (BASE_WIDTH + 100) - 50;
        const dropY = (i * 18 + dist * rainSpeedY) % GROUND_Y;
        
        ctx.beginPath();
        ctx.moveTo(dropX, dropY);
        ctx.lineTo(dropX - 12, dropY + 28); // Diagonal movement downwards and slightly to the left (or right, -12 maintains perfect diagonal tilt)
        ctx.stroke();
      }
    } else if (levelIndex === 3) {
      // OUTER SPACE: Twinkling cosmic stars, gorgeous nebulae, ringed giant planet
      // 1. Distant space nebulae dust
      ctx.fillStyle = 'rgba(103, 58, 183, 0.12)';
      const nebulaX = (280 - (dist * 0.06)) % (BASE_WIDTH + 300) - 100;
      ctx.beginPath();
      ctx.arc(nebulaX, 80, 120, 0, Math.PI * 2);
      ctx.arc(nebulaX + 130, 110, 90, 0, Math.PI * 2);
      ctx.fill();

      // 2. Beautiful parallax twinkling stars
      for (let i = 0; i < 40; i++) {
        // Pseudo-random coordinates based on indexes
        const starX = (i * 37 - (dist * 0.12)) % (BASE_WIDTH + 80);
        const starY = (i * 19 + 15) % (GROUND_Y - 30);
        
        // Twinkling alpha modulation
        const twinkle = 0.3 + 0.7 * Math.abs(Math.sin((dist * 0.04) + i));
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
        
        // Vary sizes to make stars look distant and varied
        const starSize = (i % 3 === 0) ? 2.2 : ((i % 2 === 0) ? 1.5 : 0.8);
        
        ctx.beginPath();
        if (i % 8 === 0) {
          // Drawing a tiny sparkling cross star for larger ones
          ctx.fillRect(starX - 2, starY, 5, 0.8);
          ctx.fillRect(starX, starY - 2, 0.8, 5);
        } else {
          ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Giant planet Saturn with beautiful glowing cosmic rings
      const planetX = (550 - (dist * 0.04)) % (BASE_WIDTH + 400) - 150;
      const planetY = 90;
      
      // Ring behind
      ctx.strokeStyle = 'rgba(230, 201, 255, 0.55)';
      ctx.lineWidth = 6;
      ctx.save();
      ctx.translate(planetX, planetY);
      ctx.rotate(-Math.PI / 8);
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 12, 0, Math.PI, Math.PI * 2); // Top half of the ring drawn behind planet
      ctx.stroke();
      ctx.restore();

      // Golden desert planet sphere
      const gradPlanet = ctx.createRadialGradient(planetX - 10, planetY - 10, 5, planetX, planetY, 35);
      gradPlanet.addColorStop(0, '#ffd54f'); // Radiant sun yellow
      gradPlanet.addColorStop(0.5, '#ffb300'); // Ambient gold orange
      gradPlanet.addColorStop(1, '#985e00'); // Shadowed warm brown
      ctx.fillStyle = gradPlanet;
      ctx.beginPath();
      ctx.arc(planetX, planetY, 35, 0, Math.PI * 2);
      ctx.fill();

      // Planet surface texture lines
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(planetX, planetY, 35, Math.PI * 0.1, Math.PI * 0.9, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(planetX, planetY, 35, -Math.PI * 0.05, -Math.PI * 0.95, true);
      ctx.stroke();

      // Ring in front
      ctx.strokeStyle = 'rgba(230, 201, 255, 0.75)';
      ctx.lineWidth = 6;
      ctx.save();
      ctx.translate(planetX, planetY);
      ctx.rotate(-Math.PI / 8);
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 12, 0, 0, Math.PI); // Bottom half of the ring drawn in front of planet
      ctx.stroke();
      ctx.restore();

      // 4. Distant cruising UFO/satellite
      ctx.fillStyle = 'rgba(230, 255, 255, 0.8)';
      const ufoX = (400 - (dist * 0.22)) % (BASE_WIDTH + 300) - 100;
      const ufoY = 50 + Math.sin(dist * 0.05) * 12;
      ctx.beginPath();
      ctx.ellipse(ufoX, ufoY, 15, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // UFO dome with cyan light
      ctx.fillStyle = 'rgba(0, 229, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(ufoX, ufoY - 2, 4, Math.PI, 0, false);
      ctx.fill();

      // UFO flashing bottom lights
      ctx.fillStyle = (Math.floor(dist / 10) % 2 === 0) ? '#ff2d55' : '#00e5ff';
      ctx.beginPath();
      ctx.arc(ufoX - 6, ufoY + 1, 1.5, 0, Math.PI * 2);
      ctx.arc(ufoX + 6, ufoY + 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (levelIndex === 4) {
      // OCEAN BOTTOM / UNDERSEA FEELS: Bioluminescent seaweed, rising bubbles, submarine and cute pulsing jellyfish!
      // 1. Sea floor depth gradient / ambient blue glow
      ctx.fillStyle = 'rgba(0, 150, 136, 0.08)';
      ctx.beginPath();
      ctx.fillRect(0, 180, BASE_WIDTH, GROUND_Y - 180);

      // 2. Parallax rising bubbles (slowly oscillating up and drifting)
      ctx.strokeStyle = 'rgba(128, 222, 234, 0.45)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 22; i++) {
        // Slow float up
        const xOffset = Math.sin((dist * 0.02) + i) * 15;
        const bubbleX = (i * 47 + xOffset) % BASE_WIDTH;
        const bubbleY = (GROUND_Y - 20) - ((i * 12 + dist * 0.4) % (GROUND_Y - 40));
        const bRadius = 2 + (i % 3) * 1.5;

        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, bRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny highlight on bubble
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(bubbleX - bRadius * 0.3, bubbleY - bRadius * 0.3, bRadius * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Bioluminescent pulsing jellyfish floating in the background
      for (let j = 0; j < 3; j++) {
        const jX = (200 + j * 240 - (dist * 0.15)) % (BASE_WIDTH + 160) - 80;
        const pulse = Math.sin((dist * 0.03) + j) * 4;
        const jY = 90 + j * 40 + pulse;
        
        ctx.save();
        ctx.translate(jX, jY);
        
        // Glow effect
        ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, 18, Math.PI, 0, false);
        ctx.fill();

        // Jelly cup body
        const jellGrad = ctx.createRadialGradient(0, -2, 2, 0, 0, 14);
        jellGrad.addColorStop(0, 'rgba(0, 229, 255, 0.85)'); // vibrant cyan
        jellGrad.addColorStop(1, 'rgba(234, 128, 252, 0.45)'); // pinky purple edge
        ctx.fillStyle = jellGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 14, Math.PI, 0, false);
        ctx.lineTo(14, 2);
        ctx.quadraticCurveTo(0, 6 + pulse, -14, 2);
        ctx.closePath();
        ctx.fill();

        // Flashing inner dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-4, -4, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Tentacles dangling & swaying
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
        ctx.lineWidth = 1.8;
        for (let t = -2; t <= 2; t++) {
          const tX = t * 4;
          const wobble = Math.sin((dist * 0.05) + t) * 5;
          ctx.beginPath();
          ctx.moveTo(tX, 4);
          ctx.bezierCurveTo(tX + wobble / 2, 10, tX - wobble, 20, tX + wobble, 26);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Swaying green and purple coral/seaweeds at the sea bottom
      ctx.lineWidth = 4;
      for (let k = 0; k < 9; k++) {
        const weedX = (k * 110 - (dist * 0.25)) % (BASE_WIDTH + 60) - 30;
        const weedHeight = 35 + (k % 3) * 15;
        const sway = Math.sin((dist * 0.02) + k) * 12;

        ctx.strokeStyle = (k % 2 === 0) ? '#4caf50' : '#8e24aa'; // Green or violet seaweed
        ctx.beginPath();
        ctx.moveTo(weedX, GROUND_Y);
        ctx.quadraticCurveTo(weedX + sway * 0.5, GROUND_Y - weedHeight * 0.5, weedX + sway, GROUND_Y - weedHeight);
        ctx.stroke();

        ctx.strokeStyle = (k % 2 === 0) ? '#81c784' : '#ba68c8'; // lighter highlight stalk
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(weedX + 1, GROUND_Y);
        ctx.quadraticCurveTo(weedX + sway * 0.5 + 1, GROUND_Y - weedHeight * 0.5, weedX + sway + 1, GROUND_Y - weedHeight);
        ctx.stroke();
        ctx.lineWidth = 4;
      }

      // 5. Ambient deep-sea submarine cruising in the distance
      ctx.fillStyle = '#ffd54f'; // bright yellow submarine
      ctx.strokeStyle = '#f57f17';
      ctx.lineWidth = 2;
      const subX = (150 - (dist * 0.12)) % (BASE_WIDTH + 300) - 130;
      const subY = 60 + Math.sin(dist * 0.02) * 8;
      
      ctx.save();
      ctx.translate(subX, subY);
      // Submarine hull
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Periscope
      ctx.strokeStyle = '#f57f17';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, -18);
      ctx.lineTo(6, -18);
      ctx.stroke();

      // Propeller at the back (spinning aspect)
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.8;
      const propSpin = Math.sin(dist * 0.3) * 6;
      ctx.beginPath();
      ctx.moveTo(-28, -propSpin);
      ctx.lineTo(-28, propSpin);
      ctx.stroke();

      ctx.fillStyle = '#333';
      ctx.fillRect(-26, -3, 3, 6);

      // Windows (Portholes) with glowing blue light
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(-8, 0, 3.2, 0, Math.PI * 2);
      ctx.arc(4, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      // FUJI ICE PEAKS: Glacier crystals, white snowy flakes
      ctx.fillStyle = 'rgba(173, 216, 230, 0.1)';
      for (let i = 0; i < 3; i++) {
        const xGlacier = (i * 350 - (dist * 0.06)) % (BASE_WIDTH + 200);
        ctx.beginPath();
        ctx.moveTo(xGlacier, GROUND_Y);
        ctx.lineTo(xGlacier + 100, 100);
        ctx.lineTo(xGlacier + 200, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(xGlacier + 60, GROUND_Y);
        ctx.lineTo(xGlacier + 100, 100);
        ctx.lineTo(xGlacier + 110, 105);
        ctx.lineTo(xGlacier + 80, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(173, 216, 230, 0.1)';
      }
      
      // Snowy flakes
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 20; i++) {
        const flakeX = (i * 55 - (dist * 0.3)) % (BASE_WIDTH + 40);
        const flakeY = (18 * i + (dist * 0.12)) % 320;
        ctx.beginPath();
        ctx.arc(flakeX, flakeY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
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

  // Configured variables for 3D Transition Banners (Fases 2, 3 and 4)
  const getBannerDetails = () => {
    let bannerGlow = 'from-amber-500 to-salmon-500';
    let bannerIcon = '☀️';
    let bannerIconBg = 'from-amber-400 to-amber-600 shadow-amber-500/35 border-yellow-300/40';
    let bannerIconRotate = [0, 360];
    let bannerTag = '⛩️ CONQUISTA DE SAMURAI';
    let bannerTagColor = 'text-amber-450 border-amber-500/30';
    let bannerTitle = 'Fase 1 Concluída!';
    let bannerSub = 'Você dominou a Cozinha Ryotei com perfeição! Agora as coisas vão esquentar lá fora...';
    let bannerNextStyle = 'bg-sky-500/10 border-sky-400/20';
    let bannerNextLine = '🌇 CIDADE DE DIA ☀️';
    let bannerNextDesc = 'Aperte o cinto para desviar dos obstáculos sob a luz do sol!';
    let bannerBtnStyle = 'from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 border-amber-800';
    let bannerBtnId = 'start-phase2-button';
    let bannerBtnText = 'INICIAR FASE 2 (DE DIA) ➡️';

    if (transitionPhase === 3) {
      bannerGlow = 'from-sky-500 to-blue-600';
      bannerIcon = '🌧️';
      bannerIconBg = 'from-sky-400 to-blue-600 shadow-sky-500/35 border-sky-300/40';
      bannerIconRotate = [-8, 8, -8];
      bannerTag = '🌩️ PILOTO DE TORMENTA';
      bannerTagColor = 'text-sky-450 border-sky-500/30';
      bannerTitle = 'Fase 2 Concluída!';
      bannerSub = 'A cidade ensolarada foi dominada! Mas o clima mudou e nuvens pesadas se aproximam...';
      bannerNextStyle = 'bg-sky-500/10 border-sky-400/20';
      bannerNextLine = '🌧️ CHUVA NA CIDADE 🌧️';
      bannerNextDesc = 'Desvie de obstáculos sob uma ventania com pingos de chuva na diagonal!';
      bannerBtnStyle = 'from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-slate-950 border-sky-800';
      bannerBtnId = 'start-phase3-button';
      bannerBtnText = 'INICIAR FASE 3 (COM CHUVA) ➡️';
    } else if (transitionPhase === 4) {
      bannerGlow = 'from-purple-500 to-fuchsia-500';
      bannerIcon = '🚀';
      bannerIconBg = 'from-purple-400 to-indigo-600 shadow-purple-500/35 border-purple-300/40';
      bannerIconRotate = [0, -15, 15, 0];
      bannerTag = '🌌 EXPLORADOR CÓSMICO';
      bannerTagColor = 'text-purple-400 border-purple-500/35';
      bannerTitle = 'Fase 3 Concluída!';
      bannerSub = 'Você sobreviveu à tempestade implacável! Prepare-se para decolar em uma jornada além da Terra...';
      bannerNextStyle = 'bg-purple-500/15 border-purple-400/25';
      bannerNextLine = '🚀 ESPAÇO SIDERAL 🌌';
      bannerNextDesc = 'Gravidade zero! Desvie de meteoros e restos cósmicos no vácuo estelar!';
      bannerBtnStyle = 'from-purple-500 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-700 text-slate-950 border-purple-800';
      bannerBtnId = 'start-phase4-button';
      bannerBtnText = 'INICIAR FASE 4 (NO ESPAÇO) ➡️';
    } else if (transitionPhase === 5) {
      bannerGlow = 'from-cyan-500 to-blue-500';
      bannerIcon = '🐙';
      bannerIconBg = 'from-cyan-400 to-blue-600 shadow-cyan-500/35 border-cyan-300/40';
      bannerIconRotate = [-8, 8, -8];
      bannerTag = '🔱 MERGULHADOR ABISSAL';
      bannerTagColor = 'text-cyan-400 border-cyan-500/35';
      bannerTitle = 'Fase 4 Concluída!';
      bannerSub = 'Você conquistou a gravidade zero do espaço! Agora prepare-se para submergir nas profundezas misteriosas do oceano...';
      bannerNextStyle = 'bg-cyan-500/15 border-cyan-400/25';
      bannerNextLine = '🌊 FUNDO DO MAR 🐙';
      bannerNextDesc = 'Sinta a pressão das águas! Desvie de polvos gigantes, mureias e correntes marítimas!';
      bannerBtnStyle = 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-slate-950 border-cyan-800';
      bannerBtnId = 'start-phase5-button';
      bannerBtnText = 'INICIAR FASE 5 (FUNDO DO MAR) ➡️';
    }

    return {
      bannerGlow,
      bannerIcon,
      bannerIconBg,
      bannerIconRotate,
      bannerTag,
      bannerTagColor,
      bannerTitle,
      bannerSub,
      bannerNextStyle,
      bannerNextLine,
      bannerNextDesc,
      bannerBtnStyle,
      bannerBtnId,
      bannerBtnText
    };
  };

  const bannerDetails = getBannerDetails();

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
              Fase: {getThemeColors(gameScore).name}
            </h3>
          </div>
        </div>

        {/* Live score and lives displays */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 bg-slate-950/80 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-slate-900/45">
            <span className="text-[9px] font-mono text-slate-500 hidden sm:inline">PONTOS:</span>
            <span className="font-mono text-xs sm:text-sm font-black text-amber-400 min-w-[24px] sm:min-w-[36px] text-right">{gameScore}</span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 text-sm sm:text-lg min-h-[1.5rem] overflow-hidden">
            {[1, 2, 3].map((heart) => (
              <span
                key={heart}
                className={`transition-all duration-500 ease-out transform origin-center ${
                  heart <= lives
                    ? 'text-red-500 scale-100 opacity-100 rotate-0 filter drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]'
                    : 'scale-0 opacity-0 rotate-12 pointer-events-none w-0'
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
          onMouseDown={handleCanvasPressStart}
          onMouseUp={handleCanvasPressEnd}
          onMouseLeave={handleCanvasPressEnd}
          onTouchStart={handleCanvasPressStart}
          onTouchEnd={handleCanvasPressEnd}
          onTouchCancel={handleCanvasPressEnd}
        />

        {/* Level Up Notification Banner */}
        <AnimatePresence>
          {levelNotification && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.5, y: -50 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="absolute pointer-events-none select-none z-30 flex flex-col items-center justify-center bg-slate-950/90 border-2 border-amber-500/85 px-8 py-5 rounded-3xl shadow-2xl shadow-amber-500/20 backdrop-blur-md max-w-xs text-center"
            >
              <div className="text-4xl sm:text-5xl animate-bounce mb-3">🔥 PROGRESSO!</div>
              <p className="text-amber-400 font-extrabold tracking-wider font-mono text-[10px] sm:text-xs">
                {levelNotification.split('\n')[0]}
              </p>
              <h4 className="text-xl sm:text-2xl font-black text-white mt-1 leading-tight">
                {levelNotification.split('\n')[1]}
              </h4>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spectacular 3D-Animated Floating Transition Banner for Phase 2, Phase 3 & Phase 4 */}
        <AnimatePresence>
          {showPhaseTransitionBanner && (
            <div className="absolute inset-0 bg-slate-950/80 z-40 backdrop-blur-md flex items-center justify-center p-4 select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.82, rotateX: -30, rotateY: 10, y: 30 }}
                animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, rotateX: 30, rotateY: -10, y: -30 }}
                transition={{ type: "spring", stiffness: 180, damping: 18 }}
                style={{ transformStyle: "preserve-3d", perspective: 1200 }}
                className="relative bg-gradient-to-br from-slate-900/98 via-slate-950 to-amber-950/20 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 shadow-[0_30px_70px_rgba(245,158,11,0.25)] max-w-sm w-full text-center flex flex-col items-center"
              >
                {/* 3D floating effect light glow */}
                <div className={`absolute -inset-1 bg-gradient-to-r ${bannerDetails.bannerGlow} rounded-3xl blur opacity-20 -z-10 animate-pulse`} />

                {/* Animated 3D Floating Icon */}
                <motion.div
                  animate={{ 
                    y: [0, -10, 0],
                    rotate: bannerDetails.bannerIconRotate,
                  }}
                  transition={{ 
                    y: { repeat: Infinity, duration: 2.2, ease: "easeInOut" },
                    rotate: { repeat: Infinity, duration: transitionPhase === 3 ? 4 : 12, ease: "easeInOut" }
                  }}
                  className={`w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br ${bannerDetails.bannerIconBg} rounded-full flex items-center justify-center text-3xl sm:text-4xl shadow-xl mb-4 shrink-0`}
                >
                  {bannerDetails.bannerIcon}
                </motion.div>

                <div className={`text-[10px] sm:text-xs font-mono font-black tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full border ${bannerDetails.bannerTagColor}`}>
                  {bannerDetails.bannerTag}
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-white mt-3 tracking-tight drop-shadow-md">
                  {bannerDetails.bannerTitle}
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed max-w-xs">
                  {bannerDetails.bannerSub}
                </p>

                {/* Next phase note / highlight card */}
                <div className={`w-full mt-4 p-3 ${bannerDetails.bannerNextStyle} rounded-2xl flex flex-col items-center gap-1`}>
                  <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-sky-300">
                    PRÓXIMA PARADA:
                  </span>
                  <p className="text-xs text-sky-200 font-extrabold flex items-center gap-1">
                    {bannerDetails.bannerNextLine}
                  </p>
                  <p className="text-[10px] text-slate-400 text-center">
                    {bannerDetails.bannerNextDesc}
                  </p>
                </div>

                {/* 3D-feel shiny action button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    soundManager.playCollect();
                    setShowPhaseTransitionBanner(false);
                  }}
                  className={`w-full mt-6 py-3.5 sm:py-4 bg-gradient-to-r ${bannerDetails.bannerBtnStyle} font-black text-xs sm:text-sm rounded-xl sm:rounded-2xl shadow-lg cursor-pointer transition-all border-b-4 focus:outline-none`}
                  id={bannerDetails.bannerBtnId}
                >
                  {bannerDetails.bannerBtnText}
                </motion.button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
                Divirta-se enquanto espera seu pedido. Supere obstáculos e avance de fase acumulando pontos!
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

              <div className="mb-5 xs:mb-7 sm:mb-9 bg-slate-900/80 border border-slate-800 px-4 py-2.5 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl max-w-sm text-xs sm:text-sm text-slate-300 leading-snug">
                Fase alcançada: <span className="text-salmon-400 font-bold">{getThemeColors(gameScore).name}</span>. Novas fases e cenários a partir de <span className="text-amber-400 font-bold">400, 600, 850, 1001 e 1400 pontos</span>!
              </div>

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
