/**
 * Next.js server-start hook. Kicks off the snapshot load WITHOUT awaiting it, so
 * an upstream stall delays data rather than the whole server.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { bootstrap } = await import('./data/bootstrap');
  void bootstrap().catch((err) => {
    console.error('[cfi] bootstrap failed', err);
  });
}
