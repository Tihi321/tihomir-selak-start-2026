import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const weatherFixture = {
  current: {
    temperature_2m: 20,
    apparent_temperature: 19,
    weather_code: 2,
    is_day: 1,
  },
  daily: {
    temperature_2m_max: [24],
    temperature_2m_min: [12],
    precipitation_probability_max: [30],
  },
};

async function addPlace(page: import('@playwright/test').Page, city: string) {
  const settings = page.getByRole('dialog', { name: 'Settings & backup' });
  if (!(await settings.isVisible())) {
    await page.locator('.settings-trigger').click();
  }
  await page.getByRole('searchbox', { name: 'Add a place' }).fill(city);
  await page.getByRole('button', { name: 'Search places' }).click();
  await page.getByRole('button', { name: 'Add to saved places' }).click();
  await expect(page.locator('.weather-summary strong')).toHaveText(city);
}

test('search, keyboard focus, and shortcut management work in the browser', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your shortcuts' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Favorite shortcuts' })
      .getByRole('link'),
  ).toHaveCount(12);

  await page.keyboard.press('/');
  await expect(
    page.getByRole('searchbox', {
      name: 'Search the web or open a destination',
    }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'All shortcuts' }).click();
  const filter = page.getByRole('searchbox', { name: 'Filter shortcuts' });
  await filter.fill('github');
  await expect(page.getByRole('link', { name: /GitHub/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Gmail/ })).toHaveCount(0);
  await filter.clear();

  await page.getByRole('button', { name: 'Add', exact: false }).click();
  await page.getByLabel('Name').fill('Local notes');
  await page.getByLabel('Website address').fill('https://example.com/notes');
  await page.getByRole('button', { name: 'Save shortcut' }).click();
  await expect(page.getByRole('link', { name: /Local notes/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'All shortcuts' }).click();
  await expect(page.getByRole('link', { name: /Local notes/ })).toBeVisible();
});

test('search uses the chosen web provider and keeps external navigation safe', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = (url) => {
      document.documentElement.dataset.openedUrl = String(url);
      return null;
    };
  });
  await page.goto('/');
  await page
    .getByRole('searchbox', { name: 'Search the web or open a destination' })
    .fill('quiet night');
  await page.getByRole('button', { name: 'Search with Google' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-opened-url',
    'https://www.google.com/search?q=quiet%20night',
  );
});

test('the dashboard remains usable when the localStorage property is blocked', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(
    page.getByText('Browser storage is unavailable. Changes may not persist.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your shortcuts' }),
  ).toBeVisible();
});

test('weather arrows wrap and the selected saved place survives refresh', async ({
  page,
}) => {
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    const name =
      new URL(route.request().url()).searchParams.get('name') ?? 'Zagreb';
    await route.fulfill({
      json: {
        results: [
          {
            id: 101,
            name,
            country: 'Croatia',
            admin1: 'Grad Zagreb',
            latitude: 46,
            longitude: 16,
            timezone: 'Europe/Zagreb',
          },
        ],
      },
    });
  });
  await page.route('https://api.open-meteo.com/**', async (route) =>
    route.fulfill({ json: weatherFixture }),
  );
  await page.goto('/');
  await expect(page.locator('.weather-summary strong')).toHaveText('Osijek');
  await addPlace(page, 'Zagreb');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Next weather location' }).click();
  await expect(page.locator('.weather-summary strong')).toHaveText('Osijek');
  await page.getByRole('button', { name: 'Next weather location' }).click();
  await expect(page.locator('.weather-summary strong')).toHaveText('Zagreb');
  await page.reload();
  await expect(page.locator('.weather-summary strong')).toHaveText('Zagreb');
});

test('settings manage saved places and temperature units', async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    const name =
      new URL(route.request().url()).searchParams.get('name') ?? 'Zagreb';
    await route.fulfill({
      json: {
        results: [
          {
            id: name === 'Split' ? 202 : 101,
            name,
            country: 'Croatia',
            admin1: 'Region',
            latitude: 46,
            longitude: 16,
            timezone: 'Europe/Zagreb',
          },
        ],
      },
    });
  });
  await page.route('https://api.open-meteo.com/**', async (route) =>
    route.fulfill({ json: weatherFixture }),
  );
  await page.goto('/');
  await page.locator('.settings-trigger').click();
  await addPlace(page, 'Zagreb');
  await addPlace(page, 'Split');
  const settings = page.getByRole('dialog', { name: 'Settings & backup' });
  await settings.getByLabel('Temperature').selectOption('imperial');
  await expect(page.locator('.weather-summary span').first()).toContainText(
    '°F',
  );
  await settings.getByRole('button', { name: 'Move Split up' }).click();
  await expect(settings.locator('.saved-place').nth(1)).toContainText('Split');
  page.once('dialog', (dialog) => dialog.accept('Split, Croatia'));
  await settings.getByRole('button', { name: 'Rename' }).nth(1).click();
  await expect(settings.getByText('Split, Croatia')).toBeVisible();
  await settings.getByRole('button', { name: 'Remove' }).nth(1).click();
  await expect(settings.locator('.saved-place')).toHaveCount(2);
});

test('cached weather remains visible with a stale label after an API failure', async ({
  page,
}) => {
  let fail = false;
  await page.route('https://api.open-meteo.com/**', async (route) => {
    if (fail) return route.abort('failed');
    await route.fulfill({ json: weatherFixture });
  });
  await page.goto('/');
  await expect(page.locator('.weather-summary')).toContainText('20°C');
  fail = true;
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect(page.locator('.weather-summary')).toContainText(
    'Saved forecast · connection unavailable',
  );
  await expect(page.locator('.weather-summary')).toContainText('20°C');
});

test('the page has no serious accessibility issues or horizontal overflow at target widths', async ({
  page,
}) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
});
