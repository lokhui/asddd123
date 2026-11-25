import { useState } from 'react';
import { Trash2, BellRing, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { NotificationItem, ProductCategory, PublicUserSummary, WishlistItem } from '../types';

interface WishlistViewProps {
  currentUser: PublicUserSummary | null;
  wishlists: WishlistItem[];
  notifications: NotificationItem[];
  onRefresh: () => void;
  onRequireAuth: () => void;
  onSelectProductId: (id?: string) => void;
}

const CATEGORIES: Array<ProductCategory | '全部'> = [
  '全部',
  '教科書',
  '小家電',
  '租屋家具',
  '3C 配件',
  '生活日用品',
];

export function WishlistView({
  currentUser,
  wishlists,
  notifications,
  onRefresh,
  onRequireAuth,
  onSelectProductId,
}: WishlistViewProps) {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<ProductCategory | '全部'>('全部');
  const [maxPrice, setMaxPrice] = useState('500');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setError('');
    setStatusMessage('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ instantMatchCount: number }>('/api/v1/wishlists', {
        method: 'POST',
        body: JSON.stringify({
          keyword,
          category,
          maxPrice: Number(maxPrice),
        }),
      });
      setKeyword('');
      setStatusMessage(
        res.instantMatchCount > 0
          ? `已建立許願單！系統立即為您配對到 ${res.instantMatchCount} 件符合條件的架上商品。`
          : '已建立許願單！未來只要有同學新上架符合條件的物品，將立即發送站內與信箱通知。'
      );
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增許願失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/v1/wishlists/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  const matchNotifs = notifications.filter((n) => n.type === 'wishlist_match');

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          買家許願清單與自動配對通知
        </h1>
        <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
          設定您想尋找的校園物品關鍵字、分類與預算上限（每人最多 5 筆進行中許願）。當新商品上架且價格符合預算時，系統自動觸發配對通知。
        </p>
      </div>

      {!currentUser ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <p className="text-sm text-slate-600">
            完成 .edu.tw 校園信箱驗證後，即可建立最多 5 筆許願清單並接收自動配對通知。
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
          >
            前往驗證校園信箱
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Create Form & Active Wishlists */}
          <div className="lg:col-span-7 space-y-6">
            <form
              onSubmit={handleCreate}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  新增許願配對條件
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  使用額度：{wishlists.length} / 5
                </span>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {error}
                </div>
              )}
              {statusMessage && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  {statusMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="wl-keyword" className="block text-xs font-medium text-slate-700 mb-1">
                    物品關鍵字
                  </label>
                  <input
                    id="wl-keyword"
                    type="text"
                    required
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="例如：計算機、檯燈"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="wl-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    指定分類
                  </label>
                  <select
                    id="wl-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProductCategory | '全部')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="wl-price" className="block text-xs font-medium text-slate-700 mb-1">
                    預算上限（NT$）
                  </label>
                  <input
                    id="wl-price"
                    type="number"
                    min={10}
                    required
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || wishlists.length >= 5}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? '配對中...' : '建立許願清單'}</span>
                </button>
              </div>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="font-display text-lg font-semibold text-slate-900 mb-4">
                進行中的許願清單
              </h2>
              {wishlists.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">目前尚未設定任何許願清單。</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {wishlists.map((wl) => (
                    <div key={wl.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{wl.keyword}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          分類：{wl.category} ·{' '}
                          <span className="font-mono tabular-nums">
                            預算上限 NT$ {wl.maxPrice.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(wl.id)}
                        aria-label={`移除許願 ${wl.keyword}`}
                        className="p-2 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Auto-Matched Alerts */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <BellRing className="w-4 h-4 text-emerald-800" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                自動配對成功通知
              </h2>
            </div>

            {matchNotifs.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">
                尚未有自動配對通知。試著上架符合您許願關鍵字的商品即可即時觸發！
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {matchNotifs.map((n) => (
                  <div key={n.id} className="py-3.5 space-y-1.5">
                    <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                    <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                    {n.relatedId && (
                      <button
                        type="button"
                        onClick={() => onSelectProductId(n.relatedId)}
                        className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
                      >
                        前往查看該商品詳情 →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
