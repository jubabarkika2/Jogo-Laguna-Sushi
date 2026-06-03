/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { HighScore } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Guard client initialization to prevent crash on empty/invalid URL
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Fetches the top high scores from Supabase (or local storage fallback).
 */
export async function getSupabaseLeaderboard(): Promise<HighScore[]> {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('Supabase is not configured. Falling back to local storage.');
    return getLocalFallbackScores();
  }

  try {
    const { data, error } = await supabase
      .from('highscores')
      .select('name, score, date, is_order_courier')
      .order('score', { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    return (data || []).map(row => ({
      name: row.name,
      score: row.score,
      date: row.date,
      isOrderCourier: row.is_order_courier
    }));
  } catch (err) {
    console.error('Error fetching scores from Supabase:', err);
    return getLocalFallbackScores();
  }
}

/**
 * Saves a high score to Supabase.
 */
export async function saveHighScoreToSupabase(scoreItem: HighScore): Promise<void> {
  // Always update locally as well to keep UI snappy
  saveLocalHighScore(scoreItem);

  if (!isSupabaseConfigured || !supabase) {
    console.warn('Supabase is not configured. Score saved to local storage.');
    return;
  }

  try {
    const { error } = await supabase
      .from('highscores')
      .insert({
        name: scoreItem.name,
        score: scoreItem.score,
        date: scoreItem.date,
        is_order_courier: !!scoreItem.isOrderCourier
      });

    if (error) {
      throw error;
    }
    console.log('Score saved to Supabase successfully!');
  } catch (err) {
    console.error('Error saving score to Supabase:', err);
  }
}

// Helper to save locally
function saveLocalHighScore(scoreItem: HighScore) {
  try {
    const saved = localStorage.getItem('sushi_delivery_scores');
    const prev = saved ? JSON.parse(saved) : [];
    const updated = [...prev, scoreItem]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    localStorage.setItem('sushi_delivery_scores', JSON.stringify(updated));
  } catch (e) {
    console.error('Error writing local storage fallback:', e);
  }
}

// Helper to get local scores or default initial values
export function getLocalFallbackScores(): HighScore[] {
  try {
    const saved = localStorage.getItem('sushi_delivery_scores');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error reading local storage fallback:', e);
  }
  
  // Default values
  return [
    { name: 'Sushiman Jiro', score: 120, date: '03/06/2026' },
    { name: 'Motoboy Cleiton', score: 95, date: '02/06/2026', isOrderCourier: true },
    { name: 'Sushiwoman Sara 👩‍🍳', score: 70, date: '01/06/2026' }
  ];
}
