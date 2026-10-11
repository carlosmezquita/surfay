/**
 * Sunrise/sunset for a spot, computed locally with the standard NOAA solar
 * equations. Accurate to ~2 minutes, which is plenty for planning daylight
 * surf windows. Returns null for polar day/night (never the case in Galicia,
 * but the guard keeps the helper honest).
 */
const ZENITH_DEG = 90.833 // official zenith for sunrise/sunset

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

function sunTimeUtcMinutes(dayOfYear: number, latitude: number, longitude: number, sunrise: boolean) {
  const lngHour = longitude / 15
  const t = dayOfYear + ((sunrise ? 6 : 18) - lngHour) / 24
  const meanAnomaly = 0.9856 * t - 3.289
  let trueLongitude = meanAnomaly + 1.916 * Math.sin(toRad(meanAnomaly)) + 0.02 * Math.sin(toRad(2 * meanAnomaly)) + 282.634
  trueLongitude = ((trueLongitude % 360) + 360) % 360

  let rightAscension = toDeg(Math.atan(0.91764 * Math.tan(toRad(trueLongitude))))
  rightAscension = ((rightAscension % 360) + 360) % 360
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90
  rightAscension /= 15

  const sinDeclination = 0.39782 * Math.sin(toRad(trueLongitude))
  const cosDeclination = Math.cos(Math.asin(sinDeclination))
  const cosHourAngle =
    (Math.cos(toRad(ZENITH_DEG)) - sinDeclination * Math.sin(toRad(latitude))) /
    (cosDeclination * Math.cos(toRad(latitude)))
  if (cosHourAngle > 1 || cosHourAngle < -1) return null

  let hourAngle = sunrise ? 360 - toDeg(Math.acos(cosHourAngle)) : toDeg(Math.acos(cosHourAngle))
  hourAngle /= 15
  const localMeanTime = hourAngle + rightAscension - 0.06571 * t - 6.622
  const utcMinutes = (localMeanTime - lngHour) * 60
  return ((utcMinutes % 1440) + 1440) % 1440
}

export type SunTimes = {
  sunrise: Date
  sunset: Date
}

export function sunTimes(date: Date, latitude: number, longitude: number): SunTimes | null {
  const dayOfYear = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000,
  )
  const sunriseMinutes = sunTimeUtcMinutes(dayOfYear, latitude, longitude, true)
  const sunsetMinutes = sunTimeUtcMinutes(dayOfYear, latitude, longitude, false)
  if (sunriseMinutes === null || sunsetMinutes === null) return null

  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return {
    sunrise: new Date(base + sunriseMinutes * 60_000),
    sunset: new Date(base + sunsetMinutes * 60_000),
  }
}
