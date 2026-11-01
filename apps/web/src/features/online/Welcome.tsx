// The front door when you're not signed in: sign in or make an account to play
// your friends online, or just play on this device (no account, works offline).

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../design/ui.tsx';
import { useStore } from '../../lib/store.ts';
import { gameFn } from '../../lib/online/tables.ts';
import { useSession } from '../../lib/online/useOnline.ts';
import { RecoveryCodes, SignedOut } from './Online.tsx';

const KEY = 'cardclub.welcome.v1';
/** Has this device chosen to play without signing in? */
export function playingOnDevice(): boolean { try { return localStorage.getItem(KEY) === 'device'; } catch { return false; } }
export function chooseDevice() { try { localStorage.setItem(KEY, 'device'); } catch { /* storage blocked */ } }
export function forgetWelcomeChoice() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } }

/** Your recovery codes straight after making an account, before anything else. */
export function CodesPage({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return <div className="onboard"><div className="onboard-card"><RecoveryCodes codes={codes} onDone={onDone} /></div></div>;
}

export function Welcome({ onDevice, onCodes }: { onDevice: () => void; onCodes: (codes: string[]) => void }) {
  const [mode, setMode] = useState<'door' | 'in' | 'up'>('door');
  const { profile } = useStore();
  return (
    <div className="onboard welcome">
      <div className="onboard-card">
        <p className="eyebrow">Members only</p>
        <h1 className="display onboard-title">Card Club</h1>
        {mode === 'door' ? (
          <>
            <p className="lede">{profile ? `Welcome back, ${profile.name}.` : 'Pull up a chair.'} Sign in to play your friends and family online, or play here on this device.</p>
            <div className="welcome-choices">
              <Button size="lg" onClick={() => setMode('in')}>Sign in</Button>
              <Button size="lg" variant="ghost" onClick={() => setMode('up')}>Create an account</Button>
            </div>
            <button className="link-btn welcome-device" onClick={() => { chooseDevice(); onDevice(); }}>Play on this device without an account</button>
            <p className="fine">No email needed. Signed in, your coins, items and progress are saved to your account and follow you to any device{profile ? ' (what\'s on this device is added to it)' : ''}. Games work offline either way.</p>
          </>
        ) : (
          <>
            <SignedOut start={mode} onCodes={onCodes} />
            <button className="link-btn welcome-device" onClick={() => setMode('door')}>← Back</button>
          </>
        )}
      </div>
    </div>
  );
}

/** While you're signed in, your character goes to the server so the people you play see it. */
export function useLookSync() {
  const session = useSession();
  const { profile } = useStore();
  const last = useRef('');
  const look = profile?.avatar ? JSON.stringify(profile.avatar) : '';
  useEffect(() => {
    if (!session || !look || look === last.current) return;
    const t = setTimeout(() => {
      gameFn('look', { look: JSON.parse(look) }).then(() => { last.current = look; }).catch(() => { /* try again next change */ });
    }, 1200);
    return () => clearTimeout(t);
  }, [session?.user_id, look]);
}
