import { useState } from 'react';
import { Search } from 'lucide-react';
import { SafeImage } from './SafeImage';
import type { Product, ProductCategory } from '../types';

interface MarketplaceViewProps {
  products: Product[];
  loading: boolean;
  onSelectProduct: (product: Product) => void;
  onOpenListingModal: () => void;
  onJumpToBundles: () => void;
}

const CATEGORIES: Array<ProductCategory | '全部'> = [
  '全部',
  '教科書',
  '小家電',
  '租屋家具',
  '3C 配件',
  '生活日用品',
];

const STATUS_LABEL: Record<Product['status'], string> = {
  Listed: '上架中',
  Pending_Confirm: '待賣家確認',
  Reserved: '預約鎖定中',
  Sold: '已售出',
};

export function MarketplaceView({
  products,
  loading,
  onSelectProduct,
  onOpenListingModal,
  onJumpToBundles,
}: MarketplaceViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | '全部'>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const filtered = products.filter((p) => {
    if (selectedCategory !== '全部' && p.category !== selectedCategory) return false;
    if (onlyAvailable && p.status !== 'Listed') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${p.title} ${p.description} ${p.keywords.join(' ')} ${p.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-12">
      {/* Editorial Split Storefront Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-900 tracking-wide">
              .edu.tw 校園實名循環市集 · 動態信用擔保
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight mt-3 max-w-xl">
              讓每一件校園好物，安心交到下一位學弟妹手中
            </h1>
            <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
              告別社群二手版資訊雜亂與無故放鳥。拍照即自動辨識成色並參考校內歷史 P25–P75 成交價，於校園有監視器的安全熱點掃描動態 QR Code 完成面交。
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenListingModal}
              className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              AI 拍照立即上架
            </button>
            <button
              type="button"
              onClick={onJumpToBundles}
              className="px-5 py-2.5 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              查看畢業季打包轉讓
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 min-h-[260px] lg:min-h-[380px] bg-slate-100">
          <SafeImage
            src="/src/assets/images/hero_campus_desk_1795605810095.jpg"
            alt="陽光灑落的大學書桌，擺放 LED 檯燈、工程教科書、科學計算機與桌扇"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* 4-column Campus Trust Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">校園身分驗證</div>
          <div className="font-mono text-lg font-semibold text-slate-900 mt-1 tabular-nums">
            SHA-256 .edu.tw
          </div>
          <p className="text-xs text-slate-600 mt-1">單一信箱限綁一帳號，不暴露真實學號</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">動態信用擔保</div>
          <div className="font-mono text-lg font-semibold text-slate-900 mt-1 tabular-nums">
            0 – 150 分帳本
          </div>
          <p className="text-xs text-slate-600 mt-1">準時互評 +2 分，臨陣爽約最高 -30 分</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">校內定價基準</div>
          <div className="font-mono text-lg font-semibold text-slate-900 mt-1 tabular-nums">
            P25 – P75 區間
          </div>
          <p className="text-xs text-slate-600 mt-1">實時計算同品項歷史成交百分位數</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">面交安全核銷</div>
          <div className="font-mono text-lg font-semibold text-slate-900 mt-1 tabular-nums">
            HMAC 動態 QR
          </div>
          <p className="text-xs text-slate-600 mt-1">校內攝影機熱點掃碼留存準時證據</p>
        </div>
      </section>

      {/* Featured Collection & Filter Controls */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋計算機、微積分、檯燈..."
                aria-label="搜尋校內商品"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>

            <button
              type="button"
              onClick={() => setOnlyAvailable(!onlyAvailable)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                onlyAvailable
                  ? 'bg-emerald-900 text-white border-emerald-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              僅看可預約
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-4/3 bg-slate-200" />
                <div className="p-5 space-y-2.5">
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 rounded w-5/6" />
                  <div className="h-5 bg-slate-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <p className="text-sm text-slate-600">
              目前沒有符合篩選條件的校內商品，試試切換分類或建立許願清單配對通知。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product) => (
              <article
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-4/3 bg-slate-100 overflow-hidden">
                    <SafeImage
                      src={product.images[0]}
                      alt={product.title}
                      fallbackTitle={product.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">
                        {product.category} · {product.conditionLevel}
                      </span>
                      <span
                        className={`shrink-0 font-medium ${
                          product.status === 'Listed' ? 'text-emerald-900' : 'text-slate-500'
                        }`}
                      >
                        {STATUS_LABEL[product.status]}
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-base font-semibold text-slate-900 line-clamp-2 leading-snug">
                      {product.title}
                    </h3>

                    {product.seller && (
                      <p className="mt-2 text-xs text-slate-500 truncate">
                        {product.seller.displayName} · {product.seller.university}認證 ·{' '}
                        <span className="font-mono tabular-nums">
                          信用 {product.seller.creditScore}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                  <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
                    NT$ {product.price.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500 truncate max-w-[140px]">
                    {product.pickupZone}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
