import { getItem } from './catalogue.ts';
import type { Wallet } from './progress.ts';

/** CSS variables and class for the player's equipped felt, rail and card backs. */
export function tableTheme(w: Wallet): { style: Record<string, string>; className: string } {
  const felt = getItem(w.table.felt) ?? getItem('felt-green')!;
  const wood = getItem(w.table.wood) ?? getItem('wood-walnut')!;
  return {
    style: {
      '--felt': felt.c1, '--felt-hi': felt.c2 ?? felt.c1, '--felt-lo': felt.c3 ?? felt.c1,
      '--wood': wood.c1, '--wood-mid': wood.c2 ?? wood.c1, '--wood-lo': wood.c3 ?? wood.c1,
    },
    className: `cb-${w.table.cardback}`,
  };
}
