import type { SpotProfile } from '../domain/forecast'

const reviewedSources = {
  shoreFacingDeg: 'manual' as const,
  idealSwellDeg: 'manual' as const,
  swellWindowDeg: 'manual' as const,
  preferredHeightM: 'manual' as const,
  preferredPeriodS: 'manual' as const,
  tidePreference: 'manual' as const,
  closeoutSensitivity: 'default' as const,
}

const reviewedDefaults = {
  preferredPeriodS: [8, 14] as [number, number],
  maximumUsefulPeriodS: 18,
  heightRangeConfidence: 0.7,
  periodConfidence: 0.6,
  tideConfidence: 0.7,
  bathymetryConfidence: 0.65,
  calibrationStatus: 'locally-reviewed' as const,
  windSensitivity: 1,
  strongOffshoreLimitKmh: 32,
  closeoutSensitivity: 1,
  unresolvedDiffractionFloor: 0.05,
  profileSources: reviewedSources,
}

const geographyReviewed = {
  ...reviewedDefaults,
  calibrationStatus: 'geography-reviewed' as const,
  heightRangeConfidence: 0.5,
  periodConfidence: 0.4,
  tideConfidence: 0.5,
  bathymetryConfidence: 0.4,
}

export const surfSpots: SpotProfile[] = [
  {
    id: 'spot_orzan', slug: 'orzan', name: 'Orzán', province: 'A Coruña', municipality: 'A Coruña',
    latitude: 43.3729, longitude: -8.4056, shoreFacingDeg: 297, idealSwellDeg: 303, swellWindowDeg: 76,
    preferredHeightM: [0.7, 1.8], maxSafeHeightM: 2.8, tidePreference: { min: 0.32, ideal: 0.58, max: 0.84 },
    breakType: 'beach', skillLevel: 'all', orientationConfidence: 0.76,
    ...reviewedDefaults,
  },
  {
    id: 'spot_matadero', slug: 'matadero', name: 'Matadero', province: 'A Coruña', municipality: 'A Coruña',
    latitude: 43.3755, longitude: -8.4038, shoreFacingDeg: 261, idealSwellDeg: 265, swellWindowDeg: 64,
    preferredHeightM: [0.6, 1.5], maxSafeHeightM: 2.4, tidePreference: { min: 0.38, ideal: 0.62, max: 0.88 },
    breakType: 'mixed', skillLevel: 'intermediate', orientationConfidence: 0.78,
    ...geographyReviewed, preferredPeriodS: [7, 12] as [number, number], maximumUsefulPeriodS: 16,
    cameraUrl: 'https://www.camaramar.com/camera/97/iframe',
  },
  {
    id: 'spot_bastiagueiro', slug: 'bastiagueiro', name: 'Bastiagueiro', province: 'A Coruña', municipality: 'Oleiros',
    latitude: 43.3429, longitude: -8.3567, shoreFacingDeg: 348, idealSwellDeg: 357, swellWindowDeg: 58,
    preferredHeightM: [0.45, 1.2], maxSafeHeightM: 1.9, tidePreference: { min: 0.36, ideal: 0.64, max: 0.92 },
    breakType: 'beach', skillLevel: 'all', orientationConfidence: 0.8,
    ...reviewedDefaults, preferredPeriodS: [6, 11] as [number, number], maximumUsefulPeriodS: 14,
    cameraUrl: 'https://www.camaramar.com/camera/34/iframe',
  },
  {
    id: 'spot_santa_cristina', slug: 'santa-cristina', name: 'Santa Cristina', province: 'A Coruña', municipality: 'Oleiros',
    latitude: 43.341023, longitude: -8.3816, shoreFacingDeg: 28, idealSwellDeg: 28, swellWindowDeg: 20,
    preferredHeightM: [0.7, 1.8], maxSafeHeightM: 3, tidePreference: { min: 0, ideal: 0, max: 0.2 },
    breakType: 'beach', skillLevel: 'all', orientationConfidence: 0.65,
    ...reviewedDefaults,
    shorelineExposure: {
      intervalDeg: 10, shoreFacingDeg: 28,
      transmission: [
        0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08,
        0.08, 0.28, 0.49, 0.49, 0.49, 0.39, 0.18, 0.08, 0.08,
        0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08,
        0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08,
      ],
      datasetVersion: 'ihm-lc-composite-v2', inputFingerprint: '43.341023:-8.381600:28.00',
    },
  },
  {
    id: 'spot_sabon', slug: 'sabon', name: 'Sabón', province: 'A Coruña', municipality: 'Arteixo',
    latitude: 43.332749, longitude: -8.508966, shoreFacingDeg: 265, idealSwellDeg: 279, swellWindowDeg: 76,
    preferredHeightM: [0.7, 1.8], maxSafeHeightM: 2.8, tidePreference: { min: 0.28, ideal: 0.54, max: 0.82 },
    breakType: 'beach', skillLevel: 'intermediate', orientationConfidence: 0.72,
    ...reviewedDefaults,
  },
  {
    id: 'spot_doninos', slug: 'doninos', name: 'Doniños', province: 'A Coruña', municipality: 'Ferrol',
    latitude: 43.5011, longitude: -8.3209, shoreFacingDeg: 265, idealSwellDeg: 276, swellWindowDeg: 92,
    preferredHeightM: [0.8, 2.2], maxSafeHeightM: 3.8, tidePreference: { min: 0.2, ideal: 0.46, max: 0.76 },
    breakType: 'beach', skillLevel: 'intermediate', orientationConfidence: 0.8,
    ...reviewedDefaults, preferredPeriodS: [9, 16] as [number, number], maximumUsefulPeriodS: 20,
    cameraUrl: 'https://www.camaramar.com/camera/31/iframe',
  },
  {
    id: 'spot_esmelle', slug: 'esmelle', name: 'Esmelle', province: 'A Coruña', municipality: 'Ferrol',
    latitude: 43.53835, longitude: -8.29802, shoreFacingDeg: 332, idealSwellDeg: 305, swellWindowDeg: 86,
    preferredHeightM: [0.8, 2.1], maxSafeHeightM: 3.5, tidePreference: { min: 0.2, ideal: 0.45, max: 0.74 },
    breakType: 'beach', skillLevel: 'intermediate', orientationConfidence: 0.62,
    ...geographyReviewed,
  },
  {
    id: 'spot_campelo', slug: 'campelo', name: 'Campelo', province: 'A Coruña', municipality: 'Valdoviño',
    latitude: 43.58265, longitude: -8.21883, shoreFacingDeg: 7, idealSwellDeg: 326, swellWindowDeg: 70,
    preferredHeightM: [0.7, 1.8], maxSafeHeightM: 3, tidePreference: { min: 0.24, ideal: 0.5, max: 0.8 },
    breakType: 'beach', skillLevel: 'intermediate', orientationConfidence: 0.64,
    ...geographyReviewed,
  },
  {
    id: 'spot_pantin', slug: 'pantin', name: 'Pantín', province: 'A Coruña', municipality: 'Valdoviño',
    latitude: 43.64072, longitude: -8.11418, shoreFacingDeg: 349, idealSwellDeg: 340, swellWindowDeg: 96,
    preferredHeightM: [0.7, 2.1], maxSafeHeightM: 3.6, tidePreference: { min: 0.24, ideal: 0.52, max: 0.82 },
    breakType: 'beach', skillLevel: 'all', orientationConfidence: 0.82,
    ...reviewedDefaults, preferredPeriodS: [9, 16] as [number, number], maximumUsefulPeriodS: 20,
    cameraUrl: 'https://www.camaramar.com/camera/41/iframe',
  },
  {
    id: 'spot_barranan', slug: 'barranan', name: 'Barrañán', province: 'A Coruña', municipality: 'Arteixo',
    latitude: 43.3121, longitude: -8.547, shoreFacingDeg: 347, idealSwellDeg: 350, swellWindowDeg: 92,
    preferredHeightM: [0.7, 2], maxSafeHeightM: 3.2, tidePreference: { min: 0.22, ideal: 0.48, max: 0.78 },
    breakType: 'beach', skillLevel: 'intermediate', orientationConfidence: 0.79,
    ...reviewedDefaults,
    cameraUrl: 'https://www.camaramar.com/spots/barranan',
  },
  {
    id: 'spot_malpica', slug: 'malpica', name: 'Malpica', province: 'A Coruña', municipality: 'Malpica de Bergantiños',
    latitude: 43.3237, longitude: -8.8144, shoreFacingDeg: 5, idealSwellDeg: 10, swellWindowDeg: 68,
    preferredHeightM: [0.6, 1.6], maxSafeHeightM: 2.6, tidePreference: { min: 0.34, ideal: 0.6, max: 0.88 },
    breakType: 'mixed', skillLevel: 'intermediate', orientationConfidence: 0.78,
    ...reviewedDefaults,
    cameraUrl: 'https://www.camaramar.com/camera/19/iframe',
  },
  {
    id: 'spot_caion', slug: 'caion', name: 'Caión', province: 'A Coruña', municipality: 'A Laracha',
    latitude: 43.3156, longitude: -8.61091, shoreFacingDeg: 323, idealSwellDeg: 323, swellWindowDeg: 62,
    preferredHeightM: [0.55, 1.5], maxSafeHeightM: 2.4, tidePreference: { min: 0.34, ideal: 0.6, max: 0.88 },
    breakType: 'mixed', skillLevel: 'intermediate', orientationConfidence: 0.62,
    ...geographyReviewed, preferredPeriodS: [7, 12] as [number, number], maximumUsefulPeriodS: 16,
    cameraUrl: 'https://www.camaramar.com/camera/18/iframe',
  },
  {
    id: 'spot_razo', slug: 'razo', name: 'Razo', province: 'A Coruña', municipality: 'Carballo',
    latitude: 43.291, longitude: -8.7037, shoreFacingDeg: 328, idealSwellDeg: 350, swellWindowDeg: 104,
    preferredHeightM: [0.7, 2.2], maxSafeHeightM: 3.7, tidePreference: { min: 0.2, ideal: 0.46, max: 0.76 },
    breakType: 'beach', skillLevel: 'all', orientationConfidence: 0.75,
    ...reviewedDefaults, preferredPeriodS: [9, 16] as [number, number], maximumUsefulPeriodS: 20,
    cameraUrl: 'https://www.camaramar.com/camera/11/iframe',
  },
  {
    id: 'spot_baldaio', slug: 'baldaio', name: 'Baldaio', province: 'A Coruña', municipality: 'Carballo',
    latitude: 43.3007, longitude: -8.6736, shoreFacingDeg: 350, idealSwellDeg: 340, swellWindowDeg: 96,
    preferredHeightM: [0.7, 2], maxSafeHeightM: 3.3, tidePreference: { min: 0.22, ideal: 0.48, max: 0.78 },
    breakType: 'beach', skillLevel: 'intermediate', orientationConfidence: 0.68,
    ...reviewedDefaults,
    cameraUrl: 'https://www.camaramar.com/camera/75/iframe',
  },
]

export function getSpotBySlug(slug: string, spots: SpotProfile[] = surfSpots) {
  return spots.find((spot) => spot.slug === slug) ?? spots.find((spot) => spot.slug === 'pantin') ?? spots[0] ?? surfSpots[0]
}
