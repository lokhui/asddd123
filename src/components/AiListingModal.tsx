import { useState } from 'react';
import { X, Upload, Sparkles, ShieldCheck, TrendingUp, ImagePlus } from 'lucide-react';
import { apiFetch, stripImageExif } from '../lib/api';
import type { AiAnalyzeResponse, ConditionLevel, Product, ProductCategory } from '../types';

interface AiListingModalProps {
  open: boolean;
  onClose: () => void;
  onPublished: (product: Product, matchedWishlistCount: number) => void;
}

const CATEGORIES: ProductCategory[] = [
  '教科書',
  '小家電',
  '租屋家具',
  '3C 配件',
  '生活日用品',
];

const CONDITIONS: ConditionLevel[] = [
  '95% 新',
  '85% 新',
  '70% 新（有明顯使用痕跡）',
];

const PICKUP_ZONES = [
  '總圖書館一樓大廳',
  '學生活動中心超商前',
  '校門口警衛室／捷運站周邊',
  '男生／女生宿舍區',
];

export function AiListingModal({ open, onClose, onPublished }: AiListingModalProps) {
  const [images, setImages] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [exifCleared, setExifCleared] = useState(false);
  const [pricingInfo, setPricingInfo] = useState<AiAnalyzeResponse['pricing'] | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProductCategory>('3C 配件');
  const [conditionLevel, setConditionLevel] = useState<ConditionLevel>('95% 新');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [pickupZone, setPickupZone] = useState(PICKUP_ZONES[0]);
  const [keywords, setKeywords] = useState<string[]>([]);

  if (!open) return null;

  const runAiAnalyze = async (
    primaryDataUrl: string,
    demoPresetKey?: 'calculator' | 'textbook'
  ) => {
    setAnalyzing(true);
    setError('');
    try {
      const result = await apiFetch<AiAnalyzeResponse>('/api/v1/products/ai-analyze', {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl: primaryDataUrl, demoPresetKey }),
      });
      setCategory(result.analysis.category);
      setConditionLevel(result.analysis.condition_level);
      setTitle(result.analysis.suggested_title);
      setDescription(result.analysis.suggested_description);
      setKeywords(result.analysis.keywords);
      setPricingInfo(result.pricing);
      setPrice(String(result.pricing.medianPrice));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 商品辨識失敗，請手動填寫或重試');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setError('');
    try {
      const selected = Array.from(fileList).slice(0, 5 - images.length);
      const cleanedUrls: string[] = [];
      for (const file of selected) {
        const cleanDataUrl = await stripImageExif(file);
        cleanedUrls.push(cleanDataUrl);
      }
      const nextImages = [...images, ...cleanedUrls].slice(0, 5);
      setImages(nextImages);
      setExifCleared(true);

      // Analyze first primary image automatically
      if (images.length === 0 && cleanedUrls[0]) {
        await runAiAnalyze(cleanedUrls[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '圖片處理失敗');
    } finally {
      e.target.value = '';
    }
  };

  const handleTestSamplePhoto = async (
    samplePath: string,
    demoPresetKey: 'calculator' | 'textbook'
  ) => {
    setError('');
    try {
      const res = await fetch(samplePath);
      const blob = await res.blob();
      const file = new File([blob], 'sample.jpg', { type: 'image/jpeg' });
      const cleanDataUrl = await stripImageExif(file);
      setImages([cleanDataUrl]);
      setExifCleared(true);
      await runAiAnalyze(cleanDataUrl, demoPresetKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入範例照片失敗');
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const numPrice = Number(price);
    if (!title.trim() || description.trim().length < 10 || !Number.isFinite(numPrice) || numPrice <= 0) {
      setError('請確認商品名稱、詳細描述與售價皆已正確填寫');
      return;
    }

    setPublishing(true);
    try {
      const res = await apiFetch<{ product: Product; matchedWishlistCount: number }>(
        '/api/v1/products',
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            category,
            conditionLevel,
            price: numPrice,
            estimatedMinPrice: pricingInfo?.minSuggested,
            estimatedMaxPrice: pricingInfo?.maxSuggested,
            images,
            keywords,
            pickupZone,
          }),
        }
      );
      onPublished(res.product, res.matchedWishlistCount);
      onClose();
      // Reset form
      setImages([]);
      setTitle('');
      setDescription('');
      setPrice('');
      setPricingInfo(null);
      setExifCleared(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '商品上架失敗');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-listing-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl my-8 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 id="ai-listing-title" className="font-display text-xl font-bold text-slate-900">
              AI 拍照辨識上架與校內歷史定價
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              上傳 1–5 張商品照片，自動清除 EXIF GPS 隱私並由多模態視覺模型填入成色文案與 P25–P75 定價建議。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉上架視窗"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handlePublish} className="mt-5 space-y-5">
          {/* Image upload & EXIF privacy strip */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-slate-800">
                商品照片（{images.length} / 5 張，單張上限 5MB）
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleTestSamplePhoto(
                      '/src/assets/images/product_calculator_scientific_1795605809857.jpg',
                      'calculator'
                    )
                  }
                  disabled={analyzing}
                  className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
                >
                  用計算機實拍圖試算 AI
                </button>
                <span aria-hidden="true" className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() =>
                    handleTestSamplePhoto(
                      '/src/assets/images/product_textbook_stack_1795605810825.jpg',
                      'textbook'
                    )
                  }
                  disabled={analyzing}
                  className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
                >
                  用原文教科書試算 AI
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {images.map((src, idx) => (
                <div
                  key={idx}
                  className="relative aspect-4/3 rounded-lg overflow-hidden border border-slate-200 bg-slate-50"
                >
                  <img src={src} alt={`商品預覽 ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, i) => i !== idx))}
                    aria-label={`移除第 ${idx + 1} 張照片`}
                    className="absolute top-1 right-1 p-1 bg-slate-900/75 text-white rounded text-xs cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {images.length < 5 && (
                <label className="aspect-4/3 rounded-lg border border-dashed border-slate-300 hover:border-emerald-800 bg-slate-50 hover:bg-slate-100/70 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <ImagePlus className="w-5 h-5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-600">上傳照片</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              )}
            </div>

            {exifCleared && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-900">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>已自動清除照片 EXIF GPS 定位與裝置資訊，保障租屋處地址隱私</span>
              </div>
            )}
          </div>

          {/* Skeleton loader during AI analysis */}
          {analyzing && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3" aria-busy="true">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                <Sparkles className="w-4 h-4" />
                <span>AI 視覺模型正在辨識品牌型號、評估外觀成色並檢索校內歷史成交價格...</span>
              </div>
              <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3" />
              <div className="h-3 bg-slate-200 rounded animate-pulse w-full" />
              <div className="h-3 bg-slate-200 rounded animate-pulse w-5/6" />
            </div>
          )}

          {/* Historical P25-P75 pricing panel */}
          {pricingInfo && !analyzing && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <TrendingUp className="w-4 h-4 text-emerald-800" />
                  <span>
                    校內建議定價區間：
                    <span className="font-mono tabular-nums text-emerald-900 ml-1">
                      NT$ {pricingInfo.minSuggested.toLocaleString()} ～ NT$ {pricingInfo.maxSuggested.toLocaleString()}
                    </span>
                  </span>
                </div>
                <span className="text-xs text-slate-600 font-mono tabular-nums">
                  {pricingInfo.source === 'historical'
                    ? `依據 ${pricingInfo.sampleCount} 筆同類歷史成交（P25–P75）`
                    : `歷史樣本不足 3 筆，依 AI 新品估值 40%–60% 推算`}
                </span>
              </div>

              {pricingInfo.matchedSamples.length > 0 && (
                <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {pricingInfo.matchedSamples.slice(0, 3).map((s, idx) => (
                    <span key={idx} className="tabular-nums">
                      參考成交：{s.title}（NT$ {s.soldPrice}）
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Structured listing fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="prod-title" className="block text-sm font-medium text-slate-800 mb-1">
                商品標題
              </label>
              <input
                id="prod-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：Casio fx-991EX 工程科學計算機"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>

            <div>
              <label htmlFor="prod-category" className="block text-sm font-medium text-slate-800 mb-1">
                商品分類
              </label>
              <select
                id="prod-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-2 focus:outline-emerald-800"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-condition" className="block text-sm font-medium text-slate-800 mb-1">
                外觀成色評估
              </label>
              <select
                id="prod-condition"
                value={conditionLevel}
                onChange={(e) => setConditionLevel(e.target.value as ConditionLevel)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-2 focus:outline-emerald-800"
              >
                {CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-price" className="block text-sm font-medium text-slate-800 mb-1">
                設定售價（NT$）
              </label>
              <input
                id="prod-price"
                type="number"
                min={10}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="輸入新台幣售價"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>

            <div>
              <label htmlFor="prod-zone" className="block text-sm font-medium text-slate-800 mb-1">
                偏好自取／面交區域
              </label>
              <select
                id="prod-zone"
                value={pickupZone}
                onChange={(e) => setPickupZone(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-2 focus:outline-emerald-800"
              >
                {PICKUP_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="prod-desc" className="block text-sm font-medium text-slate-800">
                  商品描述與使用狀況
                </label>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {description.length} 字
                </span>
              </div>
              <textarea
                id="prod-desc"
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述品牌型號、使用時間、外觀狀況與面交注意事項..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
            {images.length > 0 && (
              <button
                type="button"
                disabled={analyzing}
                onClick={() => runAiAnalyze(images[0])}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                重新執行 AI 視覺辨識
              </button>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={publishing || analyzing}
                className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {publishing ? '發布中...' : '確認發布至校園市集'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
