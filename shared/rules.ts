// Rules and Scoring Engine for Table Tennis (VoxelPong)
import { MATCH_RULES } from './constants.js';
import type { PlayerSlot, ScoreState, RuleAnnouncement } from './types.js';

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

export function detectRuleAnnouncement(
  prevScore: ScoreState,
  newScore: ScoreState,
  p1Name = 'Pemain 1',
  p2Name = 'Pemain 2'
): RuleAnnouncement | null {
  const { pointsToWin } = MATCH_RULES;

  // 1. Check if match winner already reached
  if (checkMatchWinner(newScore)) {
    return null;
  }

  // 2. Check DEUCE (10-10, 11-11, etc.)
  if (newScore.p1 >= pointsToWin - 1 && newScore.p2 >= pointsToWin - 1 && newScore.p1 === newScore.p2) {
    if (prevScore.p1 !== newScore.p1 || prevScore.p2 !== newScore.p2) {
      const isFirstDeuce = newScore.p1 === pointsToWin - 1 && newScore.p2 === pointsToWin - 1;
      return {
        id: `${Date.now()}-deuce`,
        type: 'DEUCE',
        title: isFirstDeuce ? 'DEUCE!' : 'DEUCE (KEMBALI IMBANG)!',
        subtitle: 'Selisih 2 poin untuk menang. Servis berganti setiap 1 poin.',
        timestamp: Date.now()
      };
    }
  }

  // 3. Check MATCH POINT / ADVANTAGE
  if (newScore.p1 < pointsToWin - 1 || newScore.p2 < pointsToWin - 1) {
    // Normal play match point (10-x)
    if (newScore.p1 === pointsToWin - 1 && newScore.p2 <= pointsToWin - 2) {
      return {
        id: `${Date.now()}-mp-p1`,
        type: 'MATCH_POINT',
        title: `MATCH POINT: ${p1Name.toUpperCase()}!`,
        subtitle: `${p1Name} berpeluang mengunci kemenangan pertandingan.`,
        player: 'p1',
        timestamp: Date.now()
      };
    }
    if (newScore.p2 === pointsToWin - 1 && newScore.p1 <= pointsToWin - 2) {
      return {
        id: `${Date.now()}-mp-p2`,
        type: 'MATCH_POINT',
        title: `MATCH POINT: ${p2Name.toUpperCase()}!`,
        subtitle: `${p2Name} berpeluang mengunci kemenangan pertandingan.`,
        player: 'p2',
        timestamp: Date.now()
      };
    }
  } else {
    // Deuce territory (11-10, 12-11, etc.)
    if (newScore.p1 - newScore.p2 === 1) {
      return {
        id: `${Date.now()}-adv-p1`,
        type: 'MATCH_POINT',
        title: `ADVANTAGE: ${p1Name.toUpperCase()}!`,
        subtitle: `Match Point! ${p1Name} membutuhkan 1 poin lagi untuk menang.`,
        player: 'p1',
        timestamp: Date.now()
      };
    }
    if (newScore.p2 - newScore.p1 === 1) {
      return {
        id: `${Date.now()}-adv-p2`,
        type: 'MATCH_POINT',
        title: `ADVANTAGE: ${p2Name.toUpperCase()}!`,
        subtitle: `Match Point! ${p2Name} membutuhkan 1 poin lagi untuk menang.`,
        player: 'p2',
        timestamp: Date.now()
      };
    }
  }

  return null;
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
