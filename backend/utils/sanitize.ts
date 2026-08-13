import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

/**
 * Strips all HTML/script markup from free-text user input before it's ever persisted — every
 * field this touches (reasons, notes, names, chat questions, decision notes, site name...) is
 * plain text and never meant to carry markup, so stripping tags outright is safer than escaping
 * them for later re-display: it guarantees the stored value can never be reinterpreted as HTML
 * no matter what renders it later (React JSX, a CSV/PDF export, an email template, a future
 * rich-text view) — escaping-at-render only protects the one place someone remembered to escape.
 */
export function sanitizeText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}

/**
 * Zod helper for a required free-text field: enforces max length on the raw input (cheap DoS
 * guard before we even process it), strips HTML, then enforces min length on the *sanitized*
 * result — so "<script>x</script>" padded to look long enough raw still correctly fails a
 * min-length check once the markup is gone.
 */
export function sanitizedString(opts: { min: number; max: number; minMessage?: string; maxMessage?: string }) {
  return z
    .string()
    .max(opts.max, opts.maxMessage ?? `Texte trop long (max ${opts.max} caractères)`)
    .transform(sanitizeText)
    .pipe(z.string().min(opts.min, opts.minMessage ?? `Texte trop court (min ${opts.min} caractères)`));
}

/** Same as sanitizedString but for optional fields with no minimum length. */
export function sanitizedOptionalString(max: number, maxMessage?: string) {
  return z
    .string()
    .max(max, maxMessage ?? `Texte trop long (max ${max} caractères)`)
    .transform(sanitizeText)
    .optional();
}
