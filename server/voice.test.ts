import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// Mock the LLM module
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [
      {
        message: {
          content: '我尋日同媽咪去咗公園玩，好開心。',
        },
      },
    ],
  })),
}));

function createContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: 'https',
      headers: {},
    } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

describe('voice.correct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correct Cantonese text successfully', async () => {
    const ctx = createContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.voice.correct({
      text: '我尋日同媽咪去左公完玩好開心',
    });

    expect(result).toBeDefined();
    expect(result.original).toBe('我尋日同媽咪去左公完玩好開心');
    expect(result.success).toBe(true);
    expect(result.corrected).toBe('我尋日同媽咪去咗公園玩，好開心。');
  });

  it('should reject empty text', async () => {
    const ctx = createContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.voice.correct({ text: '' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('文字不能為空');
    }
  });

  it('should reject text exceeding max length', async () => {
    const ctx = createContext();
    const caller = appRouter.createCaller(ctx);

    const longText = 'a'.repeat(501);

    try {
      await caller.voice.correct({ text: longText });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('文字長度不能超過');
    }
  });

  it('should handle short text correctly', async () => {
    const ctx = createContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.voice.correct({
      text: '你好',
    });

    expect(result.original).toBe('你好');
    expect(result.success).toBe(true);
    expect(result.corrected).toBeDefined();
  });

  it('should return result with original text preserved', async () => {
    const ctx = createContext();
    const caller = appRouter.createCaller(ctx);

    const testText = '我想食飯';
    const result = await caller.voice.correct({
      text: testText,
    });

    expect(result.original).toBe(testText);
    expect(result.corrected).toBeDefined();
    expect(result.success).toBe(true);
  });
});
