/**
 * Normalizes Ugandan phone numbers into E.164 format (+256XXXXXXXXX).
 * Accepts: "0772123456", "+256772123456", "256772123456", "0772 123 456", "(0772) 123-456"
 * Returns: "+256772123456" or null if invalid.
 */
export function normalizeUgandanPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith('+');

  // Strip all non-digit characters except leading +
  const digitsOnly = trimmed.replace(/\D/g, '');

  let candidate: string;

  if (hasLeadingPlus) {
    candidate = `+${digitsOnly}`;
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    candidate = `+256${digitsOnly.slice(1)}`;
  } else if (digitsOnly.startsWith('256') && digitsOnly.length === 12) {
    candidate = `+${digitsOnly}`;
  } else if (digitsOnly.length === 9) {
    candidate = `+256${digitsOnly}`;
  } else {
    // EXTENSION POINT: Non-Ugandan / regional international phone numbers can be parsed here in future prompts.
    return null;
  }

  // Validate exact Ugandan E.164 structure: +256 followed by exactly 9 digits
  if (/^\+256\d{9}$/.test(candidate)) {
    return candidate;
  }

  // EXTENSION POINT: Non-Ugandan / regional fallback return location.
  return null;
}

/**
 * Formats E.164 phone number for readable UI display.
 * Example: "+256772123456" -> "+256 772 123 456"
 */
export function formatPhoneDisplay(e164: string): string {
  const match = /^\+256(\d{3})(\d{3})(\d{3})$/.exec(e164);
  if (match && match[1] && match[2] && match[3]) {
    return `+256 ${match[1]} ${match[2]} ${match[3]}`;
  }
  return e164;
}
