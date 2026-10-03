// Nicknames/spellings that should all be treated as the same guest for the
// forced-outcome rule below. Matches as a whole word within the entered
// name (case-insensitive), so "Razan A." and "raz" both match, but "Karazan"
// does not.
const RAZAN_ALIASES = ['razan', 'raz', 'rozeh'];

export function isRazan(name) {
  const normalized = String(name ?? '')
    .toLowerCase()
    .trim();
  if (!normalized) return false;
  return RAZAN_ALIASES.some((alias) => new RegExp(`\\b${alias}\\b`).test(normalized));
}
