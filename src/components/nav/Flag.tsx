/**
 * Country and confederation marks for the competition rail.
 *
 * Drawn inline rather than fetched. Three reasons, in order of weight:
 *
 * 1. A flag sprite is a network request on every page for something that never
 *    changes and is ~200 bytes of geometry.
 * 2. These render inside a 26px circle. A photographic flag asset scaled to
 *    26px is mush; geometry drawn FOR 26px stays crisp, and the simplifications
 *    below are deliberate rather than lossy resampling.
 * 3. England is not the United Kingdom. Every off-the-shelf flag set keyed by
 *    ISO country code gets this wrong, because there is no ISO code for
 *    England — and to a football audience that is not a small error.
 *
 * ── The one real risk: Italy and Mexico ────────────────────────────────────
 * Both are green-white-red vertical tricolours. At 26px, stripped of Mexico's
 * coat of arms, they are the SAME IMAGE — two competitions in the same rail
 * that a reader cannot tell apart. So Mexico keeps an abstracted centre
 * emblem and its own darker green, and the two are checked against each other
 * in Flag.test.ts. This is exactly the case where "just use flags" quietly
 * produces an unusable control.
 */

export type FlagKind =
  | 'ENG' | 'ESP' | 'ITA' | 'GER' | 'FRA' | 'USA' | 'MEX'
  | 'SCO' | 'NED' | 'POR' | 'TUR' | 'BEL' | 'BRA'
  | 'DEN' | 'NOR' | 'SWE' | 'SUI' | 'AUT' | 'POL' | 'GRE' | 'KSA' | 'AUS'
  | 'UEFA' | 'FIFA' | 'CONMEBOL' | 'CONCACAF' | 'AFC';

/** Competition id → the mark that identifies it. */
export const FLAG_FOR: Record<string, FlagKind> = {
  epl: 'ENG',
  laliga: 'ESP',
  seriea: 'ITA',
  bundesliga: 'GER',
  ligue1: 'FRA',
  mls: 'USA',
  ligamx: 'MEX',
  championship: 'ENG',
  'league-one': 'ENG',
  'league-two': 'ENG',
  scotprem: 'SCO',
  eredivisie: 'NED',
  primeira: 'POR',
  superlig: 'TUR',
  belgianpro: 'BEL',
  brasileirao: 'BRA',
  bundesliga2: 'GER',
  serieb: 'ITA',
  ligue2: 'FRA',
  laliga2: 'ESP',
  superligaen: 'DEN',
  eliteserien: 'NOR',
  allsvenskan: 'SWE',
  swiss: 'SUI',
  austria: 'AUT',
  ekstraklasa: 'POL',
  greece: 'GRE',
  saudi: 'KSA',
  aleague: 'AUS',
  ucl: 'UEFA',
  uel: 'UEFA',
  uecl: 'UEFA',
  cwc: 'FIFA',
  libertadores: 'CONMEBOL',
  concacaf: 'CONCACAF',
  afc: 'AFC',
};

const ITALY_GREEN = '#009246';
const MEXICO_GREEN = '#006847';

function Marks({ kind }: { kind: FlagKind }) {
  switch (kind) {
    case 'ENG':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <path d="M13 0h6v32h-6z" fill="#ce1124" />
          <path d="M0 13h32v6H0z" fill="#ce1124" />
        </>
      );
    case 'ESP':
      return (
        <>
          <rect width="32" height="32" fill="#c60b1e" />
          <rect y="8" width="32" height="16" fill="#ffc400" />
        </>
      );
    case 'ITA':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <rect width="10.67" height="32" fill={ITALY_GREEN} />
          <rect x="21.33" width="10.67" height="32" fill="#ce2b37" />
        </>
      );
    case 'GER':
      return (
        <>
          <rect width="32" height="32" fill="#000" />
          <rect y="10.67" width="32" height="10.67" fill="#dd0000" />
          <rect y="21.33" width="32" height="10.67" fill="#ffce00" />
        </>
      );
    case 'FRA':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <rect width="10.67" height="32" fill="#002395" />
          <rect x="21.33" width="10.67" height="32" fill="#ed2939" />
        </>
      );
    case 'USA':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          {/* Seven red stripes at 1/13 each, as on the flag. */}
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} y={(i * 32) / 13} width="32" height={32 / 13} fill="#b22234" />
          ))}
          <rect width="14" height={(7 * 32) / 13} fill="#3c3b6e" />
        </>
      );
    case 'MEX':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <rect width="10.67" height="32" fill={MEXICO_GREEN} />
          <rect x="21.33" width="10.67" height="32" fill="#ce1126" />
          {/* Abstracted arms. Without this Mexico and Italy are the same mark. */}
          <circle cx="16" cy="16" r="4.2" fill="#8c6239" />
          <circle cx="16" cy="16" r="2.2" fill="#fff" />
        </>
      );
    case 'SCO':
      return (
        <>
          <rect width="32" height="32" fill="#0065bf" />
          <path d="M0 0l32 32M32 0L0 32" stroke="#fff" strokeWidth="6" />
        </>
      );
    case 'NED':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <rect width="32" height="10.67" fill="#ae1c28" />
          <rect y="21.33" width="32" height="10.67" fill="#21468b" />
        </>
      );
    case 'POR':
      return (
        <>
          <rect width="32" height="32" fill="#da291c" />
          <rect width="13" height="32" fill="#046a38" />
          <circle cx="13" cy="16" r="4.6" fill="#ffe900" />
          <circle cx="13" cy="16" r="2.6" fill="#da291c" />
        </>
      );
    case 'TUR':
      return (
        <>
          <rect width="32" height="32" fill="#e30a17" />
          <circle cx="14" cy="16" r="6.2" fill="#fff" />
          <circle cx="16.6" cy="16" r="5" fill="#e30a17" />
          <path d="M22.6 16l4.6-1.6-2.9 3.9v-4.6l2.9 3.9z" fill="#fff" />
        </>
      );
    case 'BEL':
      return (
        <>
          <rect width="32" height="32" fill="#fdda24" />
          <rect width="10.67" height="32" fill="#000" />
          <rect x="21.33" width="10.67" height="32" fill="#ef3340" />
        </>
      );
    case 'BRA':
      return (
        <>
          <rect width="32" height="32" fill="#009b3a" />
          <path d="M16 4.5L29.5 16 16 27.5 2.5 16z" fill="#fedf00" />
          <circle cx="16" cy="16" r="5.4" fill="#002776" />
          <path d="M10.9 14.2a11 11 0 0 1 10.4 2.2" stroke="#fff" strokeWidth="1.5" fill="none" />
        </>
      );
    /*
      Denmark and Switzerland are the SAME MARK at this size — a white cross on
      red — and would be two indistinguishable entries in one rail. They are
      separated the way the real flags are: Denmark's cross is offset toward the
      hoist on a wide field, Switzerland's is centred, thicker, and its flag is
      square, so it is drawn inset on its own panel. Asserted in Flag.test.tsx.
    */
    case 'DEN':
      return (
        <>
          <rect width="32" height="32" fill="#c8102e" />
          <path d="M0 13.5h32v5H0z" fill="#fff" />
          <path d="M9.5 0h5v32h-5z" fill="#fff" />
        </>
      );
    case 'SUI':
      return (
        <>
          <rect width="32" height="32" fill="#d52b1e" />
          <rect x="13.4" y="7.5" width="5.2" height="17" fill="#fff" />
          <rect x="7.5" y="13.4" width="17" height="5.2" fill="#fff" />
        </>
      );
    case 'NOR':
      return (
        <>
          <rect width="32" height="32" fill="#ba0c2f" />
          <path d="M0 12h32v8H0z" fill="#fff" />
          <path d="M8 0h8v32H8z" fill="#fff" />
          <path d="M0 14h32v4H0z" fill="#00205b" />
          <path d="M10 0h4v32h-4z" fill="#00205b" />
        </>
      );
    case 'SWE':
      return (
        <>
          <rect width="32" height="32" fill="#006aa7" />
          <path d="M0 13.5h32v5H0z" fill="#fecc00" />
          <path d="M9.5 0h5v32h-5z" fill="#fecc00" />
        </>
      );
    case 'AUT':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <rect width="32" height="10.67" fill="#ed2939" />
          <rect y="21.33" width="32" height="10.67" fill="#ed2939" />
        </>
      );
    case 'POL':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          <rect y="16" width="32" height="16" fill="#dc143c" />
        </>
      );
    case 'GRE':
      return (
        <>
          <rect width="32" height="32" fill="#fff" />
          {[0, 2, 4, 6, 8].map((i) => (
            <rect key={i} y={(i * 32) / 9} width="32" height={32 / 9} fill="#0d5eaf" />
          ))}
          <rect width={(32 * 5) / 9} height={(32 * 5) / 9} fill="#0d5eaf" />
          <path d="M8.9 0v17.8M0 8.9h17.8" stroke="#fff" strokeWidth="3.5" />
        </>
      );
    case 'KSA':
      return (
        <>
          <rect width="32" height="32" fill="#165d31" />
          <rect x="6" y="20" width="20" height="2.2" fill="#fff" />
          <path d="M7 13h14v2.4H7z" fill="#fff" />
          <circle cx="23" cy="14.2" r="1.6" fill="#fff" />
        </>
      );
    case 'AUS':
      return (
        <>
          <rect width="32" height="32" fill="#00008b" />
          <path d="M0 0h14v10H0z" fill="#0a2f7a" />
          <path d="M0 0l14 10M14 0L0 10" stroke="#fff" strokeWidth="1.6" />
          <path d="M7 0v10M0 5h14" stroke="#fff" strokeWidth="2.4" />
          <circle cx="7" cy="22" r="2.4" fill="#fff" />
          <circle cx="21" cy="12" r="1.3" fill="#fff" />
          <circle cx="25" cy="20" r="1.3" fill="#fff" />
          <circle cx="20" cy="25" r="1.3" fill="#fff" />
        </>
      );
    case 'UEFA':
      return (
        <>
          <rect width="32" height="32" fill="#04345c" />
          <g fill="#fff">
            <circle cx="16" cy="7" r="1.7" />
            <circle cx="23.6" cy="11.2" r="1.7" />
            <circle cx="25" cy="20" r="1.7" />
            <circle cx="16" cy="24.4" r="1.7" />
            <circle cx="7" cy="20" r="1.7" />
            <circle cx="8.4" cy="11.2" r="1.7" />
          </g>
        </>
      );
    case 'FIFA':
      return (
        <>
          <rect width="32" height="32" fill="#1a2b6d" />
          <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="1.6" />
          <path d="M16 7v18M7.4 13h17.2M7.4 19h17.2" stroke="#fff" strokeWidth="1.4" fill="none" />
        </>
      );
    case 'CONMEBOL':
      return (
        <>
          <rect width="32" height="32" fill="#0b6b3a" />
          <path d="M16 6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L16 20.6 10.1 23.8l1.3-6.5-4.9-4.5 6.6-.8z" fill="#f5d547" />
        </>
      );
    case 'CONCACAF':
      return (
        <>
          <rect width="32" height="32" fill="#0d5c7a" />
          <path d="M16 5c5 4 5 18 0 22-5-4-5-18 0-22z" fill="#fff" opacity="0.9" />
          <path d="M6 16h20" stroke="#fff" strokeWidth="1.6" />
        </>
      );
    case 'AFC':
      return (
        <>
          <rect width="32" height="32" fill="#7a1f5c" />
          <circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="1.6" />
          <path d="M16 8c4 4 4 12 0 16-4-4-4-12 0-16z" fill="#fff" />
        </>
      );
  }
}

export function Flag({
  kind, size = 26, title,
}: {
  kind: FlagKind;
  size?: number;
  /** Only set on a standalone mark; inside a labelled control leave it off. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="block shrink-0 rounded-full"
      // Clipped to a circle so every mark is the same silhouette regardless of
      // the flag's real aspect ratio — the rail is a set of tokens, not an
      // atlas, and a 3:2 rectangle beside a 1:1 square reads as a mistake.
      style={{ overflow: 'hidden' }}
    >
      {title ? <title>{title}</title> : null}
      <Marks kind={kind} />
    </svg>
  );
}
