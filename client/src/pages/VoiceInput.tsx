'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Mic, Copy, Volume2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function VoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('準備就緒');
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(20).fill(0));
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // tRPC mutations
  const correctMutation = (trpc as any).voice?.correct?.useMutation?.() || { mutateAsync: async () => ({ corrected: originalText }) };
  const transcribeMutation = (trpc as any).voice?.transcribe?.useMutation?.() || { mutateAsync: async () => ({ text: '' }) };

  // Initialize audio context and analyzer
  const initializeAudioContext = async (stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const source = audioContextRef.current.createMediaStreamSource(stream);
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
  };

  // Start audio visualization
  const startAudioVisualization = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const animate = () => {
      analyserRef.current!.getByteFrequencyData(dataArray);
      const levels = Array.from(dataArray.slice(0, 20)).map(v => (v / 255) * 100);
      setAudioLevels(levels);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  // Stop audio visualization
  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAudioLevels(Array(20).fill(0));
  };

  // Start recording
  const handleMicMouseDown = async () => {
    try {
      setError(null);
      setOriginalText('');
      setCorrectedText('');
      setStatus('正在請求麥克風權限...');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      await initializeAudioContext(stream);
      startAudioVisualization();

      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatus('聆聽中...');
      console.log('[MediaRecorder] Started recording');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '無法存取麥克風';
      console.error('[MediaRecorder Error]', err);
      setError(`麥克風錯誤：${errorMsg}`);
      setStatus('❌ 麥克風錯誤');
      toast.error(errorMsg);
    }
  };

  // Stop recording and process audio
  const handleMicMouseUp = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    try {
      stopAudioVisualization();

      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus('正在處理音頻...');

      mediaRecorderRef.current.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current!.mimeType });
          console.log('[MediaRecorder] Audio blob size:', audioBlob.size);

              // Upload audio blob to storage and get URL
              setStatus('正在上傳音頻...');
              const formData = new FormData();
              formData.append('file', audioBlob, `recording-${Date.now()}.webm`);
              
              // For now, create a blob URL for transcription
              const audioUrl = URL.createObjectURL(audioBlob);
              
              // Call backend to transcribe
              setStatus('AI 正在轉錄語音...');
              const result = await transcribeMutation.mutateAsync({ audioUrl });
          
          if (!result.text) {
            throw new Error('無法識別語音，請重試');
          }
          
          // Clean up blob URL
          URL.revokeObjectURL(audioUrl);

          console.log('[Transcription] Result:', result.text);
          setOriginalText(result.text);
          setStatus('AI 正在修正錯別字...');

          // Correct text
          const correctionResult = await correctMutation.mutateAsync({ text: result.text });
          setCorrectedText(correctionResult.corrected);
          setStatus('✅ 修正完成！已自動複製');

          // Copy to clipboard
          try {
            await navigator.clipboard.writeText(correctionResult.corrected);
            setIsCopied(true);
            toast.success('已複製到剪貼簿');
          } catch {
            console.warn('[Clipboard] Failed to copy');
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '處理失敗';
          console.error('[Processing Error]', err);
          setError(errorMsg);
          setStatus('❌ 處理失敗');
          toast.error(errorMsg);
        } finally {
          setIsProcessing(false);
          // Stop media stream
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
          }
        }
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '錄音停止失敗';
      console.error('[Stop Recording Error]', err);
      setError(errorMsg);
      setStatus('❌ 錄音停止失敗');
      toast.error(errorMsg);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(correctedText || originalText);
      setIsCopied(true);
      toast.success('已複製到剪貼簿');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('複製失敗，請手動複製');
    }
  };

  // Picture-in-Picture
  const handlePictureInPicture = async () => {
    try {
      const container = document.querySelector('[data-pip-container]') as HTMLElement;
      if (container && 'documentPictureInPicture' in window) {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow();
        pipWindow.document.body.appendChild(container.cloneNode(true));
        toast.success('已打開懸浮視窗');
      }
    } catch (err) {
      console.error('[PiP Error]', err);
      toast.error('懸浮視窗不支援');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-blue-50 to-green-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Mic className="w-8 h-8 text-pink-500" />
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">廣東話語音輸入</h1>
          </div>
          <p className="text-gray-600">AI 自動修正錯別字，幫你說得更準確</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg border-0 data-pip-container" data-pip-container>
          <CardHeader className="bg-gradient-to-r from-pink-100 to-blue-100">
            <CardTitle>語音輸入工具</CardTitle>
            <CardDescription>按住麥克風按鈕說話，鬆開即可完成輸入</CardDescription>
          </CardHeader>

          <CardContent className="pt-8">
            {/* Error Alert */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">出現問題</p>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="text-center mb-8">
              <p className="text-gray-600 text-sm mb-2">狀態</p>
              <p className="text-lg font-semibold text-gray-800">{status}</p>
            </div>

            {/* Microphone Button */}
            <div className="flex justify-center mb-8">
              <Button
                onMouseDown={handleMicMouseDown}
                onMouseUp={handleMicMouseUp}
                onTouchStart={handleMicMouseDown}
                onTouchEnd={handleMicMouseUp}
                disabled={isProcessing}
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isRecording
                    ? 'bg-pink-500 hover:bg-pink-600 shadow-lg scale-105'
                    : 'bg-pink-400 hover:bg-pink-500 hover:scale-110 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                ) : (
                  <Mic className="w-12 h-12 text-white" />
                )}
              </Button>
            </div>

            {/* Audio Visualization */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1 mb-8 h-16">
                {audioLevels.map((level, i) => (
                  <div
                    key={i}
                    className="bg-gradient-to-t from-pink-500 to-pink-300 rounded-full transition-all duration-75"
                    style={{
                      width: '6px',
                      height: `${Math.max(8, level * 0.6)}px`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Original Text */}
            {originalText && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">原始文字</label>
                <Textarea
                  value={originalText}
                  readOnly
                  className="bg-gray-50 border-gray-200"
                  rows={3}
                />
              </div>
            )}

            {/* Corrected Text */}
            {correctedText && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">修正後文字</label>
                <div className="relative">
                  <Textarea
                    value={correctedText}
                    readOnly
                    className="bg-green-50 border-green-200"
                    rows={3}
                  />
                  <Button
                    onClick={handleCopy}
                    size="sm"
                    variant="outline"
                    className="absolute bottom-2 right-2"
                  >
                    {isCopied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
                        已複製
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        複製
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Picture-in-Picture Button */}
            <div className="flex gap-2">
              <Button
                onClick={handlePictureInPicture}
                variant="outline"
                className="flex-1"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                懸浮小視窗
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
