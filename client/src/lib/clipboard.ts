export type ClipboardCopyResult = 'clipboard' | 'fallback' | 'failed';

export async function copyTextToWindowClipboard(targetWindow: Window, text: string): Promise<ClipboardCopyResult> {
  if (!text) return 'failed';

  const clipboard = targetWindow.navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // Document Picture-in-Picture can reject the async Clipboard API even after a user click.
    }
  }

  try {
    const textArea = targetWindow.document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.cssText = 'position:fixed; left:-9999px; top:-9999px; opacity:0;';
    targetWindow.document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);
    const copied = targetWindow.document.execCommand('copy');
    textArea.remove();
    return copied ? 'fallback' : 'failed';
  } catch {
    return 'failed';
  }
}
