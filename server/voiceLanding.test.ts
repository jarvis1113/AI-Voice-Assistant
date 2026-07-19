import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VoiceLanding } from '../client/src/components/VoiceLanding';

describe('Voice landing page', () => {
  it('uses the floating window as the only primary operation', () => {
    const markup = renderToStaticMarkup(
      createElement(VoiceLanding, {
        isPictureInPictureOpen: false,
        onOpenPictureInPicture: vi.fn(),
      }),
    );

    expect(markup).toContain('廣東話語音輸入');
    expect(markup).toContain('開啟懸浮視窗');
    expect(markup).toContain('text-[25px]');
    expect(markup).toContain('hero-glow-button');
    expect(markup).toContain('🎙️');
    expect(markup).not.toContain('hero-glow-button__icon');
    expect(markup).toContain('data-state="ready"');
    expect(markup).not.toContain('hero-glow-button__arrow');
    expect(markup).not.toContain('↗');
    expect(markup).not.toContain('所有語音操作會在懸浮視窗中完成。');
    expect(markup).not.toContain('按住麥克風開始說話');
    expect(markup).not.toContain('辨識文字');
    expect(markup).not.toContain('轉換文字');
  });

  it('communicates when the existing floating window can be brought forward', () => {
    const markup = renderToStaticMarkup(
      createElement(VoiceLanding, {
        isPictureInPictureOpen: true,
        onOpenPictureInPicture: vi.fn(),
      }),
    );

    expect(markup).toContain('懸浮視窗已開啟');
    expect(markup).toContain('切換至已開啟的懸浮視窗');
    expect(markup).toContain('data-state="open"');
  });
});
