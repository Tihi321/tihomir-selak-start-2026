import { expect, test, type Page } from '@playwright/test';
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

const dailyQuote = {
  text: 'Daily test quote for the day.',
  author: 'Ada Tester',
};
const quoteList = [
  dailyQuote,
  { text: 'Second test quote from the list.', author: 'Bea Tester' },
  { text: 'Third test quote from the list.', author: 'Cy Tester' },
];
// 1x1 transparent PNG
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://cdn.tihomir-selak.from.hr/daily/quote-eng.json',
    (route) => route.fulfill({ json: { data: dailyQuote } }),
  );
  await page.route(
    'https://cdn.tihomir-selak.from.hr/api/quotes-eng.json',
    (route) => route.fulfill({ json: { data: quoteList } }),
  );
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ json: weatherFixture }),
  );
});

async function openBackground(page: Page) {
  await page.getByRole('button', { name: 'Background', exact: true }).click();
  return page.getByRole('group', { name: 'Background options' });
}

async function addPlace(page: Page, city: string) {
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
  await expect(page.getByRole('heading', { name: 'Shortcuts' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Favorite shortcuts' })
      .getByRole('link'),
  ).toHaveCount(13);

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

  await page.getByRole('button', { name: 'Add', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Shortcuts' })).toBeVisible();
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
    'Saved forecast, connection unavailable',
  );
  await expect(page.locator('.weather-summary')).toContainText('20°C');
});

for (const theme of ['dark', 'light'] as const) {
  test(`the ${theme} page has no serious accessibility issues or horizontal overflow at target widths`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('ts-theme', value);
    }, theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.hero-quote blockquote')).toHaveText(
      dailyQuote.text,
    );
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
}

test('the photo background page has no serious accessibility issues', async ({
  page,
}) => {
  await page.goto('/');
  const popover = await openBackground(page);
  await popover.getByRole('radio', { name: 'Photo' }).check();
  await expect(page.locator('.bg-image')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);
});

test('the quote sits above the search box and Next quote shows another one', async ({
  page,
}) => {
  await page.goto('/');
  const quote = page.locator('.hero-quote blockquote');
  await expect(quote).toHaveText(dailyQuote.text);
  await expect(page.locator('.hero-quote figcaption')).toContainText(
    'Ada Tester',
  );
  const quoteBox = (await quote.boundingBox())!;
  const searchBox = (await page.locator('.search-rail').boundingBox())!;
  expect(quoteBox.y + quoteBox.height).toBeLessThanOrEqual(searchBox.y);

  await page.getByRole('button', { name: 'Next quote' }).click();
  await expect(quote).not.toHaveText(dailyQuote.text);
  await expect(quote).toHaveText(/test quote from the list/);
});

test('a CDN failure falls back to an original reflection', async ({ page }) => {
  await page.route('https://cdn.tihomir-selak.from.hr/**', (route) =>
    route.abort('failed'),
  );
  await page.goto('/');
  await expect(page.locator('.hero-quote figcaption')).toContainText(
    'An original reflection',
  );
  await expect(page.locator('.hero-quote blockquote')).not.toBeEmpty();
});

test('the quote can be turned off in settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-quote')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Show quote above search').uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.hero-quote')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.hero-quote')).toHaveCount(0);
});

test('the theme toggle flips the theme and the choice survives a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('system');
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
});

test('plain background hides the neural field and persists', async ({
  page,
}) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-background', 'field');
  await expect(page.locator('canvas.neural-field')).toBeVisible();
  const popover = await openBackground(page);
  await popover.getByRole('radio', { name: 'Plain' }).click();
  await expect(html).toHaveAttribute('data-background', 'plain');
  await expect(page.locator('canvas.neural-field')).toBeHidden();
  await expect(page.locator('.bg-image')).toHaveCount(0);
  await page.reload();
  await expect(html).toHaveAttribute('data-background', 'plain');
  await expect(page.locator('canvas.neural-field')).toBeHidden();
});

test('photo background shows a bundled photo and Shuffle changes it', async ({
  page,
}) => {
  await page.goto('/');
  const popover = await openBackground(page);
  await popover.getByRole('radio', { name: 'Photo' }).check();
  const image = page.locator('.bg-image');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^\/backgrounds\//);
  await expect(page.locator('html')).toHaveAttribute('data-field', 'off');
  await expect(page.locator('canvas.neural-field')).toBeHidden();
  const before = await image.getAttribute('src');
  await popover.getByRole('button', { name: 'Shuffle photo' }).click();
  await expect(image).not.toHaveAttribute('src', before!);
  await expect(image).toHaveAttribute('src', /^\/backgrounds\//);
});

test('your own image validates the address and then shows it', async ({
  page,
}) => {
  await page.route('https://images.example.test/**', (route) =>
    route.fulfill({ body: tinyPng, contentType: 'image/png' }),
  );
  await page.goto('/');
  const popover = await openBackground(page);
  await popover.getByRole('radio', { name: 'Your image' }).check();
  await popover.getByLabel('Image address').fill('http://x');
  await popover.getByRole('button', { name: 'Save image' }).click();
  await expect(popover.getByRole('alert')).toContainText('HTTPS');
  await expect(page.locator('.bg-image')).toHaveCount(0);

  await popover
    .getByLabel('Image address')
    .fill('https://images.example.test/pic.png');
  await popover.getByRole('button', { name: 'Save image' }).click();
  await expect(page.locator('.bg-image')).toHaveAttribute(
    'src',
    'https://images.example.test/pic.png',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-background',
    'custom',
  );
});

test('a custom image that fails to load falls back to the neural field', async ({
  page,
}) => {
  await page.route('https://images.example.test/**', (route) =>
    route.abort('failed'),
  );
  await page.goto('/');
  const popover = await openBackground(page);
  await popover.getByRole('radio', { name: 'Your image' }).check();
  await popover
    .getByLabel('Image address')
    .fill('https://images.example.test/broken.png');
  await popover.getByRole('button', { name: 'Save image' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-background',
    'field',
  );
  await expect(page.getByRole('status')).toContainText('could not be loaded');
});

test('the background popover closes on Escape and outside click', async ({
  page,
}) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Background', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await page.locator('.search-rail').click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('Slack and Facebook Messages shortcuts use the requested links', async ({
  page,
}) => {
  await page.goto('/');
  const shelf = page.getByRole('navigation', { name: 'Favorite shortcuts' });
  await expect(shelf.getByRole('link', { name: 'Slack' })).toHaveAttribute(
    'href',
    'https://app.slack.com/client/T03TQ1AE0/C01R9LA2UTW',
  );
  await expect(
    shelf.getByRole('link', { name: 'Facebook Messages' }),
  ).toHaveAttribute('href', 'https://www.facebook.com/messages/');
});
