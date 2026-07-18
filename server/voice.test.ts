import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrpcContext } from './_core/context';

vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: '我尋日同媽咪去咗公園玩，好開心。' } }],
  })),
}));

vi.mock('./storage', () => ({
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));

vi.mock('./_core/voiceTranscription', () => ({
  transcribeAudio: vi.fn(),
}));

import { appRouter } from './routers';
import { storageGetSignedUrl, storagePut } from './storage';
import { transcribeAudio } from './_core/voiceTranscription';

const mockStoragePut = vi.mocked(storagePut);
const mockStorageGetSignedUrl = vi.mocked(storageGetSignedUrl);
const mockTranscribeAudio = vi.mocked(transcribeAudio);

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

function sampleAudioDataUrl() {
  return `data:audio/webm;codecs=opus;base64,${Buffer.from('sample webm bytes').toString('base64')}`;
}

describe('voice.correct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('corrects Cantonese text successfully', async () => {
    const result = await appRouter.createCaller(createContext()).voice.correct({
      text: '我尋日同媽咪去左公完玩好開心',
    });

    expect(result).toMatchObject({
      original: '我尋日同媽咪去左公完玩好開心',
      corrected: '我尋日同媽咪去咗公園玩，好開心。',
      success: true,
    });
  });

  it('rejects empty correction text', async () => {
    await expect(appRouter.createCaller(createContext()).voice.correct({ text: '' })).rejects.toThrow('文字不能為空');
  });
});

describe('voice.transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoragePut.mockResolvedValue({ key: 'voice-recordings/test.webm', url: '/manus-storage/voice-recordings/test.webm' });
    mockStorageGetSignedUrl.mockResolvedValue('https://signed.example.test/recording.webm');
    mockTranscribeAudio.mockResolvedValue({
      task: 'transcribe',
      language: 'zh',
      duration: 1.2,
      text: '我尋日去咗公園。',
      segments: [],
    });
  });

  it('uploads a decoded recording, obtains a signed URL, then transcribes it', async () => {
    const result = await appRouter.createCaller(createContext()).voice.transcribe({
      audioBase64: sampleAudioDataUrl(),
      mimeType: 'audio/webm;codecs=opus',
    });

    expect(mockStoragePut).toHaveBeenCalledWith(
      expect.stringMatching(/^voice-recordings\/recording-\d+\.webm$/),
      expect.any(Buffer),
      'audio/webm',
    );
    expect(mockStorageGetSignedUrl).toHaveBeenCalledWith('voice-recordings/test.webm');
    expect(mockTranscribeAudio).toHaveBeenCalledWith(expect.objectContaining({
      audioUrl: 'https://signed.example.test/recording.webm',
      language: 'zh',
    }));
    expect(result).toEqual({ text: '我尋日去咗公園。', language: 'zh', success: true });
  });

  it('returns a user-safe error when Whisper reports a transcription failure', async () => {
    mockTranscribeAudio.mockResolvedValue({
      error: 'Transcription service request failed',
      code: 'TRANSCRIPTION_FAILED',
      details: '503 Service Unavailable',
    });

    await expect(
      appRouter.createCaller(createContext()).voice.transcribe({
        audioBase64: sampleAudioDataUrl(),
        mimeType: 'audio/webm;codecs=opus',
      }),
    ).rejects.toThrow('未能轉錄這段錄音');
  });

  it('returns a clear message when Whisper returns no recognised text', async () => {
    mockTranscribeAudio.mockResolvedValue({
      task: 'transcribe',
      language: 'zh',
      duration: 1.2,
      text: '   ',
      segments: [],
    });

    await expect(
      appRouter.createCaller(createContext()).voice.transcribe({
        audioBase64: sampleAudioDataUrl(),
        mimeType: 'audio/webm;codecs=opus',
      }),
    ).rejects.toThrow('未能聽清楚內容');
  });

  it('rejects unsupported audio formats before attempting storage', async () => {
    const invalidAudio = `data:audio/flac;base64,${Buffer.from('audio').toString('base64')}`;

    await expect(
      appRouter.createCaller(createContext()).voice.transcribe({
        audioBase64: invalidAudio,
        mimeType: 'audio/flac',
      }),
    ).rejects.toThrow('暫未支援');
    expect(mockStoragePut).not.toHaveBeenCalled();
  });
});
