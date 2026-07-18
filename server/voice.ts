import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { invokeLLM } from './_core/llm';
import { transcribeAudio } from './_core/voiceTranscription';
import { publicProcedure, router } from './_core/trpc';
import { storageGetSignedUrl, storagePut } from './storage';

const CORRECTION_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const MAX_TEXT_LENGTH = 500;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
]);

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
};

/**
 * Cantonese correction system prompt
 * Instructs the LLM to correct homophone errors and typos in Cantonese text.
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

function decodeAudioDataUrl(audioBase64: string, declaredMimeType: string) {
  const matched = audioBase64.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!matched) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: '錄音格式無效，請重新錄音。',
    });
  }

  const dataUrlMimeType = matched[1].toLowerCase();
  const mimeType = declaredMimeType.split(';')[0].trim().toLowerCase();

  if (dataUrlMimeType !== mimeType || !SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: '這個錄音格式暫未支援，請使用 Chrome 重新錄音。',
    });
  }

  const rawBase64 = matched[2].replace(/\s/g, '');
  if (!rawBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(rawBase64)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: '錄音資料無效，請再試一次。',
    });
  }

  const audioBuffer = Buffer.from(rawBase64, 'base64');
  if (!audioBuffer.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: '沒有收到錄音內容，請按住按鈕說話後再放開。',
    });
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: '錄音太長，請分段說話後再試。',
    });
  }

  return { audioBuffer, mimeType };
}

/**
 * Correct Cantonese text using AI. If correction fails, preserve the original text.
 */
async function correctCantonese(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `文字長度不能超過 ${MAX_TEXT_LENGTH} 個字符`,
    });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = (await Promise.race([
        invokeLLM({
          messages: [
            { role: 'system', content: CORRECTION_SYSTEM_PROMPT },
            { role: 'user', content: `請修正以下廣東話文字：\n${text}` },
          ],
          model: 'gpt-4o-mini',
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI 修正超時')), CORRECTION_TIMEOUT_MS),
        ),
      ])) as { choices?: Array<{ message?: { content?: string } }> };

      const corrected = response.choices?.[0]?.message?.content?.trim();
      if (!corrected) {
        throw new Error('AI 返回無效結果');
      }

      return corrected;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        console.warn(`[Voice Correction] Attempt ${attempt + 1} failed, retrying…`, lastError.message);
      }
    }
  }

  console.error('[Voice Correction] All retries exhausted; returning original text.', lastError);
  return text;
}

export const voiceRouter = router({
  transcribe: publicProcedure
    .input(
      z.object({
        audioBase64: z.string().min(1, '沒有收到錄音資料').max(24 * 1024 * 1024, '錄音資料太大'),
        mimeType: z.string().min(1, '沒有錄音格式').max(100),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { audioBuffer, mimeType } = decodeAudioDataUrl(input.audioBase64, input.mimeType);
        const extension = AUDIO_EXTENSIONS[mimeType];
        const { key } = await storagePut(
          `voice-recordings/recording-${Date.now()}.${extension}`,
          audioBuffer,
          mimeType,
        );
        const audioUrl = await storageGetSignedUrl(key);

        const result = await transcribeAudio({
          audioUrl,
          // Whisper uses the ISO-639-1 Chinese code. The prompt keeps the transcription in Cantonese wording.
          language: 'zh',
          prompt: '請以繁體中文轉錄這段粵語／廣東話語音，保留自然的廣東話用詞。',
        });

        if ('error' in result) {
          console.error('[Voice Transcription] Whisper request failed', {
            code: result.code,
            details: result.details,
          });
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '未能轉錄這段錄音，請清楚說話後再試。',
            cause: result,
          });
        }

        const text = result.text.trim();
        if (!text) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '未能聽清楚內容，請按住按鈕說話至少一秒後再放開。',
          });
        }

        return {
          text,
          language: result.language || 'zh',
          success: true,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('[Voice Transcription] Unexpected error', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '錄音處理暫時未能完成，請稍後再試。',
        });
      }
    }),
  correct: publicProcedure
    .input(
      z.object({
        text: z.string().min(1, '文字不能為空').max(MAX_TEXT_LENGTH, `文字長度不能超過 ${MAX_TEXT_LENGTH} 個字符`),
      }),
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
        return {
          original: input.text,
          corrected: input.text,
          success: false,
          error: error instanceof Error ? error.message : '修正失敗',
        };
      }
    }),
});
