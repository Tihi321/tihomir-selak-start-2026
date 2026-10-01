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

const dailyWord = {
  name: 'Petrichor',
  detail: 'The pleasant smell of rain on dry ground.',
};

const bugFeed = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Bug</title>${Array.from(
  { length: 8 },
  (_, index) =>
    `<item><title>Bug story ${index + 1}${index === 2 ? ' about Rust' : ''}</title><link>https://example.com/bug/${index + 1}</link><description>Summary text ${index + 1}${index === 2 ? ' mentions Rust' : ''}</description><pubDate>Tue, 29 Sep 2026 1${index}:00:00 GMT</pubDate></item>`,
).join('')}</channel></rss>`;

const vergeFeed = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>The Verge</title><updated>2026-09-30T00:00:00+00:00</updated><id>https://www.theverge.com/</id><entry><title>Verge headline one</title><link rel="alternate" type="text/html" href="https://example.com/verge/1"/><id>verge-1</id><updated>2026-09-29T10:00:00+00:00</updated><summary>Verge summary one</summary></entry><entry><title>Verge headline two</title><link rel="alternate" type="text/html" href="https://example.com/verge/2"/><id>verge-2</id><updated>2026-09-29T09:00:00+00:00</updated><summary>Verge summary two</summary></entry></feed>`;

const techcrunchFeed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>TechCrunch</title><item><title>TechCrunch headline</title><link>https://example.com/tc/1</link><description>TC summary</description><pubDate>Tue, 29 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`;

const feeds: Record<string, string> = {
  'bug.xml': bugFeed,
  'verge.xml': vergeFeed,
  'techcrunch.xml': techcrunchFeed,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Nothing may really play in tests. The engine only sees resolved promises.
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => undefined;
    HTMLMediaElement.prototype.load = () => undefined;
  });
  await page.route('https://cdn.tihomir-selak.from.hr/rss/*.xml', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({
      body: feeds[name] ?? '',
      contentType: 'application/xml',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route(
    'https://cdn.tihomir-selak.from.hr/daily/vocabulary-word-eng.json',
    (route) => route.fulfill({ json: { data: dailyWord } }),
  );
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
  await page.getByLabel('Name', { exact: true }).fill('Local notes');
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

test('each search category remembers its own provider and opens a prompt URL', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = (url) => {
      document.documentElement.dataset.openedUrl = String(url);
      return null;
    };
  });
  await page.goto('/');
  const category = page.getByRole('group', { name: 'Search category' });
  const provider = page.getByLabel('Search provider');
  await category.getByRole('button', { name: 'AI', exact: true }).click();
  await provider.selectOption('claude');
  await category.getByRole('button', { name: 'Web', exact: true }).click();
  await expect(provider).toHaveValue('google');
  await category.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(provider).toHaveValue('claude');
  await page
    .getByRole('searchbox', { name: 'Search the web or open a destination' })
    .fill('hello world');
  await page.getByRole('button', { name: 'Search with Claude' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-opened-url',
    'https://claude.ai/new?q=hello%20world',
  );
  await page.reload();
  await expect(provider).toHaveValue('claude');
  await expect(
    category.getByRole('button', { name: 'AI', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('per-category default providers in settings survive a reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings & backup' });
  await settings.getByLabel('AI default').selectOption('grok');
  await settings.getByLabel('Video default').selectOption('udemy');
  await settings.getByLabel('Music default').selectOption('chosic');
  await settings.getByLabel('Web default').selectOption('brave');
  await settings.getByLabel('Start on').selectOption('music');
  await page.reload();
  const category = page.getByRole('group', { name: 'Search category' });
  const provider = page.getByLabel('Search provider');
  await expect(provider).toHaveValue('chosic');
  await category.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(provider).toHaveValue('grok');
  await category.getByRole('button', { name: 'Video', exact: true }).click();
  await expect(provider).toHaveValue('udemy');
  await category.getByRole('button', { name: 'Web', exact: true }).click();
  await expect(provider).toHaveValue('brave');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Settings & backup' })
      .getByLabel('AI default'),
  ).toHaveValue('grok');
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
  await expect(page.locator('.notice')).toContainText('could not be loaded');
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

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);
}

test('news tabs, filter, saved filters and the expanded view work and persist', async ({
  page,
}) => {
  await page.goto('/');
  const news = page.locator('.news-panel');
  const items = news.locator('.news-item');
  await expect(news.getByRole('heading', { name: 'News' })).toBeVisible();
  await expect(items).toHaveCount(6);
  await news.getByRole('button', { name: /Show all \(8\)/ }).click();
  await expect(items).toHaveCount(8);
  await expect(items.first().getByRole('link')).toHaveAttribute(
    'href',
    /^https:\/\/example\.com\/bug\//,
  );
  await expect(items.first().getByRole('link')).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );

  const filter = news.getByRole('searchbox', { name: 'Filter news' });
  await filter.fill('rust');
  await expect(items).toHaveCount(1);
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await filter.fill('rust');
  await news.getByRole('button', { name: 'Save filter' }).click();
  await news.getByRole('textbox', { name: 'Filter name' }).fill('Rusty');
  await news
    .locator('.news-name-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const presets = news.getByRole('list', { name: 'Saved filters' });
  await expect(
    presets.getByRole('button', { name: 'Rusty', exact: true }),
  ).toBeVisible();
  await filter.clear();
  await presets.getByRole('button', { name: 'Rusty', exact: true }).click();
  await expect(filter).toHaveValue('rust');
  await expect(items).toHaveCount(1);

  await news.getByRole('button', { name: 'Expanded view' }).click();
  await expect(news.locator('.news-item__summary')).toHaveCount(1);

  await news.getByRole('button', { name: 'The Verge', exact: true }).click();
  await filter.clear();
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Verge headline one');

  await page.reload();
  const reloaded = page.locator('.news-panel');
  await expect(
    reloaded.getByRole('button', { name: 'The Verge', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(reloaded.locator('.news-item')).toHaveCount(2);
  await expect(reloaded.locator('.news-item__summary')).toHaveCount(2);
  await expect(
    reloaded.getByRole('button', { name: 'Rusty', exact: true }),
  ).toBeVisible();
  await reloaded
    .getByRole('button', { name: 'Remove saved filter Rusty' })
    .click();
  await expect(
    reloaded.getByRole('list', { name: 'Saved filters' }),
  ).toHaveCount(0);
});

test('news can be turned off in settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.news-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Show news').uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.news-panel')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.news-panel')).toHaveCount(0);
});

test('the word of the day shows, expands and can be turned off', async ({
  page,
}) => {
  await page.goto('/');
  const details = page.locator('details.word-of-day');
  await expect(details.locator('summary')).toContainText('Word of the day');
  await expect(details.locator('summary')).toContainText(dailyWord.name);
  await expect(details.getByText(dailyWord.detail)).toBeHidden();
  await details.locator('summary').click();
  await expect(details.getByText(dailyWord.detail)).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Show word of the day').uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('details.word-of-day')).toHaveCount(0);
});

test('focus mode hides shortcuts and news via the button and Ctrl+apostrophe, and survives a reload', async ({
  page,
}) => {
  await page.goto('/');
  const html = page.locator('html');
  const button = page.getByRole('button', { name: 'Focus mode' });
  const shortcuts = page.getByRole('heading', { name: 'Shortcuts' });
  const news = page.locator('.news-panel');
  await expect(news).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(html).toHaveAttribute('data-focus', 'on');
  await expect(shortcuts).toBeHidden();
  await expect(news).toBeHidden();
  await expect(page.locator('.search-rail')).toBeVisible();

  await page.reload();
  await expect(html).toHaveAttribute('data-focus', 'on');
  await expect(shortcuts).toBeHidden();

  await page.keyboard.press("Control+'");
  await expect(html).toHaveAttribute('data-focus', 'off');
  await expect(shortcuts).toBeVisible();
  await expect(news).toBeVisible();
  await page.keyboard.press("Control+'");
  await expect(html).toHaveAttribute('data-focus', 'on');
});

test('the sound drawer saves and restores a mix, manages a playlist and closes on Escape', async ({
  page,
}) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Sound', exact: true });
  const drawer = page.locator('#audio-drawer');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('playing-dot')).toHaveCount(0);

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer).toBeVisible();
  const rain = drawer.getByRole('slider', { name: 'Rain volume' });
  await rain.fill('5');
  await expect(rain).toHaveValue('5');
  await expect(page.getByTestId('playing-dot')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(drawer.getByText('Mix saved')).toBeVisible();

  await page.reload();
  await button.click();
  await expect(rain).toHaveValue('0');
  await drawer.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(rain).toHaveValue('5');
  await drawer.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(rain).toHaveValue('0');
  await expect(page.getByTestId('playing-dot')).toHaveCount(0);

  // Ctrl+Alt+5 starts the saved mix, Ctrl+Alt+4 stops everything.
  await page.keyboard.press('Control+Alt+5');
  await expect(rain).toHaveValue('5');
  await page.keyboard.press('Control+Alt+4');
  await expect(rain).toHaveValue('0');

  // Playlist: add, play, remove.
  await drawer.getByRole('textbox', { name: 'Song name' }).fill('Night Drive');
  await drawer
    .getByRole('textbox', { name: 'Song address' })
    .fill('http://insecure.example.com/a.mp3');
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('HTTPS');
  await drawer
    .getByRole('textbox', { name: 'Song address' })
    .fill('https://media.example.com/night-drive.mp3');
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    drawer.getByRole('button', { name: 'Night Drive', exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole('button', { name: 'Night Drive', exact: true })
    .click();
  await expect(page.getByTestId('playing-dot')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('playing-dot')).toHaveCount(0);
  await page.reload();
  await button.click();
  await drawer.getByRole('button', { name: 'Remove Night Drive' }).click();
  await expect(
    drawer.getByRole('button', { name: 'Night Drive', exact: true }),
  ).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
  await expect(drawer).toBeHidden();
});

test('the sound drawer closes on outside click and excludes the background menu', async ({
  page,
}) => {
  await page.goto('/');
  const sound = page.getByRole('button', { name: 'Sound', exact: true });
  const background = page.getByRole('button', {
    name: 'Background',
    exact: true,
  });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-expanded', 'true');
  await background.click();
  await expect(sound).toHaveAttribute('aria-expanded', 'false');
  await expect(background).toHaveAttribute('aria-expanded', 'true');
  await sound.click();
  await expect(background).toHaveAttribute('aria-expanded', 'false');
  await page.locator('.search-rail').click();
  await expect(sound).toHaveAttribute('aria-expanded', 'false');
});

test('audio shortcuts are ignored while typing in a field', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sound', exact: true }).click();
  const drawer = page.locator('#audio-drawer');
  const rain = drawer.getByRole('slider', { name: 'Rain volume' });
  await rain.fill('4');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await drawer.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('searchbox', { name: /Search the web/ }).focus();
  await page.keyboard.press('Control+Alt+5');
  await expect(rain).toHaveValue('0');
});

test('the page has no serious accessibility issues with news visible and the sound drawer open', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.news-item').first()).toBeVisible();
  await page.getByRole('button', { name: 'Sound', exact: true }).click();
  await expect(page.locator('#audio-drawer')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('the settings keyboard block lists the shortcuts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const block = page
    .getByRole('dialog', { name: 'Settings & backup' })
    .locator('.keyboard-list');
  await expect(block).toContainText('Focus mode');
  await expect(block).toContainText('Stop all sound');
  await expect(block.locator('kbd')).toHaveCount(21);
});

test('the default dashboard including the news list fits a 1440x1200 viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/');
  const items = page.locator('.news-item');
  await expect(items.first()).toBeVisible();
  await expect(items).toHaveCount(6);

  const layout = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.innerHeight);

  const lastBox = await items.last().boundingBox();
  expect(lastBox).not.toBeNull();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(layout.innerHeight);
});
