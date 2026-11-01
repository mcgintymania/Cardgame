// Install Card Club as an app (home screen / desktop icon, opens full screen, works offline).
import React, { useEffect, useState } from 'react';
import { Button } from '../../design/ui.tsx';
import { canInstallNow, installNow, isInstalled, isIOS, onInstallChange, pwaAvailable } from '../../lib/pwa.ts';

const HIDE_KEY = 'cardclub.installhint.v1';

function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => onInstallChange(() => tick((n: number) => n + 1)), []);
  return { available: pwaAvailable() && !isInstalled(), prompt: canInstallNow(), ios: isIOS() };
}

function HowTo({ ios }: { ios: boolean }) {
  return ios
    ? <p className="muted small">On iPhone or iPad: open this page in <b>Safari</b>, tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</p>
    : <p className="muted small">In your browser's menu (⋮), choose <b>Install app</b> or <b>Add to Home screen</b>.</p>;
}

/** Settings: always there until installed. */
export function InstallPanel() {
  const { available, prompt, ios } = useInstall();
  if (isInstalled()) return <section className="panel"><h2 className="h-sec">The app</h2><p className="muted">Card Club is installed on this device. Updates arrive by themselves the next time you open it online.</p></section>;
  if (!available) return null;
  return (
    <section className="panel">
      <h2 className="h-sec">Install the app</h2>
      <p className="muted">Put Card Club on your home screen or desktop. It opens full screen, works offline, and updates itself.</p>
      {prompt ? <div className="btn-row"><Button size="lg" onClick={() => void installNow()}>Install Card Club</Button></div> : <HowTo ios={ios} />}
    </section>
  );
}

/** Home: a small card you can dismiss. */
export function InstallHint() {
  const { available, prompt, ios } = useInstall();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  if (!available || hidden || (!prompt && !ios)) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* storage blocked */ } };
  return (
    <section className="install-hint" role="note">
      <img src="icons/icon-192.png" alt="" width="44" height="44" />
      <span><b>Get the app</b>{prompt ? <small>Card Club on your home screen, full screen and offline.</small> : <small>In Safari: Share, then Add to Home Screen.</small>}</span>
      {prompt && <Button size="sm" onClick={() => void installNow()}>Install</Button>}
      <button className="icon-btn" aria-label="Not now" onClick={hide}>×</button>
    </section>
  );
}
