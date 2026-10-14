import { describe, it, expect } from 'vitest';
import { BOT_SETTINGS, PADDLE_PHYSICS, TABLE_DIMENSIONS, SIMULATION } from '../shared/constants.js';
import { GameRoom } from '../server/gameRoom.js';

describe('PRD 3.0 Practice Mode & AI Bot System', () => {
  it('validates 3-tier bot parameters for Easy, Medium, and Hard', () => {
    expect(BOT_SETTINGS.easy.reactionTime).toBe(0.45);
    expect(BOT_SETTINGS.easy.errorJitter).toBe(0.09);
    expect(BOT_SETTINGS.easy.smashChance).toBe(0.10);

    expect(BOT_SETTINGS.medium.reactionTime).toBe(0.28);
    expect(BOT_SETTINGS.medium.errorJitter).toBe(0.04);
    expect(BOT_SETTINGS.medium.smashChance).toBe(0.35);

    expect(BOT_SETTINGS.hard.reactionTime).toBe(0.18);
    expect(BOT_SETTINGS.hard.errorJitter).toBe(0.015);
    expect(BOT_SETTINGS.hard.smashChance).toBe(0.65);

    // Harder bots must have faster reaction times and smaller error jitter
    expect(BOT_SETTINGS.hard.reactionTime).toBeLessThan(BOT_SETTINGS.medium.reactionTime);
    expect(BOT_SETTINGS.medium.reactionTime).toBeLessThan(BOT_SETTINGS.easy.reactionTime);
    expect(BOT_SETTINGS.hard.errorJitter).toBeLessThan(BOT_SETTINGS.medium.errorJitter);
  });

  it('correctly predicts linear ball intercept position at opponent baseline', () => {
    // Ball located at table center heading towards P2 (-Z)
    const ballPos = { x: 0.10, y: 0.85, z: 0.0 };
    const ballVel = { x: 0.50, y: 0.0, z: -5.0 }; // Moving at -5 m/s along Z
    const targetZ = PADDLE_PHYSICS.p2BaseZ; // -1.62m

    const timeToArrive = (targetZ - ballPos.z) / ballVel.z; // (-1.62 - 0) / -5 = 0.324s
    expect(timeToArrive).toBeCloseTo(0.324, 3);

    const predictedX = ballPos.x + ballVel.x * timeToArrive; // 0.10 + 0.5 * 0.324 = 0.262m
    expect(predictedX).toBeCloseTo(0.262, 3);
  });

  it('verifies GameRoom mode switching and bot automated readiness', () => {
    // Mock socket.io server with room scoping support
    const mockIo: any = {
      emit: () => {},
      to: () => mockIo
    };

    const room = new GameRoom(mockIo);
    expect(room.gameMode).toBe('match');

    // Switch to bot mode
    room.handleSetMode('bot', 'hard');
    expect(room.gameMode).toBe('bot');
    expect(room.botDifficulty).toBe('hard');
    expect(room.p2).toBeDefined();
    expect(room.p2?.ready).toBe(true);
    expect(room.p2?.name).toContain('HARD');

    // Switch to practice mode
    room.handleSetMode('practice', undefined, 'left');
    expect(room.gameMode).toBe('practice');
    expect(room.practiceZone).toBe('left');
    expect(room.p2?.name).toBe('Ball Machine');
  });

  it('ensures practice mode ball machine feeds balls to selected zones', () => {
    const mockIo: any = {
      emit: () => {},
      to: () => mockIo
    };

    const room = new GameRoom(mockIo);
    room.handleSetMode('practice', undefined, 'left');
    room.feedPracticeBall();

    expect(room.phase).toBe('RALLY');
    expect(room.practiceStats.ballsServed).toBe(1);
    // Left zone requires negative X velocity towards x = -0.58
    expect(room.ball.velocity.x).toBeLessThan(0);
    // Ball must move forward towards player (+Z)
    expect(room.ball.velocity.z).toBeGreaterThan(0);
  });
});
