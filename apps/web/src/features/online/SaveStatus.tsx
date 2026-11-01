// "Saved to your account" line, for the Online and Settings pages.
import React, { useEffect, useState } from 'react';
import { cloudStatus, onCloudStatus, syncNow } from '../../lib/online/cloudSave.ts';
import { useSession } from '../../lib/online/useOnline.ts';

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export function SaveStatus() {
  const session = useSession();
  const [, tick] = useState(0);
  useEffect(() => onCloudStatus(() => tick((n: number) => n + 1)), []);
  useEffect(() => { const i = setInterval(() => tick((n: number) => n + 1), 30000); return () => clearInterval(i); }, []);
  if (!session) return <p className="fine">Not signed in: your progress is kept on this device only.</p>;
  const { status, lastSaved } = cloudStatus();
  const text = status === 'syncing' ? 'Saving to your account…'
    : status === 'offline' ? "Can't reach the club just now. Your progress is safe on this device and will be saved when you're back online."
    : lastSaved ? `Saved to your account ${ago(lastSaved)}.` : 'Saved to your account.';
  return (
    <p className="fine save-status" role="status">
      <span className={`save-dot is-${status}`} aria-hidden="true" /> {text}
      {status === 'offline' && <> <button className="link-btn" onClick={() => void syncNow()}>Try again</button></>}
    </p>
  );
}
