import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';

/**
 * The 404, in the product's own voice.
 *
 * Next ships a stock black-on-white "404 | This page could not be found" that
 * looks like a server, not a product — and it is the page a reader is most
 * likely to hit from a stale link or a mistyped club id. Leaving it is the
 * single loudest "unfinished" signal a site can send, because it appears at
 * exactly the moment the reader is already slightly annoyed.
 *
 * It offers routes rather than apologies. Someone here has lost something
 * specific, and the useful response is the shortest path back to it.
 */
export default function NotFound() {
  const links = [
    { href: '/', label: 'Today', note: 'Live matches across every competition' },
    { href: '/table?competition=epl', label: 'Tables', note: 'Standings, form and projections' },
    { href: '/rankings', label: 'World rankings', note: 'Every club on one scale' },
    { href: '/search', label: 'Search', note: 'Find a club or a player' },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col justify-center px-4 py-10">
      <div className="max-w-prose">
        <Wordmark />
        <p className="figure mt-8 text-2xs uppercase tracking-caps text-ink-muted">
          404
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight">
          That page isn&rsquo;t here
        </h1>
        <p className="mt-3 text-ink-secondary">
          Most likely a club or match that belongs to a different season — ids
          are not shared between them, so a link from one will not resolve in
          another.
        </p>
      </div>

      <ul className="mt-8 grid max-w-3xl gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="lit-edge block rounded-lg border border-border-subtle bg-surface-1 p-4 transition-[transform,border-color,box-shadow] duration-normal ease-standard hover:-translate-y-px hover:border-border hover:shadow-md"
            >
              <span className="block font-display text-lg leading-tight">{l.label}</span>
              <span className="mt-1 block text-sm text-ink-secondary">{l.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
