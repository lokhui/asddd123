import { useState } from 'react';
import { PackagePlus, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { SafeImage } from './SafeImage';
import type { Bundle, Product, PublicUserSummary, SafeHotspot } from '../types';

interface BundlesViewProps {
  bundles: Bundle[];
  myListedProducts: Product[];
  currentUser: PublicUserSummary | null;
  hotspots: SafeHotspot[];
  onRefresh: () => void;
  onRequireAuth: () => void;
}

const PICKUP_ZONES = [
  '男生／女生宿舍區',
  '校門口商圈',
  '捷運公館站周邊',
  '總圖書館一樓大廳',
];

export function BundlesView({
  bundles,
  myListedProducts,
  currentUser,
  hotspots,
  onRefresh,
  onRequireAuth,
}: BundlesViewProps) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bundleTitle, setBundleTitle] = useState('');
  const [bundlePrice, setBundlePrice] = useState('');
  const [salesMode, setSalesMode] = useState<'allow_individual' | 'bundle_only'>('allow_individual');
  const [pickupZone, setPickupZone] = useState(PICKUP_ZONES[0]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reserve modal state for a bundle
  const [reservingBundle, setReservingBundle] = useState<Bundle | null>(null);
  const [hotspotId, setHotspotId] = useState(hotspots[0]?.id ?? 'hs_ntu_dorm');
  const [timePreset, setTimePreset] = useState<'now_5m' | 'soon_1h' | 'tomorrow_14' | 'custom'>('now_5m');
  const [customDateTime, setCustomDateTime] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  });
  const [riskAck, setRiskAck] = useState(false);

  const eligibleProducts = myListedProducts.filter((p) => p.status === 'Listed' && !p.bundleId);
  const originalSum = eligibleProducts
    .filter((p) => selectedIds.includes(p.id))
    .reduce((sum, p) => sum + p.price, 0);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 10 ? [...prev, id] : prev
    );
  };

  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/bundles', {
        method: 'POST',
        body: JSON.stringify({
          title: bundleTitle,
          itemIds: selectedIds,
          bundlePrice: Number(bundlePrice),
          salesMode,
          pickupZone,
        }),
      });
      setShowBuilder(false);
      setSelectedIds([]);
      setBundleTitle('');
      setBundlePrice('');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立打包組合失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReserveBundle = async () => {
    if (!reservingBundle) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const now = Date.now();
      let meetupAt = new Date(now + 5 * 60_000).toISOString();
      if (timePreset === 'soon_1h') {
        meetupAt = new Date(now + 60 * 60_000).toISOString();
      } else if (timePreset === 'tomorrow_14') {
        const tomorrow = new Date(now + 86400_000);
        tomorrow.setHours(14, 0, 0, 0);
        meetupAt = tomorrow.toISOString();
      } else if (timePreset === 'custom') {
        const parsed = new Date(customDateTime);
        meetupAt = Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
      }

      await apiFetch('/api/v1/transactions/reserve', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'bundle',
          bundleId: reservingBundle.id,
          hotspotId,
          meetupAt,
          riskAcknowledged: riskAck,
          expectedVersion: reservingBundle.version,
        }),
      });
      setReservingBundle(null);
      setRiskAck(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '預約打包組合失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            畢業季整批打包轉讓
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            即將退租或畢業離校的學長姐，將 2–10 件宿舍與租屋好物打包以低於單品總和的優惠價一次轉讓，省去分開面交的麻煩。
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!currentUser) {
              onRequireAuth();
              return;
            }
            setShowBuilder(!showBuilder);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          <PackagePlus className="w-4 h-4" />
          <span>{showBuilder ? '收起打包精靈' : '建立畢業打包組合'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          {error}
        </div>
      )}

      {showBuilder && (
        <form
          onSubmit={handleCreateBundle}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              建立多件商品打包組合（勾選 2–10 件上架中商品）
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              已選 {selectedIds.length} 件 · 單品原價總和 NT$ {originalSum.toLocaleString()}
            </span>
          </div>

          {eligibleProducts.length < 2 ? (
            <p className="text-sm text-slate-600 py-4">
              您目前名下尚未有足夠的上架中單品（需至少 2 件未打包之「上架中」商品）。請先透過上方「AI 拍照上架」新增單品，或切換為「陳學長」帳號體驗。
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {eligibleProducts.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? 'border-emerald-800 bg-emerald-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(item.id)}
                        className="rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {item.title}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-600">
                          NT$ {item.price.toLocaleString()} · {item.conditionLevel}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="bundle-title" className="block text-xs font-medium text-slate-700 mb-1">
                    打包組合名稱
                  </label>
                  <input
                    id="bundle-title"
                    type="text"
                    required
                    value={bundleTitle}
                    onChange={(e) => setBundleTitle(e.target.value)}
                    placeholder="例如：水源宿舍退租・電風扇＋檯燈組"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="bundle-price" className="block text-xs font-medium text-slate-700 mb-1">
                    整包優惠總價（需低於 NT$ {originalSum}）
                  </label>
                  <input
                    id="bundle-price"
                    type="number"
                    required
                    min={10}
                    value={bundlePrice}
                    onChange={(e) => setBundlePrice(e.target.value)}
                    placeholder="優惠價"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="bundle-mode" className="block text-xs font-medium text-slate-700 mb-1">
                    銷售模式
                  </label>
                  <select
                    id="bundle-mode"
                    value={salesMode}
                    onChange={(e) =>
                      setSalesMode(e.target.value as 'allow_individual' | 'bundle_only')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="allow_individual">支援單買（單品售出自動重算）</option>
                    <option value="bundle_only">僅限整包帶走</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="bundle-zone" className="block text-xs font-medium text-slate-700 mb-1">
                    自取區域標註
                  </label>
                  <select
                    id="bundle-zone"
                    value={pickupZone}
                    onChange={(e) => setPickupZone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {PICKUP_ZONES.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBuilder(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedIds.length < 2}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {submitting ? '建立中...' : '發布畢業打包組合'}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* Bundles List */}
      <div className="space-y-6">
        {bundles.filter((b) => b.status !== 'Deactivated').length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-600">
            目前尚未有進行中的畢業季打包組合。
          </div>
        ) : (
          bundles
            .filter((b) => b.status !== 'Deactivated')
            .map((bundle) => {
              const savings = bundle.originalTotalPrice - bundle.bundlePrice;
              const isOwner = currentUser?.id === bundle.sellerId;
              return (
                <article
                  key={bundle.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500">
                        {bundle.salesMode === 'bundle_only' ? '僅限整包帶走' : '支援整包或單買'} ·{' '}
                        自取區域：{bundle.pickupZone} ·{' '}
                        {bundle.seller
                          ? `${bundle.seller.displayName}（${bundle.seller.university}認證 · 信用 ${bundle.seller.creditScore}）`
                          : ''}
                      </div>
                      <h2 className="font-display text-xl font-bold text-slate-900 mt-1.5">
                        {bundle.title}
                      </h2>
                      <p className="text-sm text-slate-600 mt-2 max-w-3xl">{bundle.description}</p>
                    </div>

                    <div className="shrink-0 lg:text-right">
                      <div className="text-xs text-slate-500 line-through font-mono tabular-nums">
                        單品總和 NT$ {bundle.originalTotalPrice.toLocaleString()}
                      </div>
                      <div className="font-mono text-2xl font-bold tabular-nums text-emerald-900">
                        NT$ {bundle.bundlePrice.toLocaleString()}
                      </div>
                      <div className="text-xs font-medium text-emerald-800 mt-0.5 font-mono tabular-nums">
                        整包現省 NT$ {savings.toLocaleString()}（共 {bundle.items.length} 件）
                      </div>
                    </div>
                  </div>

                  {/* Constituent items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                    {bundle.items.map((item) => (
                      <div
                        key={item.id}
                        className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50"
                      >
                        <div className="aspect-4/3 bg-white">
                          <SafeImage
                            src={item.images[0]}
                            alt={item.title}
                            fallbackTitle={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-3">
                          <div className="text-xs text-slate-500">
                            {item.category} · {item.conditionLevel}
                          </div>
                          <div className="text-sm font-medium text-slate-900 truncate mt-0.5">
                            {item.title}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-600 mt-1">
                            單買價 NT$ {item.price.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                    <span className="text-xs font-medium text-slate-600">
                      目前狀態：
                      {bundle.status === 'Listed'
                        ? '開放整包預約中'
                        : bundle.status === 'Pending_Confirm'
                          ? '待賣家確認預約'
                          : bundle.status === 'Reserved'
                            ? '已鎖定面交中'
                            : '已成交售出'}
                    </span>

                    {bundle.status === 'Listed' && !isOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!currentUser) {
                            onRequireAuth();
                            return;
                          }
                          setReservingBundle(bundle);
                        }}
                        className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>預約整批打包帶走</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
        )}
      </div>

      {/* Bundle Reservation Dialog */}
      {reservingBundle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-display text-lg font-bold text-slate-900">
              確認預約畢業打包組合
            </h3>
            <p className="text-sm text-slate-600">
              {reservingBundle.title}（NT$ {reservingBundle.bundlePrice.toLocaleString()}）
            </p>

            <div>
              <label htmlFor="bundle-hs" className="block text-xs font-semibold text-slate-800 mb-1">
                選擇校內安全面交熱點
              </label>
              <select
                id="bundle-hs"
                value={hotspotId}
                onChange={(e) => setHotspotId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {hotspots.map((hs) => (
                  <option key={hs.id} value={hs.id}>
                    {hs.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="bundle-time" className="block text-xs font-semibold text-slate-800 mb-1">
                約定面交時段
              </label>
              <select
                id="bundle-time"
                value={timePreset}
                onChange={(e) =>
                  setTimePreset(e.target.value as 'now_5m' | 'soon_1h' | 'tomorrow_14' | 'custom')
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="now_5m">5 分鐘後（立即前往熱點面交簽到）</option>
                <option value="soon_1h">1 小時後（若臨時取消將依規則扣 5 分）</option>
                <option value="tomorrow_14">明天 14:00（標準提前預約）</option>
                <option value="custom">自訂日期與時間</option>
              </select>

              {timePreset === 'custom' && (
                <div className="mt-2">
                  <label htmlFor="bundle-custom-datetime" className="block text-xs text-slate-600 mb-1">
                    選擇面交日期與時間
                  </label>
                  <input
                    id="bundle-custom-datetime"
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              )}
            </div>

            {currentUser?.isRestricted && (
              <label className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskAck}
                  onChange={(e) => setRiskAck(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                  高違約風險提示確認：低信用受限帳號最多僅能同時預約 1 件／組商品。
                </span>
              </label>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReservingBundle(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleReserveBundle}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
              >
                {submitting ? '預約中...' : '送出整包預約'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
