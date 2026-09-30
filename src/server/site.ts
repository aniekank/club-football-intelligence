import { headers } from 'next/headers';

/**
 * Which front door the reader came through.
 *
 * One app, two addresses. club.taskintel.app is the whole of club football;
 * afcon.taskintel.app is the same engine opened onto the Africa Cup of
 * Nations, under its own name, for readers who came for the tournament and
 * would find "Club Football" above a national-team competition confusing.
 * Everything else — data, ratings, pages — is shared, so the tournament gets
 * every fix the leagues get.
 *
 * Decided by the Host header. `afcon.localhost` works too, for local checks.
 */
export interface Site {
  id: 'club' | 'afcon';
  /** The wordmark's product line: "Club Football" / "AFCON". */
  product: string;
  fullName: string;
  description: string;
}

const CLUB: Site = {
  id: 'club',
  product: 'Club Football',
  fullName: 'Club Football Intelligence',
  description:
    'Ratings, season projections and market comparison for club football — the Premier League to the Libertadores, computed from match data.',
};

const AFCON: Site = {
  id: 'afcon',
  product: 'AFCON',
  fullName: 'AFCON Intelligence',
  description:
    'The Africa Cup of Nations, modelled: qualifying groups, who goes through, the finals bracket and every team’s chance of lifting the trophy.',
};

export function currentSite(): Site {
  let host = '';
  try {
    const h = headers();
    host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  } catch {
    // Outside a request (build, tests): the default site.
  }
  return /^afcon\./i.test(host) ? AFCON : CLUB;
}
