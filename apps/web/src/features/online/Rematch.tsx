// After an online game: someone asks for a rematch and everyone else at the
// table sees a banner to join the same new table (no new code to send).

import React, { useEffect, useState } from 'react';
import { Button } from '../../design/ui.tsx';
import type { RemoteSession } from '../../lib/online/tables.ts';

export function RematchBanner({ session, onJoin }: { session: RemoteSession; onJoin: () => void }) {
  const [rm, setRm] = useState<{ roomId: string; by: number } | null>(session.rematch);
  useEffect(() => session.onRematch(setRm), [session]);
  if (!rm || rm.by === session.info.seat) return null;
  return (
    <div className="rematch-banner" role="status">
      <span><b>{session.nameAt(rm.by)}</b> wants a rematch</span>
      <Button size="sm" onClick={onJoin}>Join the rematch</Button>
    </div>
  );
}
