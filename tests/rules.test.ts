import { describe, it, expect } from 'vitest';
import { checkMatchWinner, isDeuce, determineServer, createInitialRallyState } from '../shared/rules.js';

describe('Table Tennis Scoring Rules', () => {
  it('identifies winner when reaching 11 with 2+ lead', () => {
    expect(checkMatchWinner({ p1: 11, p2: 9 })).toBe('p1');
    expect(checkMatchWinner({ p1: 8, p2: 11 })).toBe('p2');
    // 11-10 is NOT a win (must win by 2)
    expect(checkMatchWinner({ p1: 11, p2: 10 })).toBeNull();
    // 12-10 is a win
    expect(checkMatchWinner({ p1: 12, p2: 10 })).toBe('p1');
    // 13-14 is not a win
    expect(checkMatchWinner({ p1: 13, p2: 14 })).toBeNull();
    // 13-15 is a win for P2
    expect(checkMatchWinner({ p1: 13, p2: 15 })).toBe('p2');
  });

  it('correctly identifies deuce state', () => {
    expect(isDeuce({ p1: 9, p2: 9 })).toBe(false);
    expect(isDeuce({ p1: 10, p2: 10 })).toBe(true);
    expect(isDeuce({ p1: 11, p2: 11 })).toBe(true);
  });

  it('alternates serve every 2 points during regular play', () => {
    // Initial server: p1
    expect(determineServer('p1', { p1: 0, p2: 0 })).toBe('p1');
    expect(determineServer('p1', { p1: 1, p2: 0 })).toBe('p1');
    expect(determineServer('p1', { p1: 1, p2: 1 })).toBe('p2');
    expect(determineServer('p1', { p1: 2, p2: 1 })).toBe('p2');
    expect(determineServer('p1', { p1: 2, p2: 2 })).toBe('p1');
  });

  it('alternates serve every 1 point during deuce (10-10+)', () => {
    // Score 10-10 = 20 points
    expect(determineServer('p1', { p1: 10, p2: 10 })).toBe('p1');
    // Score 11-10 = 21 points
    expect(determineServer('p1', { p1: 11, p2: 10 })).toBe('p2');
    // Score 11-11 = 22 points
    expect(determineServer('p1', { p1: 11, p2: 11 })).toBe('p1');
    // Score 12-11 = 23 points
    expect(determineServer('p1', { p1: 12, p2: 11 })).toBe('p2');
  });

  it('initializes rally state properly', () => {
    const rally = createInitialRallyState('p1');
    expect(rally.isServeRally).toBe(true);
    expect(rally.servePhase).toBe('WAITING_FOR_HIT');
    expect(rally.bouncesOnSide.p1).toBe(0);
    expect(rally.bouncesOnSide.p2).toBe(0);
  });
});
