// Shared UI pieces for the design system.

import React, { useEffect, type ReactNode } from 'react';

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'brass' | 'ghost' | 'felt' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  id?: string;
};

export function Button({ children, onClick, variant = 'brass', size = 'md', disabled, className = '', type = 'button', ariaLabel, id }: BtnProps) {
  return (
    <button id={id} type={type} className={`btn btn-${variant} btn-${size} ${className}`} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function Sheet({ open, onClose, title, children, wide, dismissable = true }: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-scrim" onClick={() => dismissable && onClose?.()}>
      <div className={`sheet ${wide ? 'sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e: Event) => e.stopPropagation()}>
        {title && (
          <header className="sheet-head">
            <h2>{title}</h2>
            {dismissable && onClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
            )}
          </header>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ id, checked, onChange, label, hint, tag }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; tag?: ReactNode;
}) {
  return (
    <label className="row-setting" htmlFor={id}>
      <span className="row-text">
        <span className="row-label">{label} {tag}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <input id={id} type="checkbox" className="switch" checked={checked} onChange={(e: { target: HTMLInputElement }) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ id, value, options, onChange, label, hint, tag }: {
  id: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string; hint?: string; tag?: ReactNode;
}) {
  return (
    <div className="row-setting row-col" role="group" aria-labelledby={`${id}-l`}>
      <span className="row-text">
        <span className="row-label" id={`${id}-l`}>{label} {tag}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <div className="seg">
        {options.map((o) => (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            className={`seg-btn ${o.value === value ? 'is-on' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({ id, value, min, max, onChange, label, hint, tag, step = 1 }: {
  id: string; value: number; min: number; max: number; onChange: (v: number) => void; label: string; hint?: string; tag?: ReactNode; step?: number;
}) {
  return (
    <div className="row-setting">
      <span className="row-text">
        <span className="row-label">{label} {tag}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <div className="stepper">
        <button id={`${id}-dec`} type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label={`Decrease ${label}`}>−</button>
        <output aria-live="polite">{value}</output>
        <button id={`${id}-inc`} type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' | 'brass' | 'ok' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function ChipIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#8f2a2a" />
      <circle cx="12" cy="12" r="11" fill="none" stroke="#f1e8d6" strokeWidth="3" strokeDasharray="4 4.64" />
      <circle cx="12" cy="12" r="6.5" fill="#a83434" stroke="#f1e8d6" strokeWidth="0.8" />
    </svg>
  );
}

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#c9973d" />
      <circle cx="12" cy="12" r="8" fill="#e6bf62" stroke="#9c7027" strokeWidth="1" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7a541b" fontFamily="serif">C</text>
    </svg>
  );
}
