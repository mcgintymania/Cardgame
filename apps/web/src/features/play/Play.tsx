import React from 'react';
import type { Nav } from '../../app/App.tsx';
import { ModeTiles } from '../home/Home.tsx';

export function Play({ nav }: { nav: Nav }) {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Choose a table</p>
        <h1 className="display h-lg">Play</h1>
      </header>
      <ModeTiles nav={nav} />
      <section className="block">
        <h2 className="h-sec">With friends and family</h2>
        <div className="more-list">
          <button className="more-row" onClick={() => nav.go('online')}>
            <span><b>Make a table</b><small>Get a code to send. Club members fill any empty seats.</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button className="more-row" onClick={() => nav.go('online')}>
            <span><b>Join with a code</b><small>Got a code from someone? Type it in to sit down.</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </div>
  );
}
