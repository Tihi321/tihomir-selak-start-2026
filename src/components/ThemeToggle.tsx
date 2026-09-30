import { createSignal, onCleanup, onMount } from 'solid-js';

export type ThemeChoice = 'light' | 'dark' | 'system';

const SHARED_DOMAIN = 'tihomir-selak.from.hr';
const COLORS = { dark: '#0A1020', light: '#EEF2F8' } as const;

function sharedCookieSuffix() {
  const host = location.hostname;
  const shared = host === SHARED_DOMAIN || host.endsWith(`.${SHARED_DOMAIN}`);
  return shared ? `; domain=.${SHARED_DOMAIN}; Secure` : '';
}

function store(value: string | null) {
  try {
    if (value) localStorage.setItem('ts-theme', value);
    else localStorage.removeItem('ts-theme');
  } catch {
    // Storage can be blocked. The choice then lasts for this page only.
  }
}

export function explicitTheme(): 'light' | 'dark' | null {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : null;
}

export function currentThemeChoice(): ThemeChoice {
  return explicitTheme() ?? 'system';
}

export function effectiveTheme(): 'light' | 'dark' {
  return (
    explicitTheme() ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

function syncMetas() {
  const chosen = explicitTheme();
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      if (chosen) meta.setAttribute('content', COLORS[chosen]);
    });
}

export function setTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
    store(null);
    document.cookie = `ts-theme=; path=/; max-age=0; SameSite=Lax${sharedCookieSuffix()}`;
    // Restore the media-scoped metas' own colours.
    const metas = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    metas.forEach((meta) =>
      meta.setAttribute(
        'content',
        meta.media.includes('dark') ? COLORS.dark : COLORS.light,
      ),
    );
  } else {
    root.setAttribute('data-theme', choice);
    store(choice);
    document.cookie = `ts-theme=${choice}; path=/; max-age=31536000; SameSite=Lax${sharedCookieSuffix()}`;
    syncMetas();
  }
  window.dispatchEvent(new CustomEvent('start-theme-change'));
}

export default function ThemeToggle() {
  const [theme, setThemeSignal] = createSignal<'light' | 'dark'>('dark');
  onMount(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      setThemeSignal(effectiveTheme());
      syncMetas();
    };
    sync();
    dark.addEventListener('change', sync);
    window.addEventListener('start-theme-change', sync);
    onCleanup(() => {
      dark.removeEventListener('change', sync);
      window.removeEventListener('start-theme-change', sync);
    });
  });
  return (
    <button
      class="icon-btn"
      type="button"
      data-theme-toggle
      aria-label={
        theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
      onClick={() => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark')}
    >
      <svg
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {theme() === 'dark' ? (
          <g>
            <circle cx="10" cy="10" r="3.4" />
            <path d="M10 2.2v1.8M10 16v1.8M2.2 10H4M16 10h1.8M4.5 4.5l1.3 1.3M14.2 14.2l1.3 1.3M4.5 15.5l1.3-1.3M14.2 5.8l1.3-1.3" />
          </g>
        ) : (
          <g>
            <path d="M16.5 11.8A6.8 6.8 0 0 1 8.2 3.5a6.8 6.8 0 1 0 8.3 8.3Z" />
          </g>
        )}
      </svg>
    </button>
  );
}
