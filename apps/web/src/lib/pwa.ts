// The installable app: offline support (service worker) and the "Install" button.
// Only switched on in the website build (GitHub Pages), not in previews.

declare const __SITE__: boolean;
declare const __VERSION__: string;
export const APP_VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
const SITE = typeof __SITE__ === 'boolean' && __SITE__;

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: InstallEvent | null = null;
const fns = new Set<() => void>();
const ping = () => { for (const f of fns) f(); };
export function onInstallChange(fn: () => void) { fns.add(fn); return () => { fns.delete(fn); }; }

export function startPwa() {
  if (!SITE || typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; ping(); });
  window.addEventListener('appinstalled', () => { deferred = null; ping(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ }); });
  }
}

/** Already running as the installed app. */
export const isInstalled = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
/** iPhone/iPad: installed from Safari's Share menu (no install button there). */
export const isIOS = () => typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const canInstallNow = () => !!deferred;
export const pwaAvailable = () => SITE;

export async function installNow(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; ping();
  return outcome === 'accepted';
}
