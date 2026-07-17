# 廣東話 AI 語音小幫手

一個為香港小學生設計的廣東話語音輸入工具，利用 AI 自動修正同音錯別字，幫助學生提高中文輸入的準確性。

## 功能特色

### 🎤 語音輸入
- **廣東話語音辨識**：使用瀏覽器 Web Speech API 進行實時廣東話語音辨識
- **按住開始、鬆開結束**：直觀的交互方式，支援滑鼠和觸控
- **即時音量波動動畫**：20 條動態柱狀圖，視覺化顯示麥克風收音狀態

### 🤖 AI 錯別字修正
- **自動修正同音字**：例如「去左」→「去咗」、「公完」→「公園」
- **上下文智能識別**：根據句子意思自動判斷正確字詞
- **容錯機制**：若 AI 修正失敗，自動回退到原始語音文字
- **5 秒超時保護**：防止 AI 響應過慢影響使用體驗

### 📋 文字管理
- **自動複製到剪貼簿**：修正完成後一鍵複製
- **剪貼簿失敗處理**：支援舊版瀏覽器的 fallback 方案
- **清晰的狀態提示**：即時反饋聆聽、處理、完成等狀態

### 🪟 畫中畫懸浮視窗
- **Document Picture-in-Picture API**：將工具浮在其他網頁上方
- **完整功能支援**：懸浮視窗內保持全部功能可用
- **快速切換**：輕鬆在不同應用間使用

## 使用指南

### 基本操作

1. **開始語音輸入**
   - 按住粉紅色麥克風按鈕
   - 用廣東話說出你想輸入的文字
   - 鬆開按鈕結束錄音

2. **查看修正結果**
   - 原始語音文字顯示在上方區域
   - AI 修正後的文字顯示在下方區域
   - 修正完成後會自動複製到剪貼簿

3. **複製文字**
   - 修正完成後點擊「複製」按鈕
   - 或使用快捷鍵 Ctrl+V（Windows）/ Cmd+V（Mac）貼上

4. **使用懸浮視窗**
   - 點擊「🪟 懸浮小視窗」按鈕
   - 工具會在新視窗中打開
   - 可在其他網頁上方使用

### 瀏覽器支援

- ✅ Chrome 90+
- ✅ Safari 14.1+
- ✅ Edge 90+
- ⚠️ Firefox（語音辨識支援有限）

### 系統需求

- 麥克風權限
- 網路連線（用於 AI 修正）
- 支援 Web Speech API 的瀏覽器

## 技術架構

### 前端技術棧
- **React 19**：UI 框架
- **Tailwind CSS 4**：樣式設計
- **Web Speech API**：語音辨識
- **Document Picture-in-Picture API**：懸浮視窗
- **Clipboard API**：剪貼簿操作

### 後端技術棧
- **Express 4**：Web 伺服器
- **tRPC 11**：類型安全的 API
- **Manus LLM**：AI 錯別字修正

## API 文檔

### `voice.correct` - 語音修正 API

**端點**：`/api/trpc/voice.correct`

**方法**：POST

**請求參數**

```typescript
{
  text: string  // 需要修正的廣東話文字（最多 500 字）
}
```

**回應格式**

```typescript
{
  original: string      // 原始輸入文字
  corrected: string     // AI 修正後的文字
  success: boolean      // 修正是否成功
  error?: string        // 錯誤訊息（若有）
}
```

**範例請求**

```bash
curl -X POST https://your-domain.com/api/trpc/voice.correct \
  -H "Content-Type: application/json" \
  -d '{"text": "我尋日同媽咪去左公完玩好開心"}'
```

**範例回應**

```json
{
  "original": "我尋日同媽咪去左公完玩好開心",
  "corrected": "我尋日同媽咪去咗公園玩，好開心。",
  "success": true
}
```

**錯誤處理**

- **文字為空**：返回 `400 Bad Request`，訊息「文字不能為空」
- **文字過長**：返回 `400 Bad Request`，訊息「文字長度不能超過 500 個字符」
- **AI 超時**：返回原始文字，`success: true`
- **AI 失敗**：返回原始文字，`success: true`，包含 `error` 欄位

## 設計風格

### 色彩方案（馬卡龍配色）
- **主色**：淡粉紅 (#F4A6C1)
- **輔色**：淡藍 (#A8D8EA)、淡綠 (#AAF683)、淡黃 (#FFE66D)
- **背景**：淡粉紅漸變 (#FAFBFC → #FFE6F0)

### 排版
- **字體**：系統字體 (system-ui, -apple-system, sans-serif)
- **標題**：24px 粗體
- **正文**：16px 常規
- **標籤**：14px 常規

### 互動設計
- **按鈕**：大圓角（24px）、陰影效果
- **動畫**：流暢的過渡效果（150-300ms）
- **反饋**：即時的狀態提示和 Toast 通知

## 開發指南

### 本地開發

```bash
# 安裝依賴
pnpm install

# 啟動開發伺服器
pnpm dev

# 執行測試
pnpm test

# 類型檢查
pnpm check
```

### 項目結構

```
cantonese-voice-ai-helper/
├── client/                 # 前端代碼
│   ├── src/
│   │   ├── pages/
│   │   │   └── VoiceInput.tsx    # 主要語音輸入組件
│   │   ├── index.css             # 全局樣式（馬卡龍主題）
│   │   └── App.tsx               # 應用路由
│   └── index.html
├── server/                 # 後端代碼
│   ├── voice.ts           # 語音修正路由
│   ├── voice.test.ts      # 單元測試
│   ├── voice.integration.test.ts  # 整合測試
│   └── routers.ts         # tRPC 路由配置
├── drizzle/               # 數據庫架構
└── package.json
```

### 環境變數

```env
# LLM 配置（自動注入）
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=<your-api-key>

# 前端配置（自動注入）
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=<your-frontend-key>
```

## 測試覆蓋

### 單元測試
- ✅ AI 修正邏輯（5 個測試）
- ✅ 超時與重試機制（包含在邏輯測試中）
- ✅ 輸入驗證（空字串、長度限制）

### 整合測試
- ✅ 前後端完整流程（11 個測試）
- ✅ 錯誤處理與邊界情況
- ✅ 並發請求處理

### 手動測試檢查清單
- ✅ 語音辨識準確度（廣東話）
- ✅ 音量波動動畫流暢度
- ✅ 畫中畫懸浮視窗功能
- ✅ 跨瀏覽器兼容性（Chrome、Safari、Edge）
- ✅ 響應式設計（桌面、平板、手機）

## 已知限制

1. **語音辨識**
   - 需要穩定的網路連線
   - 廣東話辨識準確度取決於發音清晰度
   - 背景噪音可能影響辨識結果

2. **AI 修正**
   - 5 秒超時限制
   - 最多 2 次重試
   - 複雜句子的修正可能不完美

3. **瀏覽器支援**
   - 舊版瀏覽器可能不支援某些功能
   - 某些瀏覽器需要 HTTPS 才能使用麥克風

## 常見問題

**Q: 為什麼語音辨識不準確？**
A: 請確保：
- 麥克風正常工作
- 環境噪音不太大
- 說話速度適中、發音清晰
- 使用支援廣東話的瀏覽器

**Q: 修正後的文字不對怎麼辦？**
A: 可以手動編輯修正結果，或重新錄音試試。

**Q: 可以離線使用嗎？**
A: 不可以。語音辨識和 AI 修正都需要網路連線。

**Q: 支援其他語言嗎？**
A: 目前只支援廣東話。

## 隱私政策

- 語音輸入數據僅用於實時辨識，不會被保存
- AI 修正過程中的文字不會被用於訓練
- 詳見完整隱私政策

## 許可證

MIT License

## 聯絡方式

如有問題或建議，請提交 Issue 或 Pull Request。

---

**最後更新**：2026 年 7 月 17 日
