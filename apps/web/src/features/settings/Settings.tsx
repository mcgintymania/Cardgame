import React, { useState } from 'react';
import { exportBackup, importBackup, store, useStore } from '../../lib/store.ts';
import { sfx } from '../../lib/audio.ts';
import { Button, Segmented, Toggle } from '../../design/ui.tsx';
import { ALL_SHOWN } from '../../lib/games.ts';
import { SEASONS } from '../../lib/seasons.ts';
import { SaveStatus } from '../online/SaveStatus.tsx';
import { InstallPanel } from './Install.tsx';
import { APP_VERSION } from '../../lib/pwa.ts';
import { forgetWelcomeChoice } from '../online/Welcome.tsx';
import { syncBeforeSignOut } from '../../lib/online/cloudSave.ts';
import { signOut } from '../../lib/online/client.ts';
import { useSession } from '../../lib/online/useOnline.ts';

export function Settings() {
  const { settings } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const signedIn = !!useSession();
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const download = () => {
    let framed = false;
    try { framed = window.top !== window.self; } catch { framed = true; }
    if (framed) { setBackupMsg('Backups can’t be saved inside this preview. Open Card Club in its own tab, or the installed app, to save one.'); return; }
    try {
      const blob = new Blob([exportBackup()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `card-club-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setBackupMsg('Backup saved to your downloads.');
    } catch { setBackupMsg("This browser wouldn't save the file."); }
  };
  const restore = (e: { target: HTMLInputElement }) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      const r = importBackup(t);
      if ('error' in r) { setBackupMsg(r.error); return; }
      setBackupMsg('Restored. Reloading…');
      setTimeout(() => location.reload(), 600);
    });
  };
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display h-lg">Settings</h1>
      </header>

      <section className="panel">
        <h2 className="h-sec">Sound</h2>
        <Toggle id="set-sound" label="Sound effects" hint="Card flicks, penalties and knockouts." checked={settings.sound} onChange={(v) => { store.setSettings({ sound: v }); if (v) sfx.card(); }} />
        <label className="row-setting" htmlFor="set-volume">
          <span className="row-text"><span className="row-label">Volume</span></span>
          <input id="set-volume" type="range" min="0" max="1" step="0.05" value={settings.volume} disabled={!settings.sound}
            onChange={(e: { target: HTMLInputElement }) => store.setSettings({ volume: Number(e.target.value) })}
            onPointerUp={() => sfx.card()} />
        </label>
      </section>

      <section className="panel">
        <h2 className="h-sec">Look and seasons</h2>
        <Segmented id="set-charstyle" label="Character style" hint={(settings.charStyle ?? 'lounge') === 'lounge' ? 'Grown-up proportions, detailed faces and shading.' : 'The original cartoon look.'}
          value={settings.charStyle ?? 'lounge'} options={[{ value: 'lounge', label: 'Lounge' }, { value: 'classic', label: 'Classic' }]}
          onChange={(charStyle) => store.setSettings({ charStyle })} />
        <Toggle id="set-seasonal" label="Seasonal events" hint="Christmas, Valentine's, Easter, summer, Halloween and more: decorations, a seasonal shop and a free gift each time."
          checked={settings.seasonal !== false} onChange={(seasonal) => store.setSettings({ seasonal })} />
        <label className="row-setting" htmlFor="set-season-preview">
          <span className="row-text"><span className="row-label">Preview a season</span><span className="row-hint">See any season now. Gifts can only be opened when it's really on.</span></span>
          <select id="set-season-preview" className="select" value={settings.seasonPreview ?? ''} disabled={settings.seasonal === false}
            onChange={(e: { target: HTMLSelectElement }) => store.setSettings({ seasonPreview: e.target.value || null })}>
            <option value="">Follow the calendar</option>
            {SEASONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      </section>

      <section className="panel">
        <h2 className="h-sec">Games shown</h2>
        <p className="row-hint">Switch off games you don't play. They disappear from menus, game rooms, champions, rankings, club news, trophies and stats. Nothing is deleted: switch one back on and its history returns.</p>
        {ALL_SHOWN.map((g) => {
          const hidden = settings.hiddenGames ?? [];
          const on = !hidden.includes(g.id);
          const last = on && ALL_SHOWN.filter((x) => !hidden.includes(x.id)).length === 1;
          return (
            <Toggle key={g.id} id={`show-${g.id}`} label={g.name} hint={last ? 'At least one game has to stay on.' : g.blurb} checked={on}
              onChange={(v) => { if (!v && last) return; store.setSettings({ hiddenGames: v ? hidden.filter((x) => x !== g.id) : [...hidden, g.id] }); }} />
          );
        })}
      </section>

      <section className="panel">
        <h2 className="h-sec">Table</h2>
        <Segmented id="set-speed" label="Opponent speed" hint="How long club members take to think." value={settings.aiSpeed}
          options={[{ value: 'relaxed', label: 'Relaxed' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }]}
          onChange={(aiSpeed) => store.setSettings({ aiSpeed })} />
        <Segmented id="set-size" label="Card size" hint="Larger cards are easier to read on small screens." value={settings.cardSize}
          options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]}
          onChange={(cardSize) => store.setSettings({ cardSize })} />
        <Segmented id="set-pause" label="After each poker or blackjack hand" hint={settings.handPause === 'tap' ? 'The result stays up until you tap Next hand.' : 'The result stays up for a few seconds, then the next hand is dealt.'}
          value={settings.handPause ?? 'auto'} options={[{ value: 'auto', label: 'Carry on' }, { value: 'tap', label: 'Wait for me' }]}
          onChange={(handPause) => store.setSettings({ handPause })} />
        <p className="row-hint">Card backs, felt and table rail are in your wardrobe.</p>
        <Segmented id="set-motion" label="Motion" hint="'Device' follows your phone's reduce-motion setting." value={settings.motion}
          options={[{ value: 'system', label: 'Device' }, { value: 'reduced', label: 'Reduced' }, { value: 'full', label: 'Full' }]}
          onChange={(motion) => store.setSettings({ motion })} />
      </section>

      <InstallPanel />

      <section className="panel">
        <h2 className="h-sec">Your progress</h2>
        <p className="muted">{signedIn
          ? 'Your name, look, coins, items, stats, club record and house rules are saved to your account and on this device. Sign in on any phone or computer to carry on.'
          : 'Your name, look, coins, items, stats, club record and house rules are kept on this device. Sign in (Online) to save them to an account and play on other devices too.'}</p>
        <SaveStatus />
        <div className="btn-row">
          <Button variant="ghost" onClick={download}>Back up my progress</Button>
          <label className="btn btn-ghost btn-md file-btn">Restore from a backup<input type="file" accept=".json,application/json" onChange={restore} /></label>
        </div>
        <p className="row-hint">The backup is one small file with your player, coins, wardrobe, club and stats. Restoring it replaces what's on this device{signedIn ? ' and in your account' : ''}.</p>
        {backupMsg && <p className="item-msg" role="status">{backupMsg}</p>}
        {confirmReset ? (
          <div className="btn-row">
            <Button variant="danger" onClick={async () => {
              if (signedIn) { await syncBeforeSignOut(); forgetWelcomeChoice(); signOut(); }
              store.resetAll(); setConfirmReset(false);
            }}>{signedIn ? 'Yes, sign out and erase' : 'Yes, erase everything'}</Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Keep it</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>{signedIn ? 'Sign out and erase this device…' : 'Erase everything on this device…'}</Button>
        )}
        <p className="fine">Card Club version {APP_VERSION}</p>
      </section>
    </div>
  );
}
