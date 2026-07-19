import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { VoicePictureInPicture } from '@/components/VoicePictureInPicture';
import { copyTextToWindowClipboard } from '@/lib/clipboard';
import {
  completePictureInPictureMount,
  copyDocumentStyles,
  createPictureInPictureMountContainer,
  DocumentPictureInPictureSession,
  getDocumentPictureInPictureApi,
  waitForPictureInPictureFrame,
} from '@/lib/pictureInPicture';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Mic, Copy, Volume2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('無法讀取錄音資料'));
    reader.readAsDataURL(blob);
  });
}

export default function VoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('按住麥克風開始說話');
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(20).fill(0));
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pointerHeldRef = useRef(false);
  const processingRef = useRef(false);
  const pictureInPictureSessionRef = useRef<DocumentPictureInPictureSession | null>(null);
  const pictureInPictureRootRef = useRef<Root | null>(null);
  const [isPictureInPictureOpen, setIsPictureInPictureOpen] = useState(false);

  const correctMutation = trpc.voice.correct.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();

  const releaseMicrophone = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  };

  const stopAudioVisualization = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAudioLevels(Array(20).fill(0));
  };

  const startAudioVisualization = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const animate = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      setAudioLevels(Array.from(dataArray.slice(0, 20), value => (value / 255) * 100));
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const initializeAudioContext = async (stream: MediaStream) => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextConstructor();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createMediaStreamSource(stream);
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
  };

  const processRecording = async (audioBlob: Blob, mimeType: string) => {
    try {
      if (audioBlob.size === 0) {
        throw new Error('沒有錄到聲音，請再試一次。');
      }
      if (audioBlob.size > MAX_AUDIO_BYTES) {
        throw new Error('錄音太長，請分段說話後再試。');
      }

      setStatus('正在上傳錄音…');
      const audioBase64 = await readBlobAsDataUrl(audioBlob);

      setStatus('正在轉錄廣東話…');
      const transcript = await transcribeMutation.mutateAsync({
        audioBase64,
        mimeType,
      });

      if (!transcript.text?.trim() || transcript.text === '請不吝點贊訂閱轉發打賞支持明鏡與點點欄目') {
        throw new Error('未能聽清楚內容，請按住按鈕說話至少一秒後再放開。');
      }

      setOriginalText(transcript.text);
      setStatus('正在修正並轉換為書面語…');
      const correction = await correctMutation.mutateAsync({ text: transcript.text });
      const finalText = (correction.corrected === '請唔好吝嗇你嘅讚好、訂閱、轉發同打賞，支持吓「明鏡與點點」呢個節目啦！' ? '' : correction.corrected) || transcript.text;
      setCorrectedText(finalText);

      try {
        await navigator.clipboard.writeText(finalText);
        setIsCopied(true);
        toast.success('書面語文字已複製');
      } catch {
        toast.message('書面語轉換完成，請按「複製」按鈕');
      }

      setStatus('書面語轉換完成');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '錄音處理未能完成，請再試一次。';
      console.error('[Voice Processing]', caughtError);
      setError(message);
      setStatus('未能完成轉錄');
      toast.error(message);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      releaseMicrophone();
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    pointerHeldRef.current = false;
    if (!recorder || recorder.state === 'inactive') return;

    stopAudioVisualization();
    setIsRecording(false);
    processingRef.current = true;
    setIsProcessing(true);
    setStatus('正在整理錄音…');
    recorder.stop();
  };

  const handleMicPointerDown = async (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isRecording || processingRef.current || isProcessing) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('這個瀏覽器不支援錄音功能，請使用最新版 Chrome。');
      setStatus('瀏覽器不支援錄音');
      return;
    }

    pointerHeldRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setError(null);
    setOriginalText('');
    setCorrectedText('');
    setIsCopied(false);
    setStatus('正在啟動麥克風…');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      await initializeAudioContext(stream);

      const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(candidate => MediaRecorder.isTypeSupported(candidate));
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = recordEvent => {
        if (recordEvent.data.size > 0) audioChunksRef.current.push(recordEvent.data);
      };
      recorder.onerror = () => {
        setError('錄音裝置暫時發生問題，請再試一次。');
        setStatus('錄音未能開始');
      };
      recorder.onstop = () => {
        const recordedMimeType = recorder.mimeType.split(';')[0] || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMimeType });
        mediaRecorderRef.current = null;
        void processRecording(audioBlob, recordedMimeType);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      startAudioVisualization();
      setIsRecording(true);
      setStatus('聆聽中…放開按鈕即可完成');

      // A user can release the pointer while Chrome is still asking for microphone access.
      if (!pointerHeldRef.current) stopRecording();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '無法存取麥克風';
      console.error('[Microphone]', caughtError);
      setError(`麥克風未能啟動：${message}`);
      setStatus('麥克風未能啟動');
      releaseMicrophone();
    }
  };

  const handleMicPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    stopRecording();
  };

  const handleCopy = async (targetWindow: Window | null = window) => {
    const textToCopy = correctedText || originalText;
    if (!textToCopy) return;
    const copyResult = await copyTextToWindowClipboard(targetWindow ?? window, textToCopy);
    if (copyResult !== 'failed') {
      setIsCopied(true);
      toast.success('已複製到剪貼簿');
      window.setTimeout(() => setIsCopied(false), 2000);
      return;
    }

    toast.error('複製失敗，請手動複製');
  };

  const cleanupPictureInPicture = useCallback(() => {
    const root = pictureInPictureRootRef.current;
    pictureInPictureRootRef.current = null;
    root?.unmount();
    pictureInPictureSessionRef.current = null;
    setIsPictureInPictureOpen(false);
  }, []);

  const closePictureInPicture = useCallback(() => {
    const session = pictureInPictureSessionRef.current;
    if (session) {
      session.close();
      return;
    }
    cleanupPictureInPicture();
  }, [cleanupPictureInPicture]);

  const renderPictureInPicture = (synchronously = false) => {
    const root = pictureInPictureRootRef.current;
    if (!root) return;

    const render = () => {
      root.render(
        <VoicePictureInPicture
          isRecording={isRecording}
          isProcessing={isProcessing}
          isCopied={isCopied}
          status={status}
          error={error}
          originalText={originalText}
          correctedText={correctedText}
          onMicPointerDown={handleMicPointerDown}
          onMicPointerUp={handleMicPointerUp}
          onMicPointerCancel={stopRecording}
          onCopy={handleCopy}
          onClose={closePictureInPicture}
        />,
      );
    };

    if (synchronously) {
      flushSync(render);
      return;
    }
    render();
  };

  const handlePictureInPicture = async () => {
    try {
      const pictureInPicture = getDocumentPictureInPictureApi();
      if (!pictureInPicture) {
        toast.error('目前瀏覽器未支援懸浮小視窗，請使用最新版 Chrome');
        return;
      }

      const session = pictureInPictureSessionRef.current ?? new DocumentPictureInPictureSession(pictureInPicture, {
        width: 420,
        height: 560,
        onOpen: () => undefined,
        onClose: cleanupPictureInPicture,
      });
      pictureInPictureSessionRef.current = session;

      const { pictureInPictureWindow, opened } = await session.open();
      if (!opened) return;

      copyDocumentStyles(document, pictureInPictureWindow.document);
      pictureInPictureWindow.document.title = '廣東話語音輸入';
      pictureInPictureWindow.document.documentElement.className = document.documentElement.className;
      pictureInPictureWindow.document.documentElement.style.colorScheme = document.documentElement.style.colorScheme;
      pictureInPictureWindow.document.body.className = '';
      pictureInPictureWindow.document.body.style.cssText = 'margin:0; min-height:100vh; background:#eaf7ff; color:#153c50;';

      const container = createPictureInPictureMountContainer(pictureInPictureWindow.document);

      await waitForPictureInPictureFrame(pictureInPictureWindow);

      const root = createRoot(container);
      pictureInPictureRootRef.current = root;

      setIsPictureInPictureOpen(true);
      completePictureInPictureMount(container, () => renderPictureInPicture(true));
      toast.success('已開啟懸浮小視窗');
    } catch (caughtError) {
      console.error('[Picture-in-Picture]', caughtError);
      closePictureInPicture();
      toast.error('未能開啟懸浮小視窗');
    }
  };

  useEffect(() => {
    renderPictureInPicture();
  }, [isRecording, isProcessing, isCopied, status, error, originalText, correctedText]);

  useEffect(() => () => {
    closePictureInPicture();
    stopAudioVisualization();
    releaseMicrophone();
    void audioContextRef.current?.close();
  }, [closePictureInPicture]);

  return (
    <div className="glass-page min-h-screen overflow-hidden px-4 py-8 md:px-8 md:py-12">
      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="mb-9 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <div className="glass-subtle flex h-11 w-11 items-center justify-center rounded-2xl">
              <Mic className="h-6 w-6 text-[#155e75]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[#153c50] md:text-4xl">廣東話語音輸入</h1>
          </div>
          <p className="text-[#557487]" style={{ fontSize: '21px' }}>錯字修正，並轉換為標準書面語</p>
        </div>

        <Card className="glass-panel overflow-hidden rounded-[2rem] border-0 shadow-none">
          <CardHeader className="border-b border-white/60 bg-white/20 px-6 py-6 md:px-8">
            <CardTitle className="text-xl text-[#153c50]">語音輸入工具</CardTitle>
            <CardDescription className="mt-1 text-[#557487]">按住麥克風按鈕說話，放開後會自動轉錄為書面語。</CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-8 md:px-8 md:pb-8">
            {error && (
              <div className="mb-6 flex gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/65 p-4 shadow-sm backdrop-blur-md" role="alert">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="font-medium text-rose-950">出現問題</p>
                  <p className="text-sm text-rose-800">{error}</p>
                </div>
              </div>
            )}

            <div className="glass-subtle mb-8 rounded-2xl px-4 py-4 text-center" aria-live="polite">
              <p className="mb-1 text-[#557487]" style={{ fontSize: '21px' }}>狀態</p>
              <p className="font-semibold text-[#153c50]" style={{ fontSize: '24px' }}>{status}</p>
            </div>

            <div className="flex justify-center mb-8">     
              <Button
                type="button"
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={stopRecording}
                onContextMenu={event => event.preventDefault()}
                disabled={isProcessing}
                aria-label={isRecording ? '放開以完成錄音' : '按住以開始錄音'}
                className={`glass-mic-button flex h-32 w-32 touch-none select-none items-center justify-center rounded-full transition-all duration-200 ${
                  isRecording
                    ? 'scale-105 ring-8 ring-sky-300/30'
                    : 'hover:scale-105 active:scale-95'
                }`}
              >
                {isProcessing ? <Loader2 className="h-12 w-12 animate-spin text-[#0f3f55]" /> : <Mic className="h-12 w-12 text-[#0f3f55]" />}
              </Button>
            </div>

            {isRecording && (
              <div className="glass-subtle mb-8 flex h-16 items-center justify-center gap-1 rounded-2xl" aria-label="正在收音">
                {audioLevels.map((level, index) => (
                  <div
                    key={index}
                    className="rounded-full bg-gradient-to-t from-cyan-700 via-sky-500 to-sky-200 transition-all duration-75"
                    style={{ width: '6px', height: `${Math.max(8, level * 0.6)}px` }}
                  />
                ))}
              </div>
            )}

            {originalText && (
              <div className="mb-6">
                <label className="mb-2 block font-medium text-[#24536b]" style={{ fontSize: '20px' }}>辨識文字</label>
                <Textarea value={originalText} readOnly className="glass-field min-h-24 rounded-2xl" rows={3} />
              </div>
            )}

            {correctedText && (
              <div className="mb-6">
                <label className="mb-2 block font-medium text-[#24536b]" style={{ fontSize: '20px' }}>轉換文字</label>
                <div className="relative">
                  <Textarea value={correctedText} readOnly className="glass-field min-h-28 rounded-2xl pr-24" rows={3} />
                  <Button onClick={() => void handleCopy(window)} size="sm" variant="outline" className="glass-action absolute bottom-3 right-3 h-8 rounded-xl px-3">
                    {isCopied ? <><CheckCircle2 className="mr-1 h-4 w-4 text-cyan-700" />已複製</> : <><Copy className="mr-1 h-4 w-4" />複製</>}
                  </Button>
                </div>
              </div>
            )}

            <Button onClick={handlePictureInPicture} variant="outline" className="glass-wide-action h-12 w-full rounded-2xl">
              <Volume2 className="mr-2 h-4 w-4" />
              {isPictureInPictureOpen ? '懸浮小視窗已開啟' : '開啟懸浮小視窗'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
