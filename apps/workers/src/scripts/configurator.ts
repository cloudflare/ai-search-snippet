import {
  CSS_VAR_CONFIGS,
  type CssVarConfig,
  createPropConfigs,
  DEMO_API_URL,
  type PropConfig,
  type ThemeMode,
} from '../data/configurator.ts';
import { getSnippetTag, type SnippetId } from '../data/snippets.ts';
import { validateApiUrlParam } from '../lib/api-url-allowlist.ts';
import {
  type CodeCssVarData,
  type CodePropData,
  generateHtmlCode,
  generateReactCode,
  generateVueCode,
} from '../lib/configurator-codegen.ts';
import './register-snippets.ts';

declare global {
  interface Window {
    Prism?: {
      highlightElement: (element: Element) => void;
    };
  }
}

type ConfigValue = boolean | number | string;
type ConfigCodeTab = 'html' | 'react' | 'vue';

function getApiUrlFromQueryParams(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('api-url');
  if (raw === null) return null;
  const validated = validateApiUrlParam(raw);
  if (validated === null) {
    console.warn(
      'Configurator: ignoring untrusted ?api-url= value; expected https://<hash>.search.ai.cloudflare.com'
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
      console.error('Configurator: Copy failed', error);
    }
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

class ConfiguratorController {
  private readonly propConfigs: readonly PropConfig[];
  private currentSnippet: SnippetId = 'search-bar';
  private currentThemeMode: ThemeMode = 'light';
  private readonly propValues = new Map<string, ConfigValue>();
  private readonly cssValuesDark = new Map<string, string>();
  private readonly cssValuesLight = new Map<string, string>();
  private readonly cssValuesShared = new Map<string, string>();
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.propConfigs = createPropConfigs(getApiUrlFromQueryParams() ?? '');
    this.resetState();
  }

  init(): void {
    this.bindPageTriggers();
    this.bindModalEvents();
    this.renderProps();
    this.renderCSSVars();
    this.updatePreview();
  }

  private get propsContainer(): HTMLElement | null {
    return this.root.querySelector<HTMLElement>('[data-props-container]');
  }

  private get cssVarsContainer(): HTMLElement | null {
    return this.root.querySelector<HTMLElement>('[data-css-vars-container]');
  }

  private get previewContainer(): HTMLElement | null {
    return this.root.querySelector<HTMLElement>('[data-preview-container]');
  }

  private resetState(): void {
    this.propValues.clear();
    this.cssValuesDark.clear();
    this.cssValuesLight.clear();
    this.cssValuesShared.clear();

    this.propConfigs.forEach((config) => {
      this.propValues.set(config.name, config.defaultValue);
    });

    CSS_VAR_CONFIGS.forEach((config) => {
      if (config.themeable) {
        this.cssValuesLight.set(config.name, config.lightDefault ?? '');
        this.cssValuesDark.set(config.name, config.darkDefault ?? '');
      } else {
        this.cssValuesShared.set(config.name, config.defaultValue ?? '');
      }
    });
  }

  private bindPageTriggers(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-open-configurator]').forEach((card) => {
      card.addEventListener('click', () => {
        const snippetId = card.dataset.snippet as SnippetId | undefined;
        if (snippetId) {
          this.open(snippetId);
        }
      });
    });
  }

  private bindModalEvents(): void {
    this.root
      .querySelector<HTMLButtonElement>('[data-config-close]')
      ?.addEventListener('click', () => {
        this.close();
      });

    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) {
        this.close();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.root.classList.contains('open')) {
        this.close();
      }
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-snippet-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const snippetId = button.dataset.snippetTab as SnippetId | undefined;
        if (!snippetId) {
          return;
        }

        this.currentSnippet = snippetId;
        this.syncSnippetTabs();
        this.renderProps();
        this.updatePreview();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-theme-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.themeMode as ThemeMode | undefined;
        if (!mode) {
          return;
        }

        this.currentThemeMode = mode;
        this.root.querySelectorAll<HTMLButtonElement>('[data-theme-mode]').forEach((item) => {
          item.classList.toggle('active', item === button);
        });
        this.renderCSSVars();
        this.updatePreview();
      });
    });

    this.root
      .querySelector<HTMLButtonElement>('[data-config-reset]')
      ?.addEventListener('click', () => {
        this.resetState();
        this.renderProps();
        this.renderCSSVars();
        this.updatePreview();
      });

    this.root.querySelectorAll<HTMLButtonElement>('[data-config-code-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.configCodeTab as ConfigCodeTab | undefined;
        if (!target) {
          return;
        }

        this.root.querySelectorAll<HTMLButtonElement>('[data-config-code-tab]').forEach((item) => {
          item.classList.toggle('active', item === button);
        });
        this.root.querySelectorAll<HTMLElement>('[data-config-code-panel]').forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.configCodePanel === target);
        });
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-copy-config-code]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.copyConfigCode;
        const codeBlock = target
          ? this.root.querySelector<HTMLElement>(`[data-generated-code="${target}"]`)
          : null;

        if (codeBlock?.textContent) {
          copyToClipboard(button, codeBlock.textContent);
        }
      });
    });
  }

  private syncSnippetTabs(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-snippet-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.snippetTab === this.currentSnippet);
    });
  }

  private open(snippetId: SnippetId): void {
    this.currentSnippet = snippetId;
    this.syncSnippetTabs();
    this.renderProps();
    this.renderCSSVars();
    this.updatePreview();
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  private close(): void {
    this.root.classList.remove('open');
    document.body.style.overflow = '';
  }

  private renderProps(): void {
    const container = this.propsContainer;
    if (!container) {
      return;
    }

    const applicableConfigs = this.propConfigs.filter((config) =>
      config.appliesTo.includes(this.currentSnippet)
    );

    container.innerHTML = applicableConfigs
      .map((config) => {
        const value = this.propValues.get(config.name);
        const escapedName = escapeHtml(config.name);
        const escapedDescription = escapeHtml(config.description);

        if (config.type === 'boolean') {
          return `<div class="config-item"><label class="config-checkbox"><input type="checkbox" data-prop="${config.name}" ${value ? 'checked' : ''}><span class="config-label">${escapedName}</span></label><div class="config-description">${escapedDescription}</div></div>`;
        }

        if (config.type === 'select') {
          const options = (config.options ?? [])
            .map(
              (option) =>
                `<option value="${escapeAttribute(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`
            )
            .join('');

          return `<div class="config-item"><label class="config-label">${escapedName}</label><select class="config-select" data-prop="${config.name}">${options}</select><div class="config-description">${escapedDescription}</div></div>`;
        }

        if (config.name === 'api-url') {
          return `<div class="config-item"><label class="config-label">${escapedName}</label><div class="config-input-with-action"><input type="text" class="config-input" data-prop="${config.name}" value="${escapeAttribute(String(value ?? ''))}" placeholder="Enter your API URL"><button type="button" class="use-demo-btn" data-use-demo-api>Use demo</button></div><div class="config-description">${escapedDescription}</div></div>`;
        }

        const minValue = config.type === 'number' ? ' min="0"' : '';
        return `<div class="config-item"><label class="config-label">${escapedName}</label><input type="${config.type}" class="config-input" data-prop="${config.name}" value="${escapeAttribute(String(value ?? ''))}"${minValue}><div class="config-description">${escapedDescription}</div></div>`;
      })
      .join('');

    container
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-prop]')
      .forEach((input) => {
        const handlePropChange = () => {
          const propName = input.dataset.prop;
          if (!propName) {
            return;
          }

          const config = applicableConfigs.find((item) => item.name === propName);
          if (!config) {
            return;
          }

          let value: ConfigValue = input.value;
          if (input instanceof HTMLInputElement && input.type === 'checkbox') {
            value = input.checked;
          } else if (config.type === 'number') {
            value = Number(input.value);
          }

          this.propValues.set(propName, value);
          this.updatePreview();
        };

        input.addEventListener('change', handlePropChange);
        if (
          !(input instanceof HTMLInputElement && input.type === 'checkbox') &&
          !(input instanceof HTMLSelectElement)
        ) {
          input.addEventListener('input', handlePropChange);
        }
      });

    container
      .querySelector<HTMLButtonElement>('[data-use-demo-api]')
      ?.addEventListener('click', () => {
        const apiUrlInput = container.querySelector<HTMLInputElement>('[data-prop="api-url"]');
        if (!apiUrlInput) {
          return;
        }

        apiUrlInput.value = DEMO_API_URL;
        this.propValues.set('api-url', DEMO_API_URL);
        this.updatePreview();
      });
  }

  private renderCSSVars(): void {
    const container = this.cssVarsContainer;
    if (!container) {
      return;
    }

    const categories = [...new Set(CSS_VAR_CONFIGS.map((config) => config.category))];
    container.innerHTML = categories
      .map((category, index) => {
        const cssVars = CSS_VAR_CONFIGS.filter((config) => config.category === category);
        const collapsedClass = index > 2 ? ' collapsed' : '';
        const itemsMarkup = cssVars.map((config) => this.renderCssVarItem(config)).join('');
        const escapedCategory = escapeHtml(category);

        return `<div class="config-category${collapsedClass}"><div class="config-category-header"><span class="config-category-label">${escapedCategory}</span><span class="config-category-toggle">&#9660;</span></div><div class="config-category-items">${itemsMarkup}</div></div>`;
      })
      .join('');

    container.querySelectorAll<HTMLElement>('.config-category-header').forEach((header) => {
      header.addEventListener('click', () => {
        header.parentElement?.classList.toggle('collapsed');
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-css-var]').forEach((input) => {
      input.addEventListener('input', () => {
        const varName = input.dataset.cssVar;
        const isThemeable = input.dataset.themeable === 'true';
        if (!varName) {
          return;
        }

        this.setCssVarValue(varName, input.value, isThemeable);
        const textInput = container.querySelector<HTMLInputElement>(
          `[data-css-var-text="${varName}"]`
        );
        if (textInput) {
          textInput.value = input.value;
        }
        this.updatePreview();
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-css-var-text]').forEach((input) => {
      input.addEventListener('input', () => {
        const varName = input.dataset.cssVarText;
        const isThemeable = input.dataset.themeable === 'true';
        if (!varName) {
          return;
        }

        this.setCssVarValue(varName, input.value, isThemeable);
        const colorInput = container.querySelector<HTMLInputElement>(`[data-css-var="${varName}"]`);
        if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(input.value)) {
          colorInput.value = input.value;
        }
        this.updatePreview();
      });
    });
  }

  private renderCssVarItem(config: CssVarConfig): string {
    const value = config.themeable
      ? (this.getCurrentThemeValues().get(config.name) ?? '')
      : (this.cssValuesShared.get(config.name) ?? '');
    const escapedName = escapeHtml(config.name);
    const escapedDescription = escapeHtml(config.description);
    const escapedThemeMode = escapeHtml(this.currentThemeMode);
    const escapedValue = escapeAttribute(value);

    if (config.type === 'color') {
      const hexValue = value.startsWith('#') ? value.slice(0, 7) : '#000000';
      return `<div class="config-item"><label class="config-label">${escapedName}${config.themeable ? ` <span class="theme-indicator">(${escapedThemeMode})</span>` : ''}</label><div class="config-input-wrapper"><input type="color" class="config-input" data-css-var="${config.name}" data-themeable="${config.themeable ? 'true' : 'false'}" value="${hexValue}"><input type="text" class="config-input config-color-value" data-css-var-text="${config.name}" data-themeable="${config.themeable ? 'true' : 'false'}" value="${escapedValue}" placeholder="${escapedValue}"></div><div class="config-description">${escapedDescription}</div></div>`;
    }

    return `<div class="config-item"><label class="config-label">${escapedName}${config.themeable ? ` <span class="theme-indicator">(${escapedThemeMode})</span>` : ''}</label><input type="text" class="config-input" data-css-var="${config.name}" data-themeable="${config.themeable ? 'true' : 'false'}" value="${escapedValue}"><div class="config-description">${escapedDescription}</div></div>`;
  }

  private setCssVarValue(varName: string, value: string, isThemeable: boolean): void {
    if (isThemeable) {
      this.getCurrentThemeValues().set(varName, value);
      return;
    }

    this.cssValuesShared.set(varName, value);
  }

  private getCurrentThemeValues(): Map<string, string> {
    return this.currentThemeMode === 'light' ? this.cssValuesLight : this.cssValuesDark;
  }

  private updatePreview(): void {
    const container = this.previewContainer;
    if (!container) {
      return;
    }

    container.innerHTML = '';

    const tag = getSnippetTag(this.currentSnippet);
    const snippetElement = document.createElement(tag) as HTMLElement & { open?: () => void };
    if (this.currentSnippet === 'chat-bubble') {
      snippetElement.className = 'chat-bubble-inline';
    }

    this.propConfigs.forEach((config) => {
      if (!config.appliesTo.includes(this.currentSnippet)) {
        return;
      }

      const value = this.propValues.get(config.name);
      if (value !== undefined && value !== '') {
        snippetElement.setAttribute(config.name, String(value));
      }
    });

    const cssRules: string[] = [];
    this.getCurrentThemeValues().forEach((value, name) => {
      cssRules.push(`${name}: ${value}`);
    });
    this.cssValuesShared.forEach((value, name) => {
      cssRules.push(`${name}: ${value}`);
    });
    snippetElement.style.cssText = cssRules.join('; ');

    if (this.currentSnippet === 'search-modal') {
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'btn btn-primary';
      openButton.textContent = 'Open Search Modal (or press Cmd/Ctrl+K)';
      openButton.addEventListener('click', () => {
        snippetElement.open?.();
      });
      container.appendChild(openButton);
    }

    container.appendChild(snippetElement);
    this.updateCode();
  }

  private updateCode(): void {
    const tag = getSnippetTag(this.currentSnippet);
    const propsData: CodePropData[] = [];
    const cssVarsData: CodeCssVarData[] = [];
    const darkCssData: CodeCssVarData[] = [];

    this.propConfigs.forEach((config) => {
      if (!config.appliesTo.includes(this.currentSnippet)) {
        return;
      }

      const value = this.propValues.get(config.name);
      if (value !== undefined && value !== '' && value !== config.defaultValue) {
        propsData.push({ name: config.name, value, type: config.type });
      }
    });

    this.cssValuesShared.forEach((value, name) => {
      const config = CSS_VAR_CONFIGS.find((item) => item.name === name);
      if (config && value !== config.defaultValue) {
        cssVarsData.push({ name, value });
      }
    });

    this.cssValuesLight.forEach((value, name) => {
      const config = CSS_VAR_CONFIGS.find((item) => item.name === name);
      if (config && value !== config.lightDefault) {
        cssVarsData.push({ name, value });
      }
    });

    this.cssValuesDark.forEach((value, name) => {
      const config = CSS_VAR_CONFIGS.find((item) => item.name === name);
      if (config && value !== config.darkDefault) {
        darkCssData.push({ name, value });
      }
    });

    this.updateCodeBlock(
      'html',
      generateHtmlCode(
        tag,
        propsData,
        cssVarsData,
        darkCssData,
        String(this.propValues.get('api-url') ?? '')
      )
    );
    this.updateCodeBlock('react', generateReactCode(tag, propsData, cssVarsData));
    this.updateCodeBlock('vue', generateVueCode(tag, propsData, cssVarsData));
  }

  private updateCodeBlock(target: ConfigCodeTab, code: string): void {
    const codeElement = this.root.querySelector<HTMLElement>(`[data-generated-code="${target}"]`);
    if (!codeElement) {
      return;
    }

    codeElement.textContent = code;
    window.Prism?.highlightElement(codeElement);
  }
}

function init(): void {
  const root = document.querySelector<HTMLElement>('[data-config-modal]');
  if (!root) {
    return;
  }

  new ConfiguratorController(root).init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
