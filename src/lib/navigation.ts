/**
 * Soft Navigation Utility for VoiceDots Widget
 * Handles client-side navigation to prevent full page reloads on MPAs (like Astro).
 */

export class SoftNavigation {
  private static instance: SoftNavigation;
  private isProcessing = false;

  private constructor() {
    this.handlePopState = this.handlePopState.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  static getInstance() {
    if (!SoftNavigation.instance) {
      SoftNavigation.instance = new SoftNavigation();
    }
    return SoftNavigation.instance;
  }

  init() {
    document.addEventListener('click', this.handleClick);
    window.addEventListener('popstate', this.handlePopState);
    console.log("VoiceDots: Soft Navigation Initialized");
  }

  destroy() {
    document.removeEventListener('click', this.handleClick);
    window.removeEventListener('popstate', this.handlePopState);
  }

  private handleClick(e: MouseEvent) {
    const link = (e.target as HTMLElement).closest('a');
    
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const href = link.getAttribute('href');
    if (!href) return;

    // Check if it's an internal link
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;

    // Ignore hash links
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash !== window.location.hash) {
      return;
    }

    // Ignore binary/download links
    if (link.hasAttribute('download')) return;

    e.preventDefault();
    this.navigate(url.href);
  }

  private handlePopState() {
    this.navigate(window.location.href, false);
  }

  async navigate(url: string, push = true) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Update Title
      document.title = doc.title;

      // Swap Content
      // Strategy: Try to find <main>, if not found, find a specific container, or handle body content
      const newMain = doc.querySelector('main');
      const currentMain = document.querySelector('main');

      if (newMain && currentMain) {
        currentMain.innerHTML = newMain.innerHTML;
        // Also copy attributes
        Array.from(newMain.attributes).forEach(attr => {
          currentMain.setAttribute(attr.name, attr.value);
        });
      } else {
        // Fallback: Swap everything in body except the widget itself
        this.swapBodyContent(doc.body);
      }

      // Re-run scripts in the new content
      this.executeScripts(newMain || doc.body);

      if (push) {
        history.pushState(null, '', url);
      }

      // Scroll to top or hash
      if (window.location.hash) {
        const el = document.getElementById(window.location.hash.substring(1));
        if (el) el.scrollIntoView();
      } else {
        window.scrollTo(0, 0);
      }

    } catch (err) {
      console.error("VoiceDots: Soft Navigation Failed", err);
      // Fallback to normal navigation if something goes wrong
      if (push) window.location.href = url;
    } finally {
      this.isProcessing = false;
    }
  }

  private swapBodyContent(newBody: HTMLElement) {
    // We want to keep <voicedots-ai>
    const widget = document.querySelector('voicedots-ai');
    
    // Save widget if it exists
    let widgetParent: Node | null = null;
    let widgetSibling: Node | null = null;
    if (widget) {
        widgetParent = widget.parentNode;
        widgetSibling = widget.nextSibling;
        widget.remove();
    }

    // Replace body content (excluding the widget which we just removed)
    // To do this safely, we can clear everything and then restore the widget
    // But it's better to only replace elements that are NOT the widget.
    
    // For simplicity in this implementation, we assume <main> is the best target.
    // If not found, we replace body and append widget back.
    document.body.innerHTML = newBody.innerHTML;
    
    if (widget) {
        if (widgetSibling && widgetParent) {
            widgetParent.insertBefore(widget, widgetSibling);
        } else {
            document.body.appendChild(widget);
        }
    }
  }

  private executeScripts(container: HTMLElement) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }
}
