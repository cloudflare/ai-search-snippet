import { DEMO_API_URL } from '../data/configurator.ts';
import { validateApiUrlParam } from '../lib/api-url-allowlist.ts';
import './register-snippets.ts';

type Theme = 'dark' | 'light';

function getQueryParamApiUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('api-url');
  if (raw === null) return null;
  const validated = validateApiUrlParam(raw);
  if (validated === null) {
    console.warn(
      'Site: ignoring untrusted ?api-url= value; expected https://<hash>.search.ai.cloudflare.com'
    );
    return null;
  }
  return validated;
}

function copyToClipboard(button: HTMLButtonElement, value: string): void {
  void navigator.clipboard.writeText(value).then(
    () => {
      const originalLabel = button.textContent ?? 'Copy';
      button.textContent = 'Copied!';
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 2000);
    },
    (error: unknown) => {
      console.error('Site: Copy failed', error);
    }
  );
}

function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  const sunIcon = document.querySelector<SVGElement>('[data-theme-icon="sun"]');
  const moonIcon = document.querySelector<SVGElement>('[data-theme-icon="moon"]');
  const label = document.querySelector<HTMLElement>('[data-theme-label]');

  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    if (sunIcon) {
      sunIcon.style.display = 'none';
    }
    if (moonIcon) {
      moonIcon.style.display = 'block';
    }
    if (label) {
      label.textContent = 'Dark';
    }
  } else {
    html.removeAttribute('data-theme');
    if (sunIcon) {
      sunIcon.style.display = 'block';
    }
    if (moonIcon) {
      moonIcon.style.display = 'none';
    }
    if (label) {
      label.textContent = 'Light';
    }
  }

  document.querySelectorAll<HTMLElement>('[data-site-theme-sync]').forEach((element) => {
    element.setAttribute('theme', theme);
  });
}

function initThemeToggle(): void {
  const themeToggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!themeToggle) {
    return;
  }

  const savedTheme =
    (localStorage.getItem('theme') as Theme | null) ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  applyTheme(savedTheme);

  themeToggle.addEventListener('click', () => {
    const nextTheme: Theme =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  });
}

function initGlobalSearchModal(): void {
  const globalSearchModal = document.querySelector<HTMLElement>('[data-global-search-modal]');
  if (!globalSearchModal) {
    return;
  }

  const apiUrl = getQueryParamApiUrl() ?? DEMO_API_URL;
  globalSearchModal.setAttribute('api-url', apiUrl);

  const heroTrigger = document.querySelector<HTMLButtonElement>('[data-hero-search-trigger]');
  heroTrigger?.addEventListener('click', () => {
    (globalSearchModal as HTMLElement & { open?: () => void }).open?.();
  });
}

function initQuickStartTabs(): void {
  const quickStartRoot = document.querySelector<HTMLElement>('[data-quickstart]');
  if (!quickStartRoot) {
    return;
  }

  const tabs = quickStartRoot.querySelectorAll<HTMLButtonElement>('[data-quickstart-tab]');
  const panels = quickStartRoot.querySelectorAll<HTMLElement>('[data-quickstart-panel]');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.quickstartTab;
      if (!target) {
        return;
      }

      tabs.forEach((item) => {
        item.classList.remove('active');
      });
      panels.forEach((panel) => {
        panel.classList.remove('active');
      });
      tab.classList.add('active');
      quickStartRoot
        .querySelector<HTMLElement>(`[data-quickstart-panel="${target}"]`)
        ?.classList.add('active');
    });
  });

  quickStartRoot.querySelectorAll<HTMLButtonElement>('[data-copy-quickstart]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.copyQuickstart;
      const codeBlock = target
        ? quickStartRoot.querySelector<HTMLElement>(`[data-quickstart-panel="${target}"] code`)
        : null;

      if (codeBlock?.textContent) {
        copyToClipboard(button, codeBlock.textContent);
      }
    });
  });
}

function init(): void {
  initThemeToggle();
  initGlobalSearchModal();
  initQuickStartTabs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
