/**
 * Server-side validation for the uploaded site logo.
 *
 * SCOPE - read this before trusting it.
 *
 * This is NOT antivirus. XFactory has no AV engine, and none of the realistic attacks on an image
 * upload are caught by signature scanning anyway. What this defends against is the set of things
 * that actually happen when a web application accepts an image and serves it back to every user:
 *
 *  1. A file that claims to be an image but isn't (magic bytes must match the declared type).
 *  2. SVG, which is a script execution vector - an <svg onload="..."> served same-origin is
 *     stored XSS. Rejected outright; it is not an image format for this purpose.
 *  3. Polyglots - a valid PNG header followed by HTML/JS so the same bytes render as a script
 *     when served with a sniffed content type.
 *  4. Decompression bombs - small files declaring enormous dimensions.
 *  5. Oversized payloads bloating the settings row served on every page load.
 *
 * If the deployment needs true malware scanning, the right place is an external scanner
 * (ClamAV, or the cloud provider's) called before this function. That is out of scope here and
 * this file does not pretend to do it.
 */

export interface LogoValidationResult {
  ok: boolean;
  error?: string;
  /** Normalised data URI, safe to persist. Present only when ok. */
  dataUrl?: string;
  meta?: { format: string; bytes: number; width: number; height: number };
}

/** Formats the browser can render safely as a raster mark. Deliberately excludes SVG. */
const ALLOWED = {
  'image/png': { ext: 'png' },
  'image/jpeg': { ext: 'jpg' },
  'image/webp': { ext: 'webp' },
} as const;

export const MAX_LOGO_BYTES = 512 * 1024; // 512 KB - a header mark, not a photograph.
export const MAX_LOGO_DIMENSION = 2048; // px, guards decompression bombs.

/** Magic-byte signatures. The declared MIME must agree with what the bytes actually are. */
function sniffFormat(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';

  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

/** PNG dimensions live in the IHDR chunk, always the first chunk, at a fixed offset. */
function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** JPEG dimensions require walking the segment markers to the SOF frame header. */
function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF15, excluding the non-frame markers DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    if (segmentLength <= 0) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/** WebP VP8/VP8L/VP8X each encode dimensions differently. */
function webpDimensions(buf: Buffer): { width: number; height: number } | null {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buf.length >= 30) {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ' && buf.length >= 30) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * Looks for executable-looking content inside the bytes.
 *
 * A legitimate PNG/JPEG/WebP has no reason to contain a <script> tag, an HTML document, or a PHP
 * open tag. Their presence means the file is built to be interpreted as something other than an
 * image - the polyglot case. Checked over the whole buffer because payloads are commonly parked
 * in trailing bytes or metadata chunks, both of which survive naive "check the header" validation.
 */
function containsExecutablePayload(buf: Buffer): string | null {
  const asText = buf.toString('latin1').toLowerCase();

  const signatures: [RegExp, string][] = [
    [/<script[\s>]/, 'balise <script>'],
    [/<\?php/, 'code PHP'],
    [/<!doctype\s+html/, 'document HTML'],
    [/<html[\s>]/, 'document HTML'],
    [/javascript:/, 'URI javascript:'],
    [/\bon(load|error|click)\s*=/, "gestionnaire d'événement HTML"],
    [/<iframe[\s>]/, 'iframe'],
    [/<svg[\s>]/, 'contenu SVG embarqué'],
    // Windows PE and ELF headers appended after the image data.
    [/^mz/, 'exécutable Windows'],
    [/\x7felf/, 'exécutable ELF'],
  ];

  for (const [re, label] of signatures) {
    if (re.test(asText)) return label;
  }
  return null;
}

/**
 * Validates a base64 data URI submitted as the site logo.
 *
 * Returns a normalised data URI built from the SNIFFED type rather than the declared one, so a
 * mislabelled file cannot influence the content type the browser is later told.
 */
export function validateLogoDataUrl(input: string): LogoValidationResult {
  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'Aucune image fournie.' };
  }

  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(input.trim());
  if (!match) {
    return {
      ok: false,
      error: 'Format non reconnu. Fournissez une image PNG, JPEG ou WebP encodée en base64.',
    };
  }

  const declaredType = match[1].toLowerCase();
  if (declaredType === 'image/svg+xml' || declaredType.includes('svg')) {
    return {
      ok: false,
      error:
        "Le format SVG n'est pas accepté : il peut contenir du code exécutable. Utilisez PNG, JPEG ou WebP.",
    };
  }
  if (!(declaredType in ALLOWED)) {
    return { ok: false, error: `Type d'image non autorisé (${declaredType}). Formats acceptés : PNG, JPEG, WebP.` };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(match[2], 'base64');
  } catch {
    return { ok: false, error: 'Encodage base64 invalide.' };
  }

  if (buf.length === 0) return { ok: false, error: 'Fichier vide.' };
  if (buf.length > MAX_LOGO_BYTES) {
    return {
      ok: false,
      error: `Image trop volumineuse (${Math.round(buf.length / 1024)} Ko). Maximum ${Math.round(
        MAX_LOGO_BYTES / 1024
      )} Ko.`,
    };
  }

  // The bytes decide, not the label.
  const sniffed = sniffFormat(buf);
  if (!sniffed) {
    return {
      ok: false,
      error: "Le contenu du fichier ne correspond à aucune image PNG, JPEG ou WebP valide.",
    };
  }
  if (sniffed !== declaredType) {
    return {
      ok: false,
      error: `Incohérence détectée : le fichier est déclaré ${declaredType} mais son contenu est ${sniffed}. Upload refusé.`,
    };
  }

  const payload = containsExecutablePayload(buf);
  if (payload) {
    return {
      ok: false,
      error: `Contenu suspect détecté dans l'image (${payload}). Upload refusé par sécurité.`,
    };
  }

  const dims =
    sniffed === 'image/png'
      ? pngDimensions(buf)
      : sniffed === 'image/jpeg'
      ? jpegDimensions(buf)
      : webpDimensions(buf);

  if (!dims || dims.width <= 0 || dims.height <= 0) {
    return { ok: false, error: "Les dimensions de l'image n'ont pas pu être lues - fichier probablement corrompu." };
  }
  if (dims.width > MAX_LOGO_DIMENSION || dims.height > MAX_LOGO_DIMENSION) {
    return {
      ok: false,
      error: `Dimensions trop grandes (${dims.width}×${dims.height}). Maximum ${MAX_LOGO_DIMENSION}×${MAX_LOGO_DIMENSION} px.`,
    };
  }

  return {
    ok: true,
    dataUrl: `data:${sniffed};base64,${buf.toString('base64')}`,
    meta: { format: sniffed, bytes: buf.length, width: dims.width, height: dims.height },
  };
}
