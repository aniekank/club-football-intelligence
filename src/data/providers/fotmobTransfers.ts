import type { ID, Transfer, TransferKind } from '@/domain/types';

/**
 * Transfer mapping.
 *
 * This is the feed the domain was built for and never had. `Player.affiliations`
 * has been an interval list since the first commit precisely because a squad is
 * not a fixed set — a transfer is what opens and closes those intervals — and
 * until now nothing filled them.
 *
 * ── The classification that matters ────────────────────────────────────────
 * A missing fee has three different causes and they must not be conflated:
 * a LOAN (no fee by nature), a FREE (out of contract, fee genuinely zero), and
 * an UNDISCLOSED deal (a fee was paid and not published). Collapsing them loses
 * real information, and treating any of them as €0 would understate spending in
 * every aggregate built on top.
 */

interface FmFee {
  feeText?: string;
  localizedFeeText?: string;
  /** Euros. Present only on a disclosed permanent deal. */
  value?: number;
}

export interface FmTransfer {
  name?: string;
  playerId?: number | string;
  position?: { label?: string };
  transferDate?: string;
  fromClub?: string;
  fromClubFullName?: string;
  fromClubId?: number | string;
  toClub?: string;
  toClubFullName?: string;
  toClubId?: number | string;
  fee?: FmFee | null;
  marketValue?: number | null;
  onLoan?: boolean;
  contractExtension?: boolean;
}

export interface FmTransfersBlock {
  data?: FmTransfer[];
}

function classify(t: FmTransfer): TransferKind {
  if (t.onLoan) return 'loan';
  const key = t.fee?.localizedFeeText ?? '';
  if (key.includes('free')) return 'free';
  if (typeof t.fee?.value === 'number' && t.fee.value > 0) return 'permanent';
  // A permanent move with no published number. Not free, not zero — unknown.
  return 'undisclosed';
}

const id = (v: number | string | null | undefined): ID | null =>
  v === null || v === undefined || v === '' ? null : String(v);

/**
 * Map the feed onto the domain.
 *
 * `knownTeamIds` scopes the from/to ids to clubs actually in this snapshot, so
 * a link only ever points at a page that exists — a transfer from Rennes into
 * MLS names Rennes but does not pretend to link to it.
 */
export function mapTransfers(
  block: FmTransfersBlock | undefined,
  knownTeamIds: Set<string>,
): Transfer[] {
  const out: Transfer[] = [];
  for (const t of block?.data ?? []) {
    if (t.contractExtension) continue; // not a move
    const playerId = id(t.playerId);
    if (!playerId || !t.transferDate) continue;

    const kind = classify(t);
    const fromId = id(t.fromClubId);
    const toId = id(t.toClubId);

    out.push({
      // The feed has no transfer id, and one player can move twice in a window,
      // so the key includes the date and both clubs.
      id: `${playerId}-${t.transferDate.slice(0, 10)}-${fromId ?? 'x'}-${toId ?? 'x'}`,
      playerId,
      playerName: t.name ?? 'Unknown',
      position: t.position?.label ?? null,
      fromTeamId: fromId && knownTeamIds.has(fromId) ? fromId : null,
      fromTeamName: t.fromClubFullName ?? t.fromClub ?? 'Unknown',
      toTeamId: toId && knownTeamIds.has(toId) ? toId : null,
      toTeamName: t.toClubFullName ?? t.toClub ?? 'Unknown',
      date: t.transferDate,
      kind,
      // Only a disclosed permanent deal carries a number. A loan or a free must
      // stay null so it never lands in a spending total as money that moved.
      feeEur: kind === 'permanent' && typeof t.fee?.value === 'number' ? t.fee.value : null,
      marketValueEur: typeof t.marketValue === 'number' ? t.marketValue : null,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface TransferWindowSummary {
  arrivals: number;
  departures: number;
  /** Disclosed fees only — labelled as such wherever shown. */
  spendEur: number;
  receivedEur: number;
  netEur: number;
  /** How many deals had no published fee, so the totals can be caveated. */
  undisclosed: number;
}

/** A club's window, from the transfers in a snapshot. */
export function summariseForTeam(transfers: Transfer[], teamId: ID): TransferWindowSummary {
  const arrivals = transfers.filter((t) => t.toTeamId === teamId);
  const departures = transfers.filter((t) => t.fromTeamId === teamId);
  const sum = (list: Transfer[]) => list.reduce((n, t) => n + (t.feeEur ?? 0), 0);
  const spendEur = sum(arrivals);
  const receivedEur = sum(departures);
  return {
    arrivals: arrivals.length,
    departures: departures.length,
    spendEur,
    receivedEur,
    netEur: receivedEur - spendEur,
    undisclosed: [...arrivals, ...departures].filter((t) => t.kind === 'undisclosed').length,
  };
}
