import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { ConditionLevel, ProductCategory } from './types.ts';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY 未設定，請於環境密鑰設定後再試。');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface AiListingAnalysis {
  category: ProductCategory;
  condition_level: ConditionLevel;
  suggested_title: string;
  suggested_description: string;
  keywords: string[];
  estimated_new_price_twd: number;
}

const VALID_CATEGORIES: ProductCategory[] = [
  '教科書',
  '小家電',
  '租屋家具',
  '3C 配件',
  '生活日用品',
];

const VALID_CONDITIONS: ConditionLevel[] = [
  '95% 新',
  '85% 新',
  '70% 新（有明顯使用痕跡）',
];

export async function analyzeProductImage(
  base64Image: string,
  mimeType: string
): Promise<AiListingAnalysis> {
  const ai = getAiClient();

  const prompt = [
    '你是台灣大學校園二手循環市集「CampusLoop」的商品辨識與定價分析師。',
    '請仔細辨識這張商品主圖，並以繁體中文（台灣用語）輸出結構化 JSON。',
    '要求：',
    '1. category 必須從以下五類選一：教科書、小家電、租屋家具、3C 配件、生活日用品。',
    '2. condition_level 必須從以下三項選一：95% 新、85% 新、70% 新（有明顯使用痕跡）。',
    '3. suggested_title 需包含辨識出的品牌/型號/核心品項名稱，簡潔明確（25字內）。',
    '4. suggested_description 必須至少 55 個繁體中文字，包含外觀成色細節、品牌與規格特徵、適合大學校園或宿舍使用情境。',
    '5. keywords 提供 2 到 5 個繁體中文或常見英文關鍵字（例如：計算機、Casio、微積分、檯燈），供資料庫檢索校內歷史成交紀錄。',
    '6. estimated_new_price_twd 估算台灣市場全新品合理售價（新台幣整數）。',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: 'Must be one of: 教科書, 小家電, 租屋家具, 3C 配件, 生活日用品',
          },
          condition_level: {
            type: Type.STRING,
            description: 'Must be one of: 95% 新, 85% 新, 70% 新（有明顯使用痕跡）',
          },
          suggested_title: {
            type: Type.STRING,
            description: 'Concise Traditional Chinese product title with brand/model.',
          },
          suggested_description: {
            type: Type.STRING,
            description: 'Detailed Traditional Chinese product description (>= 55 characters).',
          },
          keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-5 search keywords for matching historical campus prices.',
          },
          estimated_new_price_twd: {
            type: Type.INTEGER,
            description: 'Estimated retail price when brand new in NTD.',
          },
        },
        required: [
          'category',
          'condition_level',
          'suggested_title',
          'suggested_description',
          'keywords',
          'estimated_new_price_twd',
        ],
      },
    },
  });

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error('AI 視覺模型未回傳有效結果，請稍後重試。');
  }

  const parsed = JSON.parse(rawText) as Partial<AiListingAnalysis>;

  const category: ProductCategory = VALID_CATEGORIES.includes(parsed.category as ProductCategory)
    ? (parsed.category as ProductCategory)
    : '生活日用品';

  const condition_level: ConditionLevel = VALID_CONDITIONS.includes(
    parsed.condition_level as ConditionLevel
  )
    ? (parsed.condition_level as ConditionLevel)
    : '85% 新';

  const suggested_title =
    typeof parsed.suggested_title === 'string' && parsed.suggested_title.trim().length > 0
      ? parsed.suggested_title.trim()
      : '校園二手精選好物';

  let suggested_description =
    typeof parsed.suggested_description === 'string' ? parsed.suggested_description.trim() : '';
  if (suggested_description.length < 50) {
    suggested_description = `${suggested_description} 功能測試正常、外觀保存良好，適合校內同學日常學習與宿舍生活使用，歡迎約校內安全面交熱點當場驗貨取件。`.trim();
  }

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 5)
    : [];

  const estimated_new_price_twd =
    typeof parsed.estimated_new_price_twd === 'number' && parsed.estimated_new_price_twd > 0
      ? Math.round(parsed.estimated_new_price_twd)
      : 1000;

  return {
    category,
    condition_level,
    suggested_title,
    suggested_description,
    keywords,
    estimated_new_price_twd,
  };
}
