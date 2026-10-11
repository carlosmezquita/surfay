import type { ForecastDataset, SpotForecast } from '../src/domain/forecast'

const GZIP_PREFIX = 'gzip-base64:'
const CHUNK_SIZE = 32_768

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function gzipEncode(json: string) {
  const compressed = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer())
  return `${GZIP_PREFIX}${bytesToBase64(bytes)}`
}

async function gzipDecode(payload: string) {
  if (!payload.startsWith(GZIP_PREFIX)) return JSON.parse(payload)
  const bytes = base64ToBytes(payload.slice(GZIP_PREFIX.length))
  const decompressed = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Response(decompressed).json()
}

export async function encodeForecastDataset(dataset: ForecastDataset) {
  return gzipEncode(JSON.stringify(dataset))
}

export async function decodeForecastDataset(payload: string) {
  return gzipDecode(payload) as Promise<ForecastDataset>
}

export async function encodeSpotForecast(forecast: SpotForecast) {
  return gzipEncode(JSON.stringify(forecast))
}

export async function decodeSpotForecast(payload: string) {
  return gzipDecode(payload) as Promise<SpotForecast>
}
