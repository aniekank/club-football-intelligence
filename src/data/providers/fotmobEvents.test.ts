import { describe, it, expect } from 'vitest';
import { mapEvents, goalEvents, type FmEventsBlock } from './fotmobEvents';

/**
 * The gap these tests close: the product shipped showing "3-0" with nobody
 * attached to it. Everything here is about a goal reaching the page with the
 * right name, the right minute and the right team.
 */
const block: FmEventsBlock = {
  events: [
    { type: 'Goal', time: 15, isHome: true, playerId: 749736, nameStr: 'Kai Havertz', assistStr: 'assist by Bukayo Saka', assistPlayerId: 961995 },
    { type: 'Card', time: 27, isHome: false, playerId: 1615927, nameStr: 'Caleb Yirenkyi', card: 'Yellow' },
    { type: 'AddedTime', time: 45 },
    { type: 'Half', time: 45 },
    { type: 'Goal', time: 55, isHome: false, playerId: 111, nameStr: 'Someone Else', ownGoal: true },
    { type: 'Goal', time: 70, isHome: true, playerId: 222, nameStr: 'Spot Kick', goalDescription: 'Penalty' },
    { type: 'Substitution', time: 62, isHome: false, swap: [{ id: '845985', name: 'Victor Torp' }, { id: '1615927', name: 'Caleb Yirenkyi' }] },
    { type: 'Card', time: 80, isHome: true, playerId: 333, nameStr: 'Sent Off', card: 'Red', cardDescription: 'Second yellow' },
    { type: 'Goal', time: 200, isHome: true, playerId: 444, nameStr: 'Shootout', isPenaltyShootoutEvent: true },
  ],
};

const events = mapEvents(block, 'm1', 'HOME', 'AWAY');

describe('match events', () => {
  it('drops display furniture and shoot-outs', () => {
    // Half-time and added-time markers are FotMob's own timeline decoration,
    // not things that happened. A shoot-out is not part of the 90 and would
    // corrupt the clock.
    expect(events.some((e) => e.detail.includes('Shootout'))).toBe(false);
    expect(events).toHaveLength(6);
  });

  it('names the scorer, the minute and the side', () => {
    const first = events[0]!;
    expect(first.type).toBe('GOAL');
    expect(first.minute).toBe(15);
    expect(first.teamId).toBe('HOME');
    expect(first.detail).toContain('Kai Havertz');
    expect(first.playerId).toBe('749736');
  });

  it('keeps the assist without stuttering', () => {
    // `assistStr` already reads "assist by X"; prefixing another "assist"
    // produced "assist assist by Harrison Armstrong" in the first cut.
    expect(events[0]!.detail).toContain('assist by Bukayo Saka');
    expect(events[0]!.detail).not.toContain('assist assist');
    expect(events[0]!.relatedPlayerId).toBe('961995');
  });

  it('distinguishes penalties and own goals from ordinary goals', () => {
    const kinds = goalEvents(events).map((e) => e.type);
    expect(kinds).toContain('GOAL');
    expect(kinds).toContain('OWN_GOAL');
    expect(kinds).toContain('PENALTY_GOAL');
    // An own goal must not be credited as a normal one, or it flatters a
    // defender and corrupts any top-scorer list built from the stream.
    const og = goalEvents(events).find((e) => e.type === 'OWN_GOAL')!;
    expect(og.detail).toContain('(og)');
  });

  it('reads a substitution in the right direction', () => {
    // swap is [on, off]. Reversed, every substitution in the match is wrong.
    const sub = events.find((e) => e.type === 'SUBSTITUTION')!;
    expect(sub.detail).toBe('Victor Torp on for Caleb Yirenkyi');
    expect(sub.playerId).toBe('845985');
    expect(sub.relatedPlayerId).toBe('1615927');
  });

  it('separates a second yellow from a straight red', () => {
    expect(events.find((e) => e.detail === 'Sent Off')?.type).toBe('SECOND_YELLOW');
    expect(events.find((e) => e.detail === 'Caleb Yirenkyi')?.type).toBe('YELLOW_CARD');
  });

  it('orders by clock, added time last', () => {
    const minutes = events.map((e) => e.minute);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
  });

  it('survives an absent or empty event block', () => {
    expect(mapEvents(undefined, 'm', 'H', 'A')).toEqual([]);
    expect(mapEvents({ events: [] }, 'm', 'H', 'A')).toEqual([]);
  });
});
