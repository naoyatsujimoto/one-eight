// src/i18n/types.ts
// Translations type derived from EN_TRANSLATIONS (English canonical source).

// DeepWiden: converts literal types in EN dictionary to widened types
type DeepWiden<T> =
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  T extends (...args: infer A) => infer R ? (...args: A) => R :
  T extends readonly (infer U)[] ? readonly DeepWiden<U>[] :
  T extends object ? { [K in keyof T]: DeepWiden<T[K]> } :
  T;

// EN dictionary import — used to derive Translations type
import type { EN_TRANSLATIONS } from './en';

// Translations type is derived from EN_TRANSLATIONS via DeepWiden
export type Translations = DeepWiden<typeof EN_TRANSLATIONS>;
