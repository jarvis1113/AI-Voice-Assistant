import { describe, expect, it, vi } from 'vitest';
import { copyTextToWindowClipboard } from '../client/src/lib/clipboard';

function createFallbackWindow({ fallbackResult = true, clipboardWrite }: { fallbackResult?: boolean; clipboardWrite?: ReturnType<typeof vi.fn> } = {}) {
  const textArea = {
    value: '',
    style: { cssText: '' },
    setAttribute: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    remove: vi.fn(),
  };
  const appendChild = vi.fn();
  const execCommand = vi.fn(() => fallbackResult);

  return {
    targetWindow: {
      navigator: { clipboard: clipboardWrite ? { writeText: clipboardWrite } : undefined },
      document: {
        createElement: vi.fn(() => textArea),
        body: { appendChild },
        execCommand,
      },
    } as unknown as Window,
    textArea,
    appendChild,
    execCommand,
  };
}

describe('picture-in-picture clipboard copying', () => {
  it('uses the clipboard belonging to the picture-in-picture window when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { targetWindow, execCommand } = createFallbackWindow({ clipboardWrite: writeText });

    await expect(copyTextToWindowClipboard(targetWindow, '我今天去了學校。')).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('我今天去了學校。');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to a temporary textarea in the picture-in-picture document when async clipboard access is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const { targetWindow, textArea, appendChild, execCommand } = createFallbackWindow({ clipboardWrite: writeText });

    await expect(copyTextToWindowClipboard(targetWindow, '測試文字')).resolves.toBe('fallback');
    expect(textArea.value).toBe('測試文字');
    expect(appendChild).toHaveBeenCalledWith(textArea);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(textArea.remove).toHaveBeenCalledTimes(1);
  });

  it('reports a failed result when neither copy route is available', async () => {
    const { targetWindow } = createFallbackWindow({ fallbackResult: false });

    await expect(copyTextToWindowClipboard(targetWindow, '測試文字')).resolves.toBe('failed');
  });
});
