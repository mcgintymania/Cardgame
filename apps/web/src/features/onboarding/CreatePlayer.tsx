import React, { useState } from 'react';
import { store } from '../../lib/store.ts';
import { Character, DEFAULT_LOOK, type Look } from '../../design/Character.tsx';
import { Button, Tag } from '../../design/ui.tsx';
import { BodyEditor } from '../wardrobe/BodyEditor.tsx';
import { STARTER_LOOKS } from '../../lib/look.ts';

export function CreatePlayer({ defaultName }: { defaultName?: string } = {}) {
  const [name, setName] = useState(defaultName ?? '');
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [step, setStep] = useState<'you' | 'outfit'>('you');
  const trimmed = name.trim();
  const valid = /^[A-Za-z0-9_ .'-]{2,20}$/.test(trimmed);

  return (
    <div className="onboard">
      <div className="onboard-card">
        <p className="eyebrow">Members only</p>
        <h1 className="display onboard-title">Card Club</h1>
        <p className="lede">Pull up a chair. Make your character and pick something to wear.</p>

        <div className="onboard-grid">
          <div className="onboard-preview">
            <div className="dressing-stage small">
              <Character look={look} pose={step === 'outfit' ? 'wave' : 'idle'} animate width="100%" height="100%" title="Your character" />
            </div>
            <p className="preview-name">{trimmed || 'Your name'}</p>
          </div>

          <form
            className="onboard-form"
            onSubmit={(e: Event) => {
              e.preventDefault();
              if (!valid) return;
              if (step === 'you') { setStep('outfit'); return; }
              store.setProfile({ name: trimmed, avatar: look, createdAt: new Date().toISOString() });
            }}
          >
            {step === 'you' ? (
              <>
                <label className="field" htmlFor="player-name">
                  <span className="field-label">Name at the table</span>
                  <input id="player-name" className="input" value={name} maxLength={20} autoComplete="nickname" placeholder="e.g. Lucky Lou"
                    onInput={(e: { target: HTMLInputElement }) => setName(e.target.value)}
                    onChange={(e: { target: HTMLInputElement }) => setName(e.target.value)} />
                  <span className="field-hint">2–20 letters, numbers, spaces or _ . ' -</span>
                </label>
                <BodyEditor value={look} onChange={setLook} />
                <Button type="submit" size="lg" disabled={!valid}>Next: your outfit</Button>
              </>
            ) : (
              <>
                <fieldset className="swatches">
                  <legend>Starter outfit</legend>
                  <div className="starter-looks">
                    {STARTER_LOOKS.map((s) => {
                      const on = JSON.stringify(s.wear) === JSON.stringify(look.wear);
                      return (
                        <button key={s.name} id={`starter-${s.name.replace(/\s/g, '')}`} type="button" className={`starter ${on ? 'is-on' : ''}`} aria-pressed={on}
                          onClick={() => setLook({ ...look, wear: { ...s.wear } })}>
                          <Character look={{ ...look, wear: s.wear }} width="100%" height="100%" noShadow />
                          <span>{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <p className="local-note">You start with 300 club coins. Win games to earn more and spend them in the shop.</p>
                <div className="btn-row">
                  <Button type="submit" size="lg">Take a seat</Button>
                  <Button variant="ghost" onClick={() => setStep('you')}>Back</Button>
                </div>
              </>
            )}
            <p className="local-note">
              <Tag tone="warn">Local mode</Tag> Saved on this device only. Accounts with username and password arrive when the online version is connected.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
