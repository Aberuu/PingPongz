// Rules and Scoring Engine for Table Tennis (VoxelPong)
import { MATCH_RULES } from './constants.js';
import type { PlayerSlot, ScoreState } from './types.js';

export function checkMatchWinner(score: ScoreState): PlayerSlot | null {
  const { pointsToWin, minLeadToWin } = MATCH_RULES;
  if (score.p1 >= pointsToWin && score.p1 - score.p2 >= minLeadToWin) {
    return 'p1';
  }
  if (score.p2 >= pointsToWin && score.p2 - score.p1 >= minLeadToWin) {
    return 'p2';
  }
  return null;
}

export function isDeuce(score: ScoreState): boolean {
  return score.p1 >= MATCH_RULES.pointsToWin - 1 && score.p2 >= MATCH_RULES.pointsToWin - 1;
}

export function determineServer(initialServer: PlayerSlot, score: ScoreState): PlayerSlot {
  const otherPlayer: PlayerSlot = initialServer === 'p1' ? 'p2' : 'p1';
  const totalScore = score.p1 + score.p2;

  // Once both players reach 10 points (deuce territory), serve alternates every 1 point
  if (score.p1 >= 10 && score.p2 >= 10) {
    const pointsAfterDeuce = totalScore - 20;
    return pointsAfterDeuce % 2 === 0 ? initialServer : otherPlayer;
  }

  // Normal rule: rotates every 2 points
  const rotationIndex = Math.floor(totalScore / MATCH_RULES.servesPerRotation);
  return rotationIndex % 2 === 0 ? initialServer : otherPlayer;
}

export interface RallyState {
  lastHitter: PlayerSlot | null;
  hitCountCurrentTurn: number;
  hasBouncedOnTable: boolean;
  bouncesOnSide: { p1: number; p2: number };
  touchedNetThisTurn: boolean;
  isServeRally: boolean;
  servePhase: 'WAITING_FOR_HIT' | 'MUST_BOUNCE_SERVER_SIDE' | 'MUST_CROSS_NET' | 'NORMAL';
}

export function createInitialRallyState(server: PlayerSlot): RallyState {
  return {
    lastHitter: null,
    hitCountCurrentTurn: 0,
    hasBouncedOnTable: false,
    bouncesOnSide: { p1: 0, p2: 0 },
    touchedNetThisTurn: false,
    isServeRally: true,
    servePhase: 'WAITING_FOR_HIT'
  };
}
