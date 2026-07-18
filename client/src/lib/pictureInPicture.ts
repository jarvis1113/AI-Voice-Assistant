export type DocumentPictureInPictureApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
};

type PictureInPictureSessionOptions = {
  width: number;
  height: number;
  onOpen: (pictureInPictureWindow: Window) => void;
  onClose: () => void;
};

export type PictureInPictureOpenResult = {
  pictureInPictureWindow: Window;
  opened: boolean;
};

type PictureInPictureWindow = Window & {
  documentPictureInPicture?: DocumentPictureInPictureApi;
};

export function getDocumentPictureInPictureApi(targetWindow: Window = window): DocumentPictureInPictureApi | null {
  const api = (targetWindow as PictureInPictureWindow).documentPictureInPicture;
  return api?.requestWindow ? api : null;
}

export function isDocumentPictureInPictureSupported(targetWindow: Window = window): boolean {
  return getDocumentPictureInPictureApi(targetWindow) !== null;
}

export function resolvePictureInPictureAssetUrl(assetUrl: string, baseUrl: string): string {
  return new URL(assetUrl, baseUrl).toString();
}

export class DocumentPictureInPictureSession {
  private pictureInPictureWindow: Window | null = null;

  constructor(
    private readonly api: DocumentPictureInPictureApi,
    private readonly options: PictureInPictureSessionOptions,
  ) {}

  get isOpen(): boolean {
    return Boolean(this.pictureInPictureWindow && !this.pictureInPictureWindow.closed);
  }

  async open(): Promise<PictureInPictureOpenResult> {
    if (this.pictureInPictureWindow && !this.pictureInPictureWindow.closed) {
      this.pictureInPictureWindow.focus();
      return { pictureInPictureWindow: this.pictureInPictureWindow, opened: false };
    }

    const pictureInPictureWindow = await this.api.requestWindow({
      width: this.options.width,
      height: this.options.height,
    });
    this.pictureInPictureWindow = pictureInPictureWindow;
    pictureInPictureWindow.addEventListener('pagehide', () => {
      if (this.pictureInPictureWindow !== pictureInPictureWindow) return;
      this.pictureInPictureWindow = null;
      this.options.onClose();
    }, { once: true });
    this.options.onOpen(pictureInPictureWindow);

    return { pictureInPictureWindow, opened: true };
  }

  close(): void {
    const pictureInPictureWindow = this.pictureInPictureWindow;
    if (!pictureInPictureWindow) return;

    this.pictureInPictureWindow = null;
    if (!pictureInPictureWindow.closed) pictureInPictureWindow.close();
    this.options.onClose();
  }
}

export function copyDocumentStyles(sourceDocument: Document, targetDocument: Document): void {
  const copiedHrefs = new Set<string>();

  for (const sourceLink of Array.from(sourceDocument.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'))) {
    const href = sourceLink.href || sourceLink.getAttribute('href');
    if (!href) continue;

    const absoluteHref = resolvePictureInPictureAssetUrl(href, sourceDocument.baseURI);
    if (copiedHrefs.has(absoluteHref)) continue;
    copiedHrefs.add(absoluteHref);

    const link = targetDocument.createElement('link');
    link.rel = 'stylesheet';
    link.href = absoluteHref;
    if (sourceLink.media) link.media = sourceLink.media;
    if (sourceLink.crossOrigin) link.crossOrigin = sourceLink.crossOrigin;
    targetDocument.head.appendChild(link);
  }

  for (const sourceStyle of Array.from(sourceDocument.querySelectorAll<HTMLStyleElement>('style'))) {
    const style = targetDocument.createElement('style');
    style.textContent = sourceStyle.textContent;
    if (sourceStyle.media) style.media = sourceStyle.media;
    targetDocument.head.appendChild(style);
  }

  for (const styleSheet of Array.from(sourceDocument.styleSheets)) {
    if (!styleSheet.href) continue;
    const absoluteHref = resolvePictureInPictureAssetUrl(styleSheet.href, sourceDocument.baseURI);
    if (copiedHrefs.has(absoluteHref)) continue;
    copiedHrefs.add(absoluteHref);

    const link = targetDocument.createElement('link');
    link.rel = 'stylesheet';
    link.href = absoluteHref;
    targetDocument.head.appendChild(link);
  }
}

export function waitForPictureInPictureFrame(targetWindow: Window): Promise<void> {
  return new Promise(resolve => {
    targetWindow.requestAnimationFrame(() => resolve());
  });
}

export function createPictureInPictureMountContainer(targetDocument: Pick<Document, 'createElement' | 'body'>): HTMLDivElement {
  const container = targetDocument.createElement('div');
  container.id = 'voice-picture-in-picture-root';
  container.setAttribute('data-picture-in-picture-state', 'mounting');
  container.style.cssText = 'display:block; min-height:100vh; color:#1f2937;';
  container.textContent = '正在載入語音工具…';
  targetDocument.body.replaceChildren(container);
  return container;
}

export function completePictureInPictureMount(container: HTMLElement, renderContent: () => void): void {
  renderContent();
  container.setAttribute('data-picture-in-picture-state', 'ready');
}
