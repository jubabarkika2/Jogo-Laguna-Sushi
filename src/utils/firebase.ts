import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, orderBy, query, setDoc, doc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { HighScore } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to Firestore.
 */
export async function testConnection() {
  try {
    const q = query(collection(db, 'highscores'), limit(1));
    await getDocs(q);
    console.log('Firebase store connected successfully!');
  } catch (error) {
    console.error('Error connecting to Firebase: ', error);
  }
}

/**
 * Fetches the top high scores from the Firestore database.
 */
export async function getLeaderboard(): Promise<HighScore[]> {
  const path = 'highscores';
  try {
    const q = query(
      collection(db, path),
      orderBy('score', 'desc'),
      limit(5)
    );
    const querySnapshot = await getDocs(q);
    const scores: HighScore[] = [];
    querySnapshot.forEach((docSnap) => {
      scores.push(docSnap.data() as HighScore);
    });
    return scores;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Saves a high score to Firestore.
 */
export async function saveHighScoreToFirestore(scoreItem: HighScore): Promise<void> {
  const path = 'highscores';
  try {
    // Generate an ID based on sanitized name + score + timestamp to be deterministic but unique
    const sanitizedName = scoreItem.name.replace(/[^a-zA-Z0-9]/g, '_');
    const docId = `${sanitizedName}_${scoreItem.score}_${Date.now()}`;
    const docRef = doc(db, path, docId);
    
    await setDoc(docRef, scoreItem);
    console.log('Score saved to database successfully!');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
