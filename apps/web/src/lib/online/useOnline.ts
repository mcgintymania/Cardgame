import { useEffect, useState } from 'react';
import { online, type Session } from './client.ts';

/** The current online session (null when signed out), re-rendering on change. */
export function useSession(): Session | null {
  const [s, setS] = useState<Session | null>(online.session);
  useEffect(() => online.subscribe(() => setS(online.session)), []);
  return s;
}
