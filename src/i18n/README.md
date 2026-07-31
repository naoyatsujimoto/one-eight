# i18n — ONE EIGHT UI Translations

## Canonical Source

English (`en`) is the **sole canonical source**. All structural changes (adding keys, changing types, modifying arrays) must be made in `en.ts` first.

## Supported Locales

| Code    | Name                  | Status             |
|---------|-----------------------|--------------------|
| en      | English               | ✅ Full translation |
| ja      | 日本語                | ✅ Full translation |
| zh-Hant | 繁體中文              | ✅ Full translation |
| zh-Hans | 简体中文              | ✅ Full translation |
| ko      | 한국어                | ✅ Full translation |
| es      | Español               | ✅ Full translation |
| pt-BR   | Português (Brasil)    | ✅ Full translation |
| de      | Deutsch               | 🔄 English fallback |
| fr      | Français              | 🔄 English fallback |
| it      | Italiano              | 🔄 English fallback |

zh-Hans covers Singapore, Malaysia, overseas simplified-literate users, and diaspora. Do NOT annotate zh-Hans as "Mainland China".

## Adding a New Translation Locale

1. Create `src/i18n/<code>.ts` — copy `en.ts` structure, translate all values
2. The new file must `satisfies Translations` to guarantee structural conformance
3. Register in `UI_TRANSLATIONS` in `src/i18n/index.ts`
4. Run `npx vitest run src/tests/i18n_structure.test.ts` to verify structure

## Adding a New Key

1. Add the key to `en.ts` (English value required)
2. Add the same key to `ja.ts` (Japanese value required)
3. TypeScript will error on `satisfies Translations` if `ja.ts` is missing the key
4. For future locales, add when translating — do not add empty strings or placeholder text

## Rules

- **Never** use English fallback to hide a missing key — fix the missing key instead
- Preserve all placeholders (e.g., `${n}`, `${gate}`) and line breaks (`\n`) exactly
- Preserve array order — do not reorder `tutSteps`, `rulesBody`, or any other array
- Preserve function signatures — same number and type of parameters
- GAME-specific terms are kept in English in all locales:
  - ONE EIGHT, Position, Gate, Build up, Asset, Slot
  - Massive Build, Selective Build, Quad Build, Capture
  - Black, White, Ghost, Postmortem, Official Arena

## File Structure

```
src/i18n/
├── en.ts          ← English canonical dictionary (EN_TRANSLATIONS)
├── ja.ts          ← Japanese dictionary (JA_TRANSLATIONS satisfies Translations)
├── zh-Hant.ts     ← Traditional Chinese (ZH_HANT_TRANSLATIONS satisfies Translations)
├── zh-Hans.ts     ← Simplified Chinese (ZH_HANS_TRANSLATIONS satisfies Translations)
├── ko.ts          ← Korean (KO_TRANSLATIONS satisfies Translations)
├── es.ts          ← Spanish (ES_TRANSLATIONS satisfies Translations)
├── pt-BR.ts       ← Brazilian Portuguese (PT_BR_TRANSLATIONS satisfies Translations)
├── types.ts       ← DeepWiden<typeof EN_TRANSLATIONS> = Translations
├── index.ts       ← resolveUiTranslations(locale), UI_TRANSLATIONS registry
└── README.md      ← This file
```

## Training Locale Resolution

`src/training/tasks/fullGameV1Text.ts` uses `LocalizedText { en: string; ja: string }`.
This is separate from the UI dictionary and uses its own resolution logic in `FullGameTrainingRunner.tsx`.
Training locale resolution uses `resolveTrainingTranslationKey` from `src/lib/locales.ts`.
