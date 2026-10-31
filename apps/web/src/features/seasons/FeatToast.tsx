// The achievement pop-up: appears wherever you are when you pull off a feat.

import React, { useEffect, useRef, useState } from 'react';
import { FEAT_EVENT, type FeatNotice } from '../../lib/feats.ts';
import { sfx } from '../../lib/audio.ts';

export function FeatToasts() {
  const [list, setList] = useState<Array<FeatNotice & { id: number }>>([]);
  const n = useRef(1);
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<FeatNotice>).detail;
      const id = n.current++;
      setList((l: Array<FeatNotice & { id: number }>) => [...l, { ...d, id }]);
      try { sfx.win(); } catch { /* sound is optional */ }
      setTimeout(() => setList((l: Array<FeatNotice & { id: number }>) => l.filter((x) => x.id !== id)), 4800);
    };
    window.addEventListener(FEAT_EVENT, on);
    return () => window.removeEventListener(FEAT_EVENT, on);
  }, []);
  if (!list.length) return null;
  return (
    <div className="feat-toasts" role="status" aria-live="polite">
      {list.map((f) => (
        <div key={f.id} className="feat-toast">
          <span className="ft-medal" aria-hidden="true">★</span>
          <span className="ft-text">
            <small>Achievement</small>
            <b>{f.name}</b>
            <em>{f.items.length ? `Unlocked: ${f.items.join(', ')}` : f.how}</em>
          </span>
        </div>
      ))}
    </div>
  );
}
