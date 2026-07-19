import React from 'react';
import { Volume2 } from 'lucide-react';
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
            <div className="glass-subtle flex h-11 w-11 items-center justify-center rounded-2xl" aria-hidden="true">
              <Volume2 className="h-6 w-6 text-[#155e75]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[#5498bb] md:text-4xl">廣東話語音輸入</h1>
          </div>
        </div>

        <Card className="glass-panel overflow-hidden rounded-[2rem] border-0 bg-[#eaf6fb] shadow-none">
          <CardContent className="rounded-[9px] px-6 py-8 md:px-8 md:py-10">
            <Button
              type="button"
              onClick={onOpenPictureInPicture}
              variant="outline"
              className="glass-wide-action h-16 w-full rounded-2xl px-0 text-[25px] font-semibold leading-none"
              aria-label={isPictureInPictureOpen ? '切換至已開啟的懸浮視窗' : '開啟懸浮視窗'}
            >
              <Volume2 className="mr-3 h-6 w-6" />
              {isPictureInPictureOpen ? '懸浮視窗已開啟' : '開啟懸浮視窗'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
