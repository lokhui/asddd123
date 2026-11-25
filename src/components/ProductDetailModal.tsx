import { useState } from 'react';
import { X, MapPin, ShieldCheck, AlertTriangle, Lock, Zap } from 'lucide-react';
import { apiFetch, getAuthToken } from '../lib/api';
import { SafeImage } from './SafeImage';
import type { Product, PublicUserSummary, SafeHotspot } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  currentUser: PublicUserSummary | null;
  hotspots: SafeHotspot[];
  onClose: () => void;
  onReserved: () => void;
  onRequireAuth: () => void;
  onInspectSellerCredit: (userId: string) => void;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function ProductDetailModal({
  product,
  currentUser,
  hotspots,
  onClose,
  onReserved,
  onRequireAuth,
  onInspectSellerCredit,
}: ProductDetailModalProps) {
  const [hotspotId, setHotspotId] = useState(hotspots[0]?.id ?? 'hs_ntu_lib');
  const [timePreset, setTimePreset] = useState<'now_5m' | 'soon_1h' | 'tomorrow_14' | 'custom'>('now_5m');
  const [customDateTime, setCustomDateTime] = useState(() =>
    toLocalDateTimeInputValue(new Date(Date.now() + 2 * 3600_000))
  );
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [raceResult, setRaceResult] = useState<{ winner: string; loser: string } | null>(null);

  if (!product) return null;

  const computeMeetupIso = () => {
    const now = Date.now();
    if (timePreset === 'now_5m') return new Date(now + 5 * 60_000).toISOString();
    if (timePreset === 'soon_1h') return new Date(now + 60 * 60_000).toISOString();
    if (timePreset === 'custom') {
      const parsed = new Date(customDateTime);
      return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
    }
    const tomorrow = new Date(now + 86400_000);
    tomorrow.setHours(14, 0, 0, 0);
    return tomorrow.toISOString();
  };

  const selectedHotspot = hotspots.find((h) => h.id === hotspotId) ?? hotspots[0];
  const isOwner = currentUser?.id === product.sellerId;
  const isListed = product.status === 'Listed';

  const handleReserve = async () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/transactions/reserve', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'product',
          productId: product.id,
          hotspotId: selectedHotspot?.id,
          meetupAt: computeMeetupIso(),
          riskAcknowledged,
          expectedVersion: product.version,
        }),
      });
      onReserved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '預約失敗');
    } finally {
      setSubmitting(false);
    }
  };

  // Real AC-02 concurrency test: fires two parallel POST /api/v1/transactions/reserve requests
  const handleSimulateConcurrency = async () => {
    setError('');
    setRaceResult(null);
    setSubmitting(true);
    try {
      const buyerA = await apiFetch<{ token: string }>('/api/v1/auth/demo-session', {
        method: 'POST',
        body: JSON.stringify({ userId: 'stu_lin' }),
      });
      const buyerB = await apiFetch<{ token: string }>('/api/v1/auth/demo-session', {
        method: 'POST',
        body: JSON.stringify({ userId: 'stu_wu_nthu' }),
      });

      const payload = JSON.stringify({
        targetType: 'product',
        productId: product.id,
        hotspotId: selectedHotspot?.id ?? 'hs_ntu_lib',
        meetupAt: computeMeetupIso(),
        riskAcknowledged: true,
        expectedVersion: product.version,
      });

      const [resA, resB] = await Promise.allSettled([
        apiFetch('/api/v1/transactions/reserve', {
          method: 'POST',
          body: payload,
          overrideToken: buyerA.token,
        }),
        apiFetch('/api/v1/transactions/reserve', {
          method: 'POST',
          body: payload,
          overrideToken: buyerB.token,
        }),
      ]);

      const formatOutcome = (label: string, r: PromiseSettledResult<unknown>) =>
        r.status === 'fulfilled'
          ? `${label}：預約成功（已進入鎖定狀態）`
          : `${label}：${r.reason instanceof Error ? r.reason.message : '被系統阻擋'}`;

      setRaceResult({
        winner: formatOutcome('買家 A（林同學）', resA),
        loser: formatOutcome('買家 B（吳同學）', resB),
      });

      // Refresh marketplace state if current token was set
      if (getAuthToken()) {
        onReserved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '併發測試失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl my-8 overflow-hidden shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left: Product gallery */}
          <div className="md:col-span-6 bg-slate-100 p-6 flex flex-col justify-between">
            <div className="aspect-4/3 rounded-lg overflow-hidden bg-white border border-slate-200">
              <SafeImage
                src={product.images[0]}
                alt={product.title}
                fallbackTitle={product.title}
                className="w-full h-full object-cover"
              />
            </div>

            {product.seller && (
              <div className="mt-5 pt-4 border-t border-slate-200">
                <div className="text-xs text-slate-500">賣家校園信用擔保</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {product.seller.displayName}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {product.seller.verifiedBadge} ·{' '}
                      <span className="font-mono tabular-nums">
                        信用 {product.seller.creditScore} 分
                      </span>{' '}
                      ·{' '}
                      <span className="font-mono tabular-nums">
                        履約率 {product.seller.fulfillmentRate}%
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onInspectSellerCredit(product.seller!.id);
                    }}
                    className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    查看信用帳本
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Contiguous Purchase & Reservation Module */}
          <div className="md:col-span-6 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-xs text-slate-500">
                  {product.category} · {product.conditionLevel} · {product.pickupZone}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="關閉商品詳情"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h2 id="pdp-title" className="font-display text-xl font-bold text-slate-900 mt-2">
                {product.title}
              </h2>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
                  NT$ {product.price.toLocaleString()}
                </span>
                {product.estimatedMinPrice && product.estimatedMaxPrice && (
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    校內建議區間 NT$ {product.estimatedMinPrice.toLocaleString()}–
                    {product.estimatedMaxPrice.toLocaleString()}
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm text-slate-700 leading-relaxed">{product.description}</p>

              {/* Safe Meetup Hotspot & Time Selector */}
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <label htmlFor="reserve-hotspot" className="block text-xs font-semibold text-slate-800 mb-1">
                    選擇校內安全面交熱點
                  </label>
                  <select
                    id="reserve-hotspot"
                    value={hotspotId}
                    onChange={(e) => setHotspotId(e.target.value)}
                    disabled={!isListed || isOwner}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-2 focus:outline-emerald-800"
                  >
                    {hotspots.map((hs) => (
                      <option key={hs.id} value={hs.id}>
                        {hs.name}（{hs.hasCctv ? '有監視器' : '無監視器'} · {hs.lightingLevel}）
                      </option>
                    ))}
                  </select>
                  {selectedHotspot && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                      <span>
                        {selectedHotspot.area} · 開放時間 {selectedHotspot.hours}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="reserve-time" className="block text-xs font-semibold text-slate-800 mb-1">
                    約定面交時段
                  </label>
                  <select
                    id="reserve-time"
                    value={timePreset}
                    onChange={(e) =>
                      setTimePreset(
                        e.target.value as 'now_5m' | 'soon_1h' | 'tomorrow_14' | 'custom'
                      )
                    }
                    disabled={!isListed || isOwner}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-2 focus:outline-emerald-800"
                  >
                    <option value="now_5m">5 分鐘後（立即前往熱點面交簽到）</option>
                    <option value="soon_1h">1 小時後（若臨時取消將依規則扣 5 分）</option>
                    <option value="tomorrow_14">明天 14:00（標準提前預約）</option>
                    <option value="custom">自訂日期與時間</option>
                  </select>

                  {timePreset === 'custom' && (
                    <div className="mt-2">
                      <label htmlFor="reserve-custom-datetime" className="block text-xs text-slate-600 mb-1">
                        選擇面交日期與時間
                      </label>
                      <input
                        id="reserve-custom-datetime"
                        type="datetime-local"
                        value={customDateTime}
                        min={toLocalDateTimeInputValue(new Date())}
                        onChange={(e) => setCustomDateTime(e.target.value)}
                        disabled={!isListed || isOwner}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg bg-white focus:outline-2 focus:outline-emerald-800"
                      />
                    </div>
                  )}
                </div>

                {/* Restricted user (< 70 credit) mandatory risk acknowledgment */}
                {currentUser?.isRestricted && isListed && !isOwner && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>低信用受限提醒（目前信用 {currentUser.creditScore} 分 &lt; 70 分）</span>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={riskAcknowledged}
                        onChange={(e) => setRiskAcknowledged(e.target.checked)}
                        className="mt-0.5 rounded border-amber-400"
                      />
                      <span>
                        高違約風險提示確認：我了解受限期間同時最多僅能預約 1 件商品，若再次爽約或遲到超過 15 分鐘將扣除 15 分信用分。
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {error}
                </div>
              )}

              {raceResult && (
                <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="font-semibold text-slate-900">併發預約樂觀鎖測試結果：</div>
                  <div className="text-emerald-900">{raceResult.winner}</div>
                  <div className="text-slate-700">{raceResult.loser}</div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 space-y-2.5">
              {!isListed ? (
                <div className="w-full py-2.5 px-4 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>
                    {product.status === 'Pending_Confirm'
                      ? '待賣家確認預約中（商品已鎖定）'
                      : product.status === 'Reserved'
                        ? '已預約鎖定面交中'
                        : '此商品已成交售出'}
                  </span>
                </div>
              ) : isOwner ? (
                <div className="w-full py-2.5 px-4 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium text-center">
                  這是您本人上架的商品
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleReserve}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{currentUser ? '發起校內面交預約' : '驗證 .edu.tw 後發起預約'}</span>
                </button>
              )}

              {isListed && !isOwner && product.sellerId !== 'stu_lin' && product.sellerId !== 'stu_wu_nthu' && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSimulateConcurrency}
                  className="w-full py-2 px-3 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-800" />
                  <span>模擬兩位同學同時搶購預約（測試樂觀鎖防超賣）</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
