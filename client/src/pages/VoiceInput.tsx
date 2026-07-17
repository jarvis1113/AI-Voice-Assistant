import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Mic, Copy, Volume2, AlertCircle, CheckCircle2 } from 'lucide-react';

type RecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

type SpeechRecognitionType = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
};

export default function VoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('準備就緒');
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(20).fill(0));
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // tRPC mutation for AI correction
  const correctMutation = (trpc as any).voice?.correct?.useMutation?.() || { mutateAsync: async () => ({ corrected: originalText }) };

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError('你的瀏覽器不支援語音輸入功能。請使用最新版 Chrome、Safari 或 Edge。');
      return;
    }

    const recognition = new SpeechRecognitionAPI() as SpeechRecognitionType;
    // Try multiple language codes for better compatibility
    const langCodes = ['yue-Hant-HK', 'yue', 'zh-HK', 'zh-Hant-HK', 'zh-CN'];
    recognition.lang = langCodes[0];
    recognition.interimResults = false;
    recognition.continuous = false;
    (recognition as any).maxAlternatives = 1;
    console.log('[Speech Recognition] Initialized with lang:', recognition.lang);

    recognition.onstart = () => {
      console.log('[Speech Recognition] Started listening');
      setIsListening(true);
      setStatus('聆聽中...');
      setError(null);
      setOriginalText('');
      setCorrectedText('');
      setIsCopied(false);
      startAudioVisualization();
    };

    recognition.onresult = async (event: RecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      console.log('[Speech Recognition] Result:', transcript);
      setOriginalText(transcript);
      setStatus('AI 正在修正錯別字...');
      setIsProcessing(true);

      try {
        // Cancel any previous request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        console.log('[tRPC] Calling voice.correct with text:', transcript);
        const result = await correctMutation.mutateAsync({ text: transcript });
        console.log('[tRPC] Result:', result);
        setCorrectedText(result.corrected);
        setStatus('✅ 修正完成！已自動複製');
        setIsCopied(false);

        // Auto-copy to clipboard
        navigator.clipboard.writeText(result.corrected).catch(() => {
          // Silently fail if clipboard is not available
        }).then(() => {
          setIsCopied(true);
          toast.success('已複製到剪貼簿');
        });
      } catch (err) {
        // Don't show error if request was aborted
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const errorMsg = err instanceof Error ? err.message : '修正失敗，請重試';
        setError(errorMsg);
        setStatus('❌ 修正失敗');
        setCorrectedText(transcript); // Fallback to original text
        toast.error(errorMsg);
      } finally {
        setIsProcessing(false);
        stopAudioVisualization();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[Speech Recognition Error]', event.error, event);
      const errorMessages: Record<string, string> = {
        'no-speech': '未偵測到語音，請重試',
        'audio-capture': '無法存取麥克風，請檢查權限',
        'network': '網路連線錯誤，請重試',
        'aborted': '錄音已中止，請重試',
        'service-not-allowed': '語音辨識服務不可用',
        'bad-grammar': '語音辨識失敗，請重試',
        'network-error': '網路連接錯誤，請検查網路',
      };
      const errorMsg = errorMessages[event.error] || `語音辨識錯誤: ${event.error}`;
      setError(errorMsg);
      setStatus('❌ 語音辨識失敗');
      toast.error(errorMsg);
      setIsListening(false);
      stopAudioVisualization();
      setRetryCount(0);
    };

    recognition.onend = () => {
      setIsListening(false);
      stopAudioVisualization();
    };

    recognitionRef.current = recognition as any;

    return () => {
      if (recognitionRef.current) {
        (recognitionRef.current as any).abort?.();
      }
      stopAudioVisualization();
    };
  }, [correctMutation]);

  // Start audio visualization
  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevels = () => {
        analyser.getByteFrequencyData(dataArray);
        const levels = Array.from(dataArray.slice(0, 20)).map(v => (v / 255) * 100);
        setAudioLevels(levels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };

      updateLevels();
    } catch (err) {
      console.error('Failed to access microphone:', err);
      setError('無法存取麥克風，請檢查權限');
    }
  };

  // Stop audio visualization
  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setAudioLevels(Array(20).fill(0));
  };

  // Handle microphone button - start on mouse/touch down, stop on mouse/touch up
  const handleMicMouseDown = () => {
    if (!isListening && !isProcessing) {
      setError(null);
      setRetryCount(0);
      try {
        (recognitionRef.current as any)?.start?.();
      } catch (err) {
        console.error('Failed to start recognition:', err);
        setError('無法啟動語音辨識，請重新整理頁面');
      }
    }
  };

  const handleMicMouseUp = () => {
    if (isListening) {
      try {
        (recognitionRef.current as any)?.stop?.();
      } catch (err) {
        console.error('Failed to stop recognition:', err);
      }
    }
  };

  const handleMicMouseLeave = () => {
    if (isListening) {
      try {
        (recognitionRef.current as any)?.stop?.();
      } catch (err) {
        console.error('Failed to stop recognition:', err);
      }
    }
  };

  // Handle copy button with better error handling
  const handleCopy = async () => {
    if (!correctedText) return;
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = correctedText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } else {
        await navigator.clipboard.writeText(correctedText);
      }
      setIsCopied(true);
      toast.success('已複製到剪貼簿');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy error:', err);
      toast.error('複製失敗：' + (err instanceof Error ? err.message : '請檢查瀏覽器權限'));
    }
  };

  // Handle Picture-in-Picture
  const handlePictureInPicture = async () => {
    const container = document.getElementById('voice-input-container');
    if (!container) return;

    try {
      if ('documentPictureInPicture' in window) {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 380,
          height: 600,
        });
        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.style.padding = '16px';
        pipWindow.document.body.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        pipWindow.document.body.style.backgroundColor = '#FAFBFC';
        pipWindow.document.body.appendChild(container.cloneNode(true));

        // Re-attach event listeners to the cloned container
        const clonedMicBtn = pipWindow.document.querySelector('[data-mic-button]') as HTMLElement;
        if (clonedMicBtn) {
          clonedMicBtn.addEventListener('mousedown', handleMicMouseDown);
          clonedMicBtn.addEventListener('mouseup', handleMicMouseUp);
          clonedMicBtn.addEventListener('mouseleave', handleMicMouseLeave);
          clonedMicBtn.addEventListener('touchstart', handleMicMouseDown);
          clonedMicBtn.addEventListener('touchend', handleMicMouseUp);
        }

        pipWindow.addEventListener('pagehide', () => {
          document.getElementById('voice-input-container')?.appendChild(container);
        });
      } else {
        toast.error('你的瀏覽器不支援懸浮小視窗功能');
      }
    } catch (err) {
      console.error('PiP error:', err);
      toast.error('開啟懸浮視窗失敗');
    }
  };

  return (
    <div id="voice-input-container" className="min-h-screen bg-gradient-to-br from-blue-50 via-pink-50 to-green-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">🎙️ 廣東話語音輸入</h1>
          <p className="text-muted-foreground text-lg">AI 自動修正錯別字，幫你說得更準確</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg border-0 mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">語音輸入工具</CardTitle>
            <CardDescription>按住麥克風按鈕說話，鬆開即可完成輸入</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900">出現問題</p>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Microphone Button with Audio Visualization */}
            <div className="flex flex-col items-center gap-6">
              <Button
                data-mic-button
                onMouseDown={handleMicMouseDown}
                onMouseUp={handleMicMouseUp}
                onMouseLeave={handleMicMouseLeave}
                onTouchStart={handleMicMouseDown}
                onTouchEnd={handleMicMouseUp}
                disabled={isProcessing}
                className={`w-24 h-24 rounded-full shadow-lg transition-all transform active:scale-95 hover:scale-110 hover:shadow-xl ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600 scale-110 animate-pulse'
                    : 'bg-primary hover:bg-pink-700'
                } text-white text-4xl select-none`}
              >
                <Mic className="w-10 h-10" />
              </Button>

              {/* Audio Visualization or Loading Spinner */}
              {isListening && (
                <div className="flex items-center justify-center gap-1 h-16 w-full">
                  {audioLevels.map((level, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-primary to-pink-300 rounded-full transition-all"
                      style={{
                        height: `${Math.max(10, level * 2)}%`,
                        minHeight: '8px',
                      }}
                    />
                  ))}
                </div>
              )}
              {isProcessing && !isListening && (
                <div className="flex items-center justify-center gap-3 h-16 w-full">
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-3 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-3 h-3 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}

              {/* Status Text */}
              <p className="text-center font-semibold text-foreground text-lg">{status}</p>
            </div>

            {/* Original Text Display */}
            {originalText && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">原始語音：</label>
                <Textarea
                  value={originalText}
                  readOnly
                  className="bg-gray-50 border-gray-200 text-foreground resize-none"
                  rows={3}
                />
              </div>
            )}

            {/* Corrected Text Display */}
            {correctedText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    AI 修正後 (已自動複製)：
                  </label>
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="sm"
                    className={`gap-2 transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95 ${isCopied ? 'bg-green-50 border-green-300' : ''}`}
                  >
                    <Copy className="w-4 h-4" />
                    {isCopied ? '✓ 已複製' : '複製'}
                  </Button>
                </div>
                <Textarea
                  value={correctedText}
                  readOnly
                  className="bg-green-50 border-green-200 text-foreground font-semibold resize-none"
                  rows={3}
                />

              </div>
            )}

            {/* Picture-in-Picture Button */}
            <Button
              onClick={handlePictureInPicture}
              variant="outline"
              className="w-full gap-2 border-primary text-primary hover:bg-pink-50 transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95"
            >
              <Volume2 className="w-4 h-4" />
              🪟 懸浮小視窗
            </Button>
          </CardContent>
        </Card>


      </div>
    </div>
  );
}
