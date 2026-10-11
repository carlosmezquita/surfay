/**
 * Deep-water wave energy flux (power per metre of crest).
 * P = (rho * g^2 / 64*pi) * Hs^2 * Te  ≈  0.49 * Hs^2 * Te  [kW/m]
 * Standard surf-forecast approximation used so riders can compare the
 * real push behind different swell/period combinations at a glance.
 */
export function wavePowerKwPerM(heightM: number | null, periodS: number | null) {
  if (heightM === null || periodS === null || heightM <= 0 || periodS <= 0) return null
  return 0.49 * heightM * heightM * periodS
}

export type WavePowerBand = 'calm' | 'fun' | 'solid' | 'heavy'

/** Surfer-friendly bands for the energy figure. */
export function wavePowerBand(powerKwPerM: number | null): WavePowerBand | null {
  if (powerKwPerM === null) return null
  if (powerKwPerM < 3) return 'calm'
  if (powerKwPerM < 10) return 'fun'
  if (powerKwPerM < 25) return 'solid'
  return 'heavy'
}

/** Display formatting: keep one decimal for small swells, round afterwards. */
export function formatWavePower(powerKwPerM: number | null) {
  if (powerKwPerM === null) return '—'
  return powerKwPerM < 10 ? powerKwPerM.toFixed(1) : String(Math.round(powerKwPerM))
}
