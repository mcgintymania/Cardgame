// Minimal React typings for this offline preview build only (no npm access here).
// In the real repo, install @types/react and @types/react-dom and delete this file.

declare module 'react' {
  export type ReactNode = any;
  export type CSSProperties = Record<string, string | number | undefined>;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T> { readonly current: T | null }
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T>;
  export function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, Dispatch<A>];
  export interface Context<T> { Provider: any; Consumer: any; _t?: T }
  export function createContext<T>(value: T): Context<T>;
  export function useContext<T>(ctx: Context<T>): T;
  export function useId(): string;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  export const Fragment: any;
  const React: {
    createElement: typeof createElement;
    createContext: typeof createContext;
    Fragment: any;
  };
  namespace React {
    type ReactNode = any;
    type CSSProperties = Record<string, string | number | undefined>;
  }
  export default React;
}

declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: any): void };
}

declare namespace JSX {
  interface IntrinsicElements { [name: string]: any }
  type Element = any;
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number | null }
}
