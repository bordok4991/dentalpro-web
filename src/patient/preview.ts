import { useSyncExternalStore } from 'react';

/**
 * "Pogledaj kao pacijent": doktor ili vlasnik otvara aplikaciju pacijenta
 * za jedan karton, samo za gledanje. Pamti se po kartici preglednika.
 */
const KEY = 'dp-kao-pacijent';
const subs = new Set<() => void>();
let current: string | null = null;
try {
  current = sessionStorage.getItem(KEY);
} catch {
  current = null;
}

export const patientPreview = {
  get: () => current,
  set(id: string | null) {
    current = id;
    try {
      if (id) sessionStorage.setItem(KEY, id);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* bez sessionStorage pregled traje dok je stranica otvorena */
    }
    subs.forEach((f) => f());
  },
};

export function usePreviewId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
    () => null,
  );
}
