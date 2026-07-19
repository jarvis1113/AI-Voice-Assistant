import React, { type PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, Mic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type VoicePictureInPictureProps = {
  isRecording: boolean;
  isProcessing: boolean;
  isCopied: boolean;
  status: string;
  audioLevels: number[];
  error: string | null;
  originalText: string;
  correctedText: string;
  onMicPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerCancel: () => void;
  onCopy: (targetWindow: Window | null) => void;
  onClose: () => void;
};

export function VoicePictureInPicture({
  isRecording,
  isProcessing,
  isCopied,
  status,
  audioLevels,
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
  const previewLabel = correctedText ? '轉換文字' : '辨識文字';

  return (
    <main className="glass-page min-h-screen p-4 text-[#153c50]">
      <section className="glass-panel mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col rounded-3xl p-4">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="glass-subtle flex h-8 w-8 items-center justify-center rounded-xl">
                <Mic className="h-4 w-4 text-[#155e75]" />
              </div>
              <h1 className="text-base font-bold text-[#153c50]">廣東話語音輸入</h1>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="關閉懸浮小視窗"
            className="glass-icon-button shrink-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {error && (
          <div className="mb-3 flex gap-2 rounded-xl border border-rose-200/80 bg-rose-50/65 p-3 text-left shadow-sm backdrop-blur-md" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-[15.6px] leading-6 text-rose-800">{error}</p>
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
          <p className="glass-subtle mb-4 rounded-xl px-3 py-2 text-sm font-medium text-[#24536b]">{status}</p>
          <Button
            type="button"
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerCancel}
            onContextMenu={event => event.preventDefault()}
            disabled={isProcessing}
            aria-label={isRecording ? '放開以完成錄音' : '按住以開始錄音'}
            className={`glass-mic-button h-40 w-40 touch-none select-none rounded-full transition-all duration-200 ${
              isRecording
                ? 'scale-105 ring-8 ring-sky-300/30'
                : 'hover:scale-105 active:scale-95'
            }`}
          >
            {isProcessing ? <Loader2 className="size-[108px] animate-spin text-[#0f3f55]" /> : <Mic className="size-[108px] text-[#0f3f55]" />}
          </Button>
          {isRecording && (
            <div className="glass-subtle mt-4 flex h-11 w-full items-center justify-center gap-1 rounded-xl px-3" aria-label="正在收音">
              {audioLevels.map((level, index) => (
                <div
                  key={index}
                  className="rounded-full bg-gradient-to-t from-cyan-700 via-sky-500 to-sky-200 transition-all duration-75"
                  style={{ width: '5px', height: `${Math.max(6, level * 0.34)}px` }}
                />
              ))}
            </div>
          )}
        </div>

        {previewText && (
          <div className="glass-subtle mt-4 rounded-2xl p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[#155e75]">{previewLabel}</p>
              {correctedText && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={event => onCopy(event.currentTarget.ownerDocument.defaultView)}
                  className="glass-action h-7 rounded-lg px-2 text-xs"
                >
                  {isCopied ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />已複製</> : <><Copy className="mr-1 h-3.5 w-3.5" />複製</>}
                </Button>
              )}
            </div>
            <p className="max-h-20 overflow-y-auto break-words text-left text-sm leading-6 text-[#24536b]">{previewText}</p>
          </div>
        )}
      </section>
    </main>
  );
}
