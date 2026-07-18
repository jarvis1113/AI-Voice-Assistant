import React, { type PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, Mic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type VoicePictureInPictureProps = {
  isRecording: boolean;
  isProcessing: boolean;
  isCopied: boolean;
  status: string;
  error: string | null;
  originalText: string;
  correctedText: string;
  onMicPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerCancel: () => void;
  onCopy: () => void;
  onClose: () => void;
};

export function VoicePictureInPicture({
  isRecording,
  isProcessing,
  isCopied,
  status,
  error,
  originalText,
  correctedText,
  onMicPointerDown,
  onMicPointerUp,
  onMicPointerCancel,
  onCopy,
  onClose,
}: VoicePictureInPictureProps) {
  const previewText = correctedText || originalText;
  const previewLabel = correctedText ? '書面語文字' : '辨識文字';

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-blue-50 to-green-50 p-4 text-gray-800">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col rounded-3xl bg-white p-4 shadow-lg">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-pink-500" />
              <h1 className="text-base font-bold">廣東話語音輸入</h1>
            </div>
            <p className="mt-1 text-xs text-gray-500">錄音後自動轉換為書面語</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="關閉懸浮小視窗"
            className="shrink-0 rounded-full text-gray-500 hover:bg-pink-50 hover:text-pink-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {error && (
          <div className="mb-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs leading-5 text-red-800">{error}</p>
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
          <p className="mb-3 text-sm font-medium text-gray-600">{status}</p>
          <Button
            type="button"
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerCancel}
            onContextMenu={event => event.preventDefault()}
            disabled={isProcessing}
            aria-label={isRecording ? '放開以完成錄音' : '按住以開始錄音'}
            className={`h-24 w-24 rounded-full touch-none select-none transition-all duration-200 ${
              isRecording
                ? 'bg-pink-500 shadow-lg scale-105 hover:bg-pink-600'
                : 'bg-pink-400 hover:bg-pink-500 hover:scale-105 active:scale-95'
            }`}
          >
            {isProcessing ? <Loader2 className="h-9 w-9 animate-spin text-white" /> : <Mic className="h-9 w-9 text-white" />}
          </Button>
          <p className="mt-3 text-xs text-gray-500">按住說話，放開後開始處理</p>
        </div>

        {previewText && (
          <div className="mt-4 rounded-2xl bg-green-50 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-green-800">{previewLabel}</p>
              {correctedText && (
                <Button type="button" size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2 text-green-800 hover:bg-green-100">
                  {isCopied ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />已複製</> : <><Copy className="mr-1 h-3.5 w-3.5" />複製</>}
                </Button>
              )}
            </div>
            <p className="max-h-20 overflow-y-auto break-words text-left text-sm leading-6 text-gray-700">{previewText}</p>
          </div>
        )}
      </section>
    </main>
  );
}
