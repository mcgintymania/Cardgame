// The season the app should show right now: the calendar's, unless seasons are
// switched off in Settings or a season is being previewed.

import { store, useStore, type Settings } from './store.ts';
import { activeSeason, seasonById, type Season } from './seasons.ts';

export function seasonFor(settings: Settings, now = new Date()): Season | null {
  if (settings.seasonal === false) return null;
  if (settings.seasonPreview) return seasonById(settings.seasonPreview) ?? null;
  return activeSeason(now);
}

export function useSeason(): Season | null {
  const { settings } = useStore();
  return seasonFor(settings);
}

/** For code outside React (e.g. picking table props). */
export const currentSeason = () => seasonFor(store.get().settings);
