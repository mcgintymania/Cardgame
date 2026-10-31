// Round head-and-shoulders portrait, cropped from the full-body Character.
// Everything that shows a player (seats, lists, profiles) uses this, so a change
// in the wardrobe shows up everywhere.

import React from 'react';
import { Character, type Look, type Extras } from './Character.tsx';

export type AvatarConfig = Look;
export { SKIN_TONES, HAIR_COLORS, BACKDROPS, HAIR_STYLES, DEFAULT_LOOK as DEFAULT_AVATAR } from './Character.tsx';

export function Avatar({ config, size = 48, title, extras }: { config: AvatarConfig; size?: number; title?: string; extras?: Extras }) {
  return (
    <span className="avatar" role="img" aria-label={title ?? 'Player'} style={{ width: size, height: size, background: config.backdrop }}>
      <Character look={config} crop="bust" width="100%" height="100%" extras={extras} title={title} />
    </span>
  );
}
