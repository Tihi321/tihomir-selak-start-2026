import { describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '@/data/defaults';
import {
  citySearchUrl,
  forecastUrl,
  getWeather,
  searchCities,
  weatherCacheKey,
  weatherDescription,
} from '@/lib/weather/openMeteo';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  asStorage() {
    return this as unknown as Storage;
  }
}

const location = createDefaultConfig().weather.locations[0]!;
const responseBody = {
  current: {
    temperature_2m: 20.5,
    apparent_temperature: 19.2,
    weather_code: 2,
    is_day: 1,
  },
  daily: {
    temperature_2m_max: [24],
    temperature_2m_min: [12],
    precipitation_probability_max: [30],
  },
};

describe('Open-Meteo adapter', () => {
  it('uses required fields and selected units', () => {
    const url = new URL(forecastUrl(location, 'imperial'));
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('timezone')).toBe('Europe/Zagreb');
    expect(url.searchParams.get('forecast_days')).toBe('1');
  });

  it('caches by location and units for 15 minutes', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => responseBody,
    })) as unknown as typeof fetch;
    const first = await getWeather(location, 'metric', {
      storage: storage.asStorage(),
      fetcher,
      now: 1000,
    });
    const second = await getWeather(location, 'metric', {
      storage: storage.asStorage(),
      fetcher,
      now: 2000,
    });
    expect(first.snapshot?.temperature).toBe(20.5);
    expect(second.snapshot?.temperature).toBe(20.5);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(weatherCacheKey('osijek', 'metric')).not.toBe(
      weatherCacheKey('osijek', 'imperial'),
    );
  });

  it('uses stale data when refresh fails or response is malformed', async () => {
    const storage = new MemoryStorage();
    const good = vi.fn(async () => ({
      ok: true,
      json: async () => responseBody,
    })) as unknown as typeof fetch;
    await getWeather(location, 'metric', {
      storage: storage.asStorage(),
      fetcher: good,
      now: 1000,
    });
    const failure = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const stale = await getWeather(location, 'metric', {
      storage: storage.asStorage(),
      fetcher: failure,
      now: 1_000_000,
    });
    expect(stale.stale).toBe(true);
    expect(stale.snapshot?.high).toBe(24);
    const bad = vi.fn(async () => ({
      ok: true,
      json: async () => ({ current: {} }),
    })) as unknown as typeof fetch;
    const malformed = await getWeather(location, 'metric', {
      storage: storage.asStorage(),
      fetcher: bad,
      now: 1_000_001,
    });
    expect(malformed.snapshot?.temperature).toBe(20.5);
  });

  it('searches cities after two characters and retains disambiguating details', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            name: 'Osijek',
            country: 'Croatia',
            admin1: 'Osječko-Baranjska',
            latitude: 45.55,
            longitude: 18.69,
            timezone: 'Europe/Zagreb',
          },
        ],
      }),
    })) as unknown as typeof fetch;
    expect(await searchCities('O', fetcher)).toEqual([]);
    const cities = await searchCities('Osijek', fetcher);
    expect(cities[0]).toMatchObject({
      label: 'Osijek',
      country: 'Croatia',
      region: 'Osječko-Baranjska',
    });
    expect(new URL(citySearchUrl('New York')).searchParams.get('name')).toBe(
      'New York',
    );
  });

  it('maps weather codes to readable conditions', () => {
    expect(weatherDescription(0)).toBe('Clear sky');
    expect(weatherDescription(61)).toBe('Rain');
    expect(weatherDescription(999)).toBe('Conditions unavailable');
  });
});
