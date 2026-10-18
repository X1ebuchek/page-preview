const template = document.createElement('template');

template.innerHTML = `
  <style>
    :host {
      display: inline-block;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      line-height: 1.35;
    }

    :host([hidden]) {
      display: none;
    }

    .link {
      display: block;
      box-sizing: border-box;
      min-width: 16rem;
      max-width: 24rem;
      padding: 0.75rem 1rem;
      border: 1px solid #d0d7de;
      border-radius: 10px;
      background: #ffffff;
      color: #1f2328;
      text-decoration: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .link:hover {
      border-color: #0969da;
      box-shadow: 0 2px 8px rgba(9, 105, 218, 0.15);
    }

    .link:focus-visible {
      outline: 2px solid #0969da;
      outline-offset: 2px;
    }

    .title {
      display: block;
      margin-bottom: 0.25rem;
      font-weight: 600;
      color: #0969da;
      word-break: break-word;
    }

    .heading {
      display: block;
      font-size: 0.9rem;
      color: #57606a;
      word-break: break-word;
    }

    .url {
      display: block;
      margin-top: 0.4rem;
      font-size: 0.75rem;
      color: #8c959f;
      word-break: break-all;
    }

    .url[hidden] {
      display: none;
    }

    :host([data-status="loading"]) .link {
      opacity: 0.7;
    }

    :host([data-status="error"]) .title {
      color: #cf222e;
    }
  </style>
  <a part="link" class="link">
    <span part="title" class="title"></span>
    <span part="heading" class="heading"></span>
    <span part="url" class="url" hidden></span>
  </a>
`;

export class PagePreview extends HTMLElement {
  static observedAttributes = ['src'];

  #link;
  #titleEl;
  #headingEl;
  #urlEl;
  #controller = null;
  #generation = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.append(template.content.cloneNode(true));

    this.#link = root.querySelector('[part="link"]');
    this.#titleEl = root.querySelector('[part="title"]');
    this.#headingEl = root.querySelector('[part="heading"]');
    this.#urlEl = root.querySelector('[part="url"]');
  }

  get src() {
    return this.getAttribute('src');
  }

  set src(value) {
    if (value === null || value === undefined) {
      this.removeAttribute('src');
    } else {
      this.setAttribute('src', String(value));
    }
  }

  connectedCallback() {
    this.#load();
  }

  disconnectedCallback() {
    this.#generation += 1;
    this.#cancel();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src' && oldValue !== newValue && this.isConnected) {
      this.#load();
    }
  }

  #cancel() {
    if (this.#controller) {
      this.#controller.abort();
      this.#controller = null;
    }
  }

  async #load() {
    const rawSrc = this.getAttribute('src');
    const generation = ++this.#generation;

    this.#cancel();

    let url = null;
    if (rawSrc !== null && rawSrc.trim() !== '') {
      try {
        url = new URL(rawSrc, document.baseURI);
      } catch {
        url = null;
      }
    }

    if (!url) {
      this.#renderError(null, 'Источник не задан');
      return;
    }

    this.#renderLoading(url);

    const controller = new AbortController();
    this.#controller = controller;

    try {
      const response = await fetch(url.href, {
        signal: controller.signal,
        headers: { Accept: 'text/html' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      if (!this.#isCurrent(generation, controller)) {
        return;
      }

      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const title = (parsed.title || '').trim();
      const firstHeading = parsed.querySelector('h1');
      const heading = firstHeading ? firstHeading.textContent.trim() : '';

      this.#renderReady(url, title, heading);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return;
      }
      if (!this.#isCurrent(generation, controller)) {
        return;
      }
      this.#renderError(url, 'Не удалось загрузить страницу');
    } finally {
      if (this.#controller === controller) {
        this.#controller = null;
      }
    }
  }

  #isCurrent(generation, controller) {
    return (
      generation === this.#generation &&
      this.isConnected &&
      this.#controller === controller
    );
  }

  #setStatus(status) {
    this.setAttribute('data-status', status);
  }

  #reset() {
    this.#link.removeAttribute('href');
    this.#titleEl.textContent = '';
    this.#headingEl.textContent = '';
    this.#urlEl.textContent = '';
    this.#urlEl.hidden = true;
  }

  #renderLoading(url) {
    this.#setStatus('loading');
    this.#reset();
    this.#link.setAttribute('href', url.href);
    this.#titleEl.textContent = 'Загрузка…';
    this.#showUrl(url);
  }

  #renderReady(url, title, heading) {
    this.#setStatus('ready');
    this.#link.setAttribute('href', url.href);
    this.#titleEl.textContent = title || 'Название отсутствует';
    this.#headingEl.textContent = heading || 'Заголовок отсутствует';
    if (title) {
      this.#urlEl.textContent = '';
      this.#urlEl.hidden = true;
    } else {
      this.#showUrl(url);
    }
  }

  #renderError(url, message) {
    this.#setStatus('error');
    this.#reset();
    if (url) {
      this.#link.setAttribute('href', url.href);
    }
    this.#titleEl.textContent = message;
    if (url) {
      this.#showUrl(url);
    }
  }

  #showUrl(url) {
    this.#urlEl.textContent = url.href;
    this.#urlEl.hidden = false;
  }
}

if (!customElements.get('page-preview')) {
  customElements.define('page-preview', PagePreview);
}

export default PagePreview;
