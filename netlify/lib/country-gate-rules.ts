// Pure rule for edge-functions/country-gate.ts. Lives outside edge-functions/
// because Netlify bundles every file there as a function.
// Pure rule, kept separate so it can be unit tested.

export function parseAllowed(list: string): Set<string> {
  return new Set(
    list
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c)),
  );
}

export function decide(countryCode: string | undefined | null, allowedList: string): 'allow' | 'block' {
  const allowed = parseAllowed(allowedList);
  if (allowed.size === 0) allowed.add('UG'); // a broken setting must not open the site
  return countryCode && allowed.has(countryCode.toUpperCase()) ? 'allow' : 'block';
}
