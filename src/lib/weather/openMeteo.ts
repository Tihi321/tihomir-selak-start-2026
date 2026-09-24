import { z } from 'zod';
import type { StartPageConfig } from '@/lib/config/schema';

export type WeatherLocation = StartPageConfig['weather']['locations'][number];
export type WeatherUnits = StartPageConfig['weather']['units'];

const forecastSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number().int(),
    is_day: z.number().int().min(0).max(1),
  }),
  daily: z.object({
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
    precipitation_probability_max: z.array(z.number().nullable()).min(1),
  }),
});

const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        country: z.string(),
        admin1: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string(),
      }),
    )
    .optional(),
});

export type WeatherSnapshot = {
  temperature: number;
  feelsLike: number;
  high: number;
  low: number;
  precipitationChance: number | null;
  weatherCode: number;
  isDay: boolean;
  fetchedAt: number;
};

export type WeatherResult = {
  snapshot: WeatherSnapshot | null;
  stale: boolean;
  error: string | null;
};
export type CityResult = {
  id: number;
  label: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

const CACHE_PREFIX = 'start-page:weather:v1:';
const CACHE_AGE_MS = 15 * 60 * 1000;

export function forecastUrl(
  location: WeatherLocation,
  units: WeatherUnits,
): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,weather_code,is_day',
  );
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  );
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', location.timezone);
  url.searchParams.set(
    'temperature_unit',
    units === 'imperial' ? 'fahrenheit' : 'celsius',
  );
  return url.toString();
}

export function citySearchUrl(query: string): string {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query.trim());
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  return url.toString();
}

export function weatherCacheKey(
  locationId: string,
  units: WeatherUnits,
): string {
  return `${CACHE_PREFIX}${encodeURIComponent(locationId)}:${units}`;
}

function readCache(storage: Storage, key: string): WeatherSnapshot | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = z
      .object({
        temperature: z.number(),
        feelsLike: z.number(),
        high: z.number(),
        low: z.number(),
        precipitationChance: z.number().nullable(),
        weatherCode: z.number().int(),
        isDay: z.boolean(),
        fetchedAt: z.number(),
      })
      .safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getWeather(
  location: WeatherLocation,
  units: WeatherUnits,
  options: {
    storage: Storage;
    fetcher?: typeof fetch;
    now?: number;
    signal?: AbortSignal;
    force?: boolean;
  },
): Promise<WeatherResult> {
  const {
    storage,
    fetcher = fetch,
    now = Date.now(),
    signal,
    force = false,
  } = options;
  const key = weatherCacheKey(location.id, units);
  const cached = readCache(storage, key);
  if (
    !force &&
    cached &&
    now >= cached.fetchedAt &&
    now - cached.fetchedAt < CACHE_AGE_MS
  ) {
    return { snapshot: cached, stale: false, error: null };
  }
  try {
    const response = await fetcher(forecastUrl(location, units), { signal });
    if (!response.ok)
      throw new Error(`Weather service returned ${response.status}.`);
    const data = forecastSchema.parse(await response.json());
    const snapshot: WeatherSnapshot = {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      high: data.daily.temperature_2m_max[0]!,
      low: data.daily.temperature_2m_min[0]!,
      precipitationChance: data.daily.precipitation_probability_max[0] ?? null,
      weatherCode: data.current.weather_code,
      isDay: data.current.is_day === 1,
      fetchedAt: now,
    };
    try {
      storage.setItem(key, JSON.stringify(snapshot));
    } catch {
      /* Weather still works without cache. */
    }
    return { snapshot, stale: false, error: null };
  } catch (error) {
    return {
      snapshot: cached,
      stale: cached !== null,
      error: error instanceof Error ? error.message : 'Weather is unavailable.',
    };
  }
}

export async function searchCities(
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CityResult[]> {
  if (query.trim().length < 2) return [];
  const response = await fetcher(citySearchUrl(query), { signal });
  if (!response.ok) throw new Error(`City search returned ${response.status}.`);
  const data = geocodingSchema.parse(await response.json());
  return (data.results ?? []).map((result) => ({
    id: result.id,
    label: result.name,
    region: result.admin1 ?? '',
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  }));
}

export function weatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Conditions unavailable';
}
