import { z } from 'zod';
import { publicProcedure, router } from './_core/trpc';
import { invokeLLM } from './_core/llm';
import { transcribeAudio } from './_core/voiceTranscription';
import { TRPCError } from '@trpc/server';

const CORRECTION_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const MAX_TEXT_LENGTH = 500;

/**
 * Cantonese correction system prompt
 * Instructs the LLM to correct homophone errors and typos in Cantonese text
 */
const CORRECTION_SYSTEM_PROMPT = `你是一個專為香港小學生設計的廣東話語音輸入修正助手。

學生會使用廣東話語音輸入，但經常出現同音錯別字或語意不連貫的情況。

你的任務：
1. 根據上下文，自動識別並修正同音錯別字（例如：「植左」改為「食咗」，「平果」改為「蘋果」）。
2. 保持廣東話口語的自然表達，不要強行轉為書面語。
3. 加上適當的標點符號。
4. 只輸出修正後的最終文字，絕對不要包含任何解釋、問候語或引號。

範例：
輸入：我尋日同媽咪去左公完玩好開心
輸出：我尋日同媽咪去咗公園玩，好開心。`;

/**
 * Correct Cantonese text using AI
 * Handles timeouts, retries, and fallback to original text on failure
 */
async function correctCantonese(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Input validation
  if (text.length > MAX_TEXT_LENGTH) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `文字長度不能超過 ${MAX_TEXT_LENGTH} 個字符`,
    });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CORRECTION_TIMEOUT_MS);

      try {
        const response = (await Promise.race([
          invokeLLM({
            messages: [
              {
                role: 'system',
                content: CORRECTION_SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: `請修正以下廣東話文字：\n${text}`,
              },
            ],
            model: 'gpt-4o-mini', // Use fast, cost-effective model for real-time correction
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI 修正超時')), CORRECTION_TIMEOUT_MS)
          ),
        ])) as any;

        clearTimeout(timeoutId);

        const corrected = response?.choices?.[0]?.message?.content?.trim?.();
        if (!corrected || typeof corrected !== 'string') {
          throw new Error('AI 返回無效結果');
        }

        return corrected;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log retry attempts
      if (attempt < MAX_RETRIES) {
        console.warn(`[Voice Correction] Attempt ${attempt + 1} failed, retrying...`, lastError?.message);
      }
    }
  }

  // If all retries fail, return original text with warning
  console.error('[Voice Correction] All retries exhausted, returning original text', lastError);
  return text; // Fallback to original text
}

export const voiceRouter = router({
  transcribe: publicProcedure
    .input(
      z.object({
        audioBase64: z.string().min(1, 'Audio data required'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Extract base64 data
        const base64Data = input.audioBase64.includes(',') 
          ? input.audioBase64.split(',')[1] 
          : input.audioBase64;
        
        console.log('[Voice Transcription] Processing audio, size:', base64Data.length);
        
        const result = await transcribeAudio({
          audioUrl: input.audioBase64,
          language: 'yue',
          prompt: 'Cantonese speech input',
        });

        return {
          text: (result as any).text || '',
          language: (result as any).language || 'yue',
          success: true,
        };
      } catch (error) {
        console.error('[Voice Transcription] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Transcription failed',
        });
      }
    }),
  correct: publicProcedure
    .input(
      z.object({
        text: z.string().min(1, '文字不能為空').max(MAX_TEXT_LENGTH, `文字長度不能超過 ${MAX_TEXT_LENGTH} 個字符`),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const corrected = await correctCantonese(input.text);
        return {
          original: input.text,
          corrected,
          success: true,
        };
      } catch (error) {
        console.error('[Voice Correction] Error:', error);
        // Return original text on error instead of throwing
        return {
          original: input.text,
          corrected: input.text,
          success: false,
          error: error instanceof Error ? error.message : '修正失敗',
        };
      }
    }),
});
