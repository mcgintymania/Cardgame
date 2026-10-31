import React from 'react';
import {
  BACKDROPS, BROWS, BUILDS, EYES, FACIAL_HAIR, HAIR_COLORS, HAIR_LABEL, HAIR_STYLES, MOUTHS, SKIN_TONES, type Look,
} from '../../design/Character.tsx';

const LABELS: Record<string, string> = {
  slim: 'Slim', regular: 'Regular', broad: 'Broad',
  round: 'Round', narrow: 'Narrow', wide: 'Wide', sleepy: 'Heavy-lidded',
  soft: 'Soft', arched: 'Arched', bold: 'Bold',
  smile: 'Smile', grin: 'Grin', smirk: 'Smirk', neutral: 'Straight face',
  none: 'None', stubble: 'Stubble', moustache: 'Moustache', beard: 'Beard', goatee: 'Goatee', bigbeard: 'Big beard',
};

export function Swatches({ id, label, values, value, onPick }: { id: string; label: string; values: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      <div className="swatch-row">
        {values.map((v, i) => (
          <button key={v} id={`${id}-${i}`} type="button" className={`swatch ${v === value ? 'is-on' : ''}`} style={{ background: v }}
            aria-label={`${label} option ${i + 1}`} aria-pressed={v === value} onClick={() => onPick(v)} />
        ))}
      </div>
    </fieldset>
  );
}

export function Choices<T extends string>({ id, label, values, labels, value, onPick }: { id: string; label: string; values: readonly T[]; labels: Record<string, string>; value: T; onPick: (v: T) => void }) {
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      <div className="choice-row">
        {values.map((v) => (
          <button key={v} id={`${id}-${v}`} type="button" className={`choice ${v === value ? 'is-on' : ''}`} aria-pressed={v === value} onClick={() => onPick(v)}>
            {labels[v] ?? v}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Skin, build, face and hair. Clothing lives in the wardrobe. */
export function BodyEditor({ value, onChange }: { value: Look; onChange: (l: Look) => void }) {
  const set = (patch: Partial<Look>) => onChange({ ...value, ...patch });
  return (
    <div className="avatar-editor">
      <Swatches id="skin" label="Skin tone" values={SKIN_TONES} value={value.skin} onPick={(skin) => set({ skin })} />
      <Choices id="build" label="Build" values={BUILDS} labels={LABELS} value={value.build} onPick={(build) => set({ build })} />
      <Choices id="hair" label="Hair" values={HAIR_STYLES} labels={HAIR_LABEL} value={value.hair} onPick={(hair) => set({ hair })} />
      <Swatches id="haircol" label="Hair colour" values={HAIR_COLORS} value={value.hairColor} onPick={(hairColor) => set({ hairColor })} />
      <Choices id="facial" label="Facial hair" values={FACIAL_HAIR} labels={LABELS} value={value.facialHair} onPick={(facialHair) => set({ facialHair })} />
      <Choices id="eyes" label="Eyes" values={EYES} labels={LABELS} value={value.eyes} onPick={(eyes) => set({ eyes })} />
      <Choices id="brows" label="Eyebrows" values={BROWS} labels={LABELS} value={value.brows} onPick={(brows) => set({ brows })} />
      <Choices id="mouth" label="Expression" values={MOUTHS} labels={LABELS} value={value.mouth} onPick={(mouth) => set({ mouth })} />
      <Swatches id="backdrop" label="Portrait backdrop" values={BACKDROPS} value={value.backdrop} onPick={(backdrop) => set({ backdrop })} />
    </div>
  );
}
