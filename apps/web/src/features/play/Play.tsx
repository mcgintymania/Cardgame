import React from 'react';
import type { Nav } from '../../app/App.tsx';
import { ModeTiles } from '../home/Home.tsx';
import { Tag } from '../../design/ui.tsx';

export function Play({ nav }: { nav: Nav }) {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Choose a table</p>
        <h1 className="display h-lg">Play</h1>
      </header>
      <ModeTiles nav={nav} />
      <section className="block">
        <h2 className="h-sec">With friends</h2>
        <div className="locked-list">
          {[
            ['Join a public table', 'Find an open seat with players online.'],
            ['Create a private room', 'Get an invite code to share with friends.'],
            ['Join with a code', 'Got a code from a friend? Enter it here.'],
          ].map(([t, d]) => (
            <div key={t} className="locked-row">
              <span>
                <b>{t}</b>
                <small>{d}</small>
              </span>
              <Tag>Online version</Tag>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
