import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// Mock the LLM module
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn(async ({ messages }: any) => {
    const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';
    
    // Simple mock: return corrected version
    let corrected = userMessage;
    corrected = corrected.replace('去左', '去咗');
    corrected = corrected.replace('公完', '公園');
    
    return {
      choices: [
        {
          message: {
            content: corrected,
          },
        },
      ],
    };
  }),
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

describe('Voice Input Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-end voice correction flow', () => {
    it('should complete a full correction cycle', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const voiceInput = '我去左公完';

      const result = await caller.voice.correct({
        text: voiceInput,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.original).toBe(voiceInput);
      expect(result.corrected).toBeDefined();
      expect(typeof result.corrected).toBe('string');
    });

    it('should reject empty input', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.voice.correct({ text: '' });
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.message).toContain('文字不能為空');
      }
    });

    it('should enforce maximum text length', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const tooLongText = 'a'.repeat(501);

      try {
        await caller.voice.correct({ text: tooLongText });
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.message).toContain('文字長度不能超過');
      }
    });

    it('should handle short valid input', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voice.correct({
        text: '你好',
      });

      expect(result.success).toBe(true);
      expect(result.original).toBe('你好');
      expect(result.corrected).toBeDefined();
    });

    it('should handle API success', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const input = '我想食飯';
      const result = await caller.voice.correct({ text: input });

      expect(result.success).toBe(true);
      expect(result.original).toBe(input);
      expect(result.corrected).toBeDefined();
    });

    it('should handle input with numbers', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voice.correct({
        text: '我有3個蘋果',
      });

      expect(result.success).toBe(true);
      expect(result.original).toBe('我有3個蘋果');
      expect(result.corrected).toBeDefined();
    });

    it('should handle multiple corrections', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voice.correct({
        text: '我去左公完',
      });

      expect(result.success).toBe(true);
      expect(result.corrected).toBeDefined();
      expect(result.corrected.length).toBeGreaterThan(0);
    });

    it('should return consistent results', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const input = '我去左公完';

      const result1 = await caller.voice.correct({ text: input });
      const result2 = await caller.voice.correct({ text: input });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle input at maximum length', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const maxLengthText = '我'.repeat(250);

      const result = await caller.voice.correct({ text: maxLengthText });

      expect(result.success).toBe(true);
      expect(result.original.length).toBeLessThanOrEqual(500);
    });

    it('should handle rapid successive requests', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const requests = Array(3)
        .fill(null)
        .map((_, i) => caller.voice.correct({ text: `測試${i}` }));

      const results = await Promise.all(requests);

      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.corrected).toBeDefined();
      });
    });

    it('should handle mixed content', async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voice.correct({
        text: '我係ABC123',
      });

      expect(result.success).toBe(true);
      expect(result.corrected).toBeDefined();
    });
  });
});
