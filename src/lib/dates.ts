import type { FireDate } from '@/types';

/** Convert a Firestore Timestamp / Date / ISO string / epoch millis into a Date, or null if unusable. */
export function toDate(value: FireDate | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000 + (value.nanoseconds ?? 0) / 1e6);
  return null;
}

/** Epoch milliseconds for a FireDate; 0 when unusable (handy for sorting). */
export function toMillis(value: FireDate | undefined): number {
  return toDate(value)?.getTime() ?? 0;
}
