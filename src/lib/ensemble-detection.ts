/**
 * Detects ensemble type from a set of instrument positions.
 * Returns a suggested label if positions match a known pattern, or null for custom configurations.
 */

type PositionInput = {
  instrument_name: string
  chair_number: number
}

// Canonical ensemble patterns — instrument names must match what's in the instruments table
const ENSEMBLE_PATTERNS: { label: string; fingerprint: string }[] = [
  { label: 'Solo', fingerprint: '1' },
  { label: 'Duo', fingerprint: '2' },
  { label: 'String Trio', fingerprint: 'Cello:1,Violin 1:2' },
  { label: 'String Trio', fingerprint: 'Cello:1,Viola:1,Violin 1:1' },
  { label: 'String Trio', fingerprint: 'Cello:1,Viola:1,Violin 2:1' },
  { label: 'Piano Trio', fingerprint: 'Cello:1,Piano:1,Violin 1:1' },
  { label: 'String Quartet', fingerprint: 'Cello:1,Viola:1,Violin 1:1,Violin 2:1' },
  { label: 'Piano Quartet', fingerprint: 'Cello:1,Piano:1,Viola:1,Violin 1:1' },
  { label: 'String Quintet', fingerprint: 'Cello:1,Double Bass:1,Viola:1,Violin 1:1,Violin 2:1' },
  { label: 'Piano Quintet', fingerprint: 'Cello:1,Piano:1,Viola:1,Violin 1:1,Violin 2:1' },
]

/**
 * Create a canonical fingerprint from positions: sorted "InstrumentName:count" pairs.
 * For small ensembles (<=2 positions) without a specific match, we use the total count.
 */
function fingerprint(positions: PositionInput[]): string {
  const counts = new Map<string, number>()
  for (const p of positions) {
    counts.set(p.instrument_name, (counts.get(p.instrument_name) || 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${name}:${count}`)
    .join(',')
}

/**
 * Detect the ensemble type from the current positions.
 * Returns the suggested label string, or null if no known pattern matches.
 */
export function detectEnsembleType(positions: PositionInput[]): string | null {
  if (positions.length === 0) return null

  const fp = fingerprint(positions)

  // Try exact pattern match first
  const match = ENSEMBLE_PATTERNS.find((p) => p.fingerprint === fp)
  if (match) return match.label

  // For single instrument, call it "Solo"
  if (positions.length === 1) return 'Solo'

  // For two instruments, call it "Duo"
  if (positions.length === 2) return 'Duo'

  return null
}

/**
 * Check if the current positions have drifted from the stored ensemble_type.
 * Returns { drifted: true, suggestion } if they don't match, or { drifted: false } if fine.
 */
export function checkEnsembleDrift(
  currentEnsembleType: string | null,
  positions: PositionInput[]
): { drifted: boolean; suggestion: string | null } {
  // If no ensemble_type was ever set, no drift to detect
  if (!currentEnsembleType) return { drifted: false, suggestion: null }

  // If positions are empty (all cleared), that's a drift
  if (positions.length === 0) {
    return { drifted: true, suggestion: null }
  }

  const detected = detectEnsembleType(positions)

  // If detected matches current, no drift
  if (detected && detected === currentEnsembleType) {
    return { drifted: false, suggestion: null }
  }

  // If detected is different, or we can't detect (custom), it's a drift
  // But only if the detected type is meaningfully different
  if (detected && detected !== currentEnsembleType) {
    return { drifted: true, suggestion: detected }
  }

  // Custom configuration that doesn't match any pattern — and current label is set
  // This means the user has modified beyond recognition of the original preset
  return { drifted: true, suggestion: null }
}
