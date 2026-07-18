import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoicePictureInPicture } from '../client/src/components/VoicePictureInPicture';
import {
  completePictureInPictureMount,
  createPictureInPictureMountContainer,
  DocumentPictureInPictureSession,
  getDocumentPictureInPictureApi,
  isDocumentPictureInPictureSupported,
  resolvePictureInPictureAssetUrl,
  waitForPictureInPictureFrame,
  type DocumentPictureInPictureApi,
} from '../client/src/lib/pictureInPicture';

function createPictureInPictureWindow() {
  const listeners = new Map<string, EventListener[]>();
  const pictureInPictureWindow = {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(() => {
      pictureInPictureWindow.closed = true;
      for (const listener of listeners.get('pagehide') ?? []) listener(new Event('pagehide'));
    }),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    dispatchPageHide: () => {
      pictureInPictureWindow.closed = true;
      for (const listener of listeners.get('pagehide') ?? []) listener(new Event('pagehide'));
    },
  };

  return pictureInPictureWindow;
}

describe('Document Picture-in-Picture support detection', () => {
  it('returns false when the browser does not expose the API', () => {
    expect(isDocumentPictureInPictureSupported({} as Window)).toBe(false);
    expect(getDocumentPictureInPictureApi({} as Window)).toBeNull();
  });

  it('recognises a usable requestWindow API', () => {
    const api: DocumentPictureInPictureApi = {
      requestWindow: async () => ({}) as Window,
    };
    const testWindow = { documentPictureInPicture: api } as unknown as Window;

    expect(isDocumentPictureInPictureSupported(testWindow)).toBe(true);
    expect(getDocumentPictureInPictureApi(testWindow)).toBe(api);
  });

  it('resolves production stylesheet paths to absolute URLs for the floating document', () => {
    expect(resolvePictureInPictureAssetUrl('/assets/index-a1b2c3.css', 'https://cantoneseai-nr6mxwou.manus.space/'))
      .toBe('https://cantoneseai-nr6mxwou.manus.space/assets/index-a1b2c3.css');
    expect(resolvePictureInPictureAssetUrl('assets/index-a1b2c3.css', 'https://cantoneseai-nr6mxwou.manus.space/app/'))
      .toBe('https://cantoneseai-nr6mxwou.manus.space/app/assets/index-a1b2c3.css');
  });
});

describe('Document Picture-in-Picture mount lifecycle', () => {
  it('creates a visible loading container and marks it ready only after synchronously rendering content', () => {
    const attributes = new Map<string, string>();
    const container = {
      id: '',
      textContent: '',
      style: { cssText: '' },
      setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)),
    } as unknown as HTMLDivElement;
    const replaceChildren = vi.fn();
    const targetDocument = {
      createElement: vi.fn(() => container),
      body: { replaceChildren },
    } as unknown as Pick<Document, 'createElement' | 'body'>;

    const mountedContainer = createPictureInPictureMountContainer(targetDocument);
    expect(mountedContainer).toBe(container);
    expect(container.id).toBe('voice-picture-in-picture-root');
    expect(container.textContent).toBe('正在載入語音工具…');
    expect(attributes.get('data-picture-in-picture-state')).toBe('mounting');
    expect(replaceChildren).toHaveBeenCalledWith(container);

    completePictureInPictureMount(container, () => {
      container.textContent = '廣東話語音輸入';
    });

    expect(container.textContent).toBe('廣東話語音輸入');
    expect(attributes.get('data-picture-in-picture-state')).toBe('ready');
  });

  it('waits for one picture-in-picture animation frame before mounting React content', async () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });

    await waitForPictureInPictureFrame({ requestAnimationFrame } as unknown as Window);

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});

describe('Document Picture-in-Picture session', () => {
  it('opens a window once and refocuses the existing window on a repeated request', async () => {
    const pictureInPictureWindow = createPictureInPictureWindow();
    const api: DocumentPictureInPictureApi = {
      requestWindow: vi.fn(async () => pictureInPictureWindow as unknown as Window),
    };
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const session = new DocumentPictureInPictureSession(api, {
      width: 420,
      height: 560,
      onOpen,
      onClose,
    });

    const firstOpen = await session.open();
    const secondOpen = await session.open();

    expect(firstOpen.opened).toBe(true);
    expect(secondOpen.opened).toBe(false);
    expect(api.requestWindow).toHaveBeenCalledTimes(1);
    expect(api.requestWindow).toHaveBeenCalledWith({ width: 420, height: 560 });
    expect(onOpen).toHaveBeenCalledWith(pictureInPictureWindow);
    expect(pictureInPictureWindow.focus).toHaveBeenCalledTimes(1);
    expect(session.isOpen).toBe(true);
  });

  it('cleans up when the user closes the window or the interface requests a close', async () => {
    const pictureInPictureWindow = createPictureInPictureWindow();
    const api: DocumentPictureInPictureApi = {
      requestWindow: vi.fn(async () => pictureInPictureWindow as unknown as Window),
    };
    const onClose = vi.fn();
    const session = new DocumentPictureInPictureSession(api, {
      width: 420,
      height: 560,
      onOpen: vi.fn(),
      onClose,
    });

    await session.open();
    session.close();

    expect(pictureInPictureWindow.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(session.isOpen).toBe(false);

    const secondWindow = createPictureInPictureWindow();
    api.requestWindow = vi.fn(async () => secondWindow as unknown as Window);
    await session.open();
    secondWindow.dispatchPageHide();

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(session.isOpen).toBe(false);
  });
});

describe('Picture-in-Picture panel state', () => {
  const handlers = {
    onMicPointerDown: vi.fn(),
    onMicPointerUp: vi.fn(),
    onMicPointerCancel: vi.fn(),
    onCopy: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders the synchronised written-Chinese result and copied state', () => {
    const markup = renderToStaticMarkup(
      createElement(VoicePictureInPicture, {
        ...handlers,
        isRecording: false,
        isProcessing: false,
        isCopied: true,
        status: '書面語轉換完成',
        error: null,
        originalText: '我今日去咗學校',
        correctedText: '我今天去了學校。',
      }),
    );

    expect(markup).toContain('書面語轉換完成');
    expect(markup).toContain('書面語文字');
    expect(markup).toContain('我今天去了學校。');
    expect(markup).toContain('已複製');
  });

  it('renders the current error state in the floating window', () => {
    const markup = renderToStaticMarkup(
      createElement(VoicePictureInPicture, {
        ...handlers,
        isRecording: false,
        isProcessing: false,
        isCopied: false,
        status: '未能完成轉錄',
        error: '未能轉錄這段錄音，請清楚說話後再試。',
        originalText: '',
        correctedText: '',
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('未能轉錄這段錄音，請清楚說話後再試。');
  });
});
