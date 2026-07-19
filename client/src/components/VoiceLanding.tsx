import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type VoiceLandingProps = {
  isPictureInPictureOpen: boolean;
  onOpenPictureInPicture: () => void;
};

export function VoiceLanding({ isPictureInPictureOpen, onOpenPictureInPicture }: VoiceLandingProps) {
  return (
    <div className="glass-page flex min-h-screen items-center overflow-hidden px-4 py-8 md:px-8 md:py-12">
      <main className="relative z-10 mx-auto w-full max-w-lg">
        <div className="mb-9 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <span className="glass-subtle flex h-11 w-11 items-center justify-center rounded-2xl text-2xl leading-none" role="img" aria-label="麥克風">🎙️</span>
            <h1 className="text-3xl font-bold tracking-tight text-[#5498bb] md:text-4xl">廣東話語音輸入</h1>
          </div>
        </div>

        <Card className="glass-panel overflow-hidden rounded-[2rem] border-0 bg-[#eaf6fb] shadow-none">
          <CardContent className="rounded-[9px] px-6 py-8 md:px-8 md:py-10">
            <Button
              type="button"
              onClick={onOpenPictureInPicture}
              variant="outline"
              className="hero-glow-button group h-[4.75rem] w-full rounded-[1.35rem] px-5 text-[25px] font-bold leading-none sm:h-20"
              aria-label={isPictureInPictureOpen ? '切換至已開啟的懸浮視窗' : '開啟懸浮視窗'}
              data-state={isPictureInPictureOpen ? 'open' : 'ready'}
            >
              <span className="hero-glow-button__text">{isPictureInPictureOpen ? '懸浮視窗已開啟' : '開啟懸浮視窗'}</span>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
