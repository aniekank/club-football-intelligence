import { describe, it, expect } from 'vitest';
import { mapTransfers, summariseForTeam, type FmTransfersBlock } from './fotmobTransfers';

/**
 * The classification is the whole job. A missing fee has three different causes
 * — a loan, a free, and a deal whose fee was never published — and collapsing
 * them loses real information. Any of them treated as €0 would understate every
 * spending total built on top.
 */
const block: FmTransfersBlock = {
  data: [
    { name: 'Big Money', playerId: 1, transferDate: '2026-08-20T10:00:00Z',
      fromClubId: 100, fromClubFullName: 'Selling FC', toClubId: 200, toClubFullName: 'Buying FC',
      fee: { feeText: 'fee', localizedFeeText: 'transfer_fee', value: 60_000_000 },
      marketValue: 55_000_000, onLoan: false, position: { label: 'ST' } },
    { name: 'On Loan', playerId: 2, transferDate: '2026-08-19T10:00:00Z',
      fromClubId: 200, fromClubFullName: 'Buying FC', toClubId: 300, toClubFullName: 'Elsewhere',
      fee: { feeText: 'on loan', localizedFeeText: 'on_loan' }, onLoan: true },
    { name: 'Free Agent', playerId: 3, transferDate: '2026-08-18T10:00:00Z',
      fromClubId: 400, fromClubFullName: 'Old Club', toClubId: 200, toClubFullName: 'Buying FC',
      fee: { feeText: 'free', localizedFeeText: 'transfer_type_free_transfer' }, onLoan: false },
    { name: 'Secret Deal', playerId: 4, transferDate: '2026-08-17T10:00:00Z',
      fromClubId: 200, fromClubFullName: 'Buying FC', toClubId: 500, toClubFullName: 'Somewhere',
      fee: null, onLoan: false },
    { name: 'Sold On', playerId: 5, transferDate: '2026-08-16T10:00:00Z',
      fromClubId: 200, fromClubFullName: 'Buying FC', toClubId: 600, toClubFullName: 'Rich FC',
      fee: { feeText: 'fee', localizedFeeText: 'transfer_fee', value: 20_000_000 }, onLoan: false },
    { name: 'Renewal', playerId: 6, transferDate: '2026-08-15T10:00:00Z',
      fromClubId: 200, toClubId: 200, contractExtension: true },
  ],
};

const known = new Set(['100', '200']);
const transfers = mapTransfers(block, known);

describe('transfer mapping', () => {
  it('drops a contract extension — it is not a move', () => {
    expect(transfers.map((t) => t.playerName)).not.toContain('Renewal');
    expect(transfers).toHaveLength(5);
  });

  it('classifies each reason a fee can be missing', () => {
    const byName = new Map(transfers.map((t) => [t.playerName, t]));
    expect(byName.get('Big Money')!.kind).toBe('permanent');
    expect(byName.get('On Loan')!.kind).toBe('loan');
    expect(byName.get('Free Agent')!.kind).toBe('free');
    expect(byName.get('Secret Deal')!.kind).toBe('undisclosed');
  });

  it('never puts a fee on a loan or a free', () => {
    for (const t of transfers) {
      if (t.kind === 'loan' || t.kind === 'free') expect(t.feeEur).toBeNull();
    }
    // And an undisclosed deal is null, not zero — a fee was probably paid.
    expect(transfers.find((t) => t.playerName === 'Secret Deal')!.feeEur).toBeNull();
  });

  it('reads the fee from fee.value', () => {
    // Not `amountEuroEstimated`, which the live feed leaves empty on all 100.
    expect(transfers.find((t) => t.playerName === 'Big Money')!.feeEur).toBe(60_000_000);
  });

  it('only links clubs that exist in this snapshot', () => {
    const t = transfers.find((x) => x.playerName === 'Big Money')!;
    expect(t.fromTeamId).toBe('100');
    expect(t.toTeamId).toBe('200');
    // "Elsewhere" is outside the competition: named, but not linkable.
    const loan = transfers.find((x) => x.playerName === 'On Loan')!;
    expect(loan.toTeamId).toBeNull();
    expect(loan.toTeamName).toBe('Elsewhere');
  });

  it('orders newest first', () => {
    const dates = transfers.map((t) => t.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('gives each move a key that survives a double transfer', () => {
    expect(new Set(transfers.map((t) => t.id)).size).toBe(transfers.length);
  });
});

describe('club window summary', () => {
  const s = summariseForTeam(transfers, '200');

  it('counts arrivals and departures', () => {
    // In: Big Money, Free Agent. Out: On Loan, Secret Deal, Sold On.
    expect(s.arrivals).toBe(2);
    expect(s.departures).toBe(3);
  });

  it('totals only disclosed fees', () => {
    expect(s.spendEur).toBe(60_000_000);
    expect(s.receivedEur).toBe(20_000_000);
    expect(s.netEur).toBe(-40_000_000);
  });

  it('reports how many deals it could not price', () => {
    // Without this the totals would silently understate the window.
    expect(s.undisclosed).toBe(1);
  });
});
