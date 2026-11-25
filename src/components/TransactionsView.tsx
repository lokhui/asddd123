import { useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  QrCode,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Star,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PublicUserSummary, Transaction, TransactionStatus } from '../types';

interface TransactionsViewProps {
  currentUser: PublicUserSummary | null;
  transactions: Transaction[];
  onRefresh: () => void;
  onRequireAuth: () => void;
}

const STATUS_DISPLAY: Record<TransactionStatus, string> = {
  Pending_Confirm: '待賣家確認',
  Reserved: '預約鎖定中',
  Checked_In: '面交已簽到',
  Completed: '交易已完成',
  Cancelled: '已取消',
  Disputed: '申訴處理中',
};

const STATE_STEPS: TransactionStatus[] = [
  'Pending_Confirm',
  'Reserved',
  'Checked_In',
  'Completed',
];

export function TransactionsView({
  currentUser,
  transactions,
  onRefresh,
  onRequireAuth,
}: TransactionsViewProps) {
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Seller QR display state
  const [qrModal, setQrModal] = useState<{
    transactionId: string;
    qrDataUrl: string;
    qrToken: string;
  } | null>(null);

  // Buyer QR Scanner state
  const [scanTxId, setScanTxId] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Mutual Completion & Rating Modal state
  const [rateTx, setRateTx] = useState<Transaction | null>(null);
  const [rating, setRating] = useState(5);
  const [accurateDescription, setAccurateDescription] = useState(true);
  const [comment, setComment] = useState('準時面交、實物與描述相符！');

  // Dispute Modal state
  const [disputeTx, setDisputeTx] = useState<Transaction | null>(null);
  const [disputeReasonType, setDisputeReasonType] = useState<'no_show' | 'item_mismatch'>('no_show');
  const [disputeDesc, setDisputeDesc] = useState('');

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleSellerDecision = async (txId: string, decision: 'accept' | 'reject') => {
    setError('');
    setFeedback('');
    setBusyId(txId);
    try {
      await apiFetch(`/api/v1/transactions/${txId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setFeedback(
        decision === 'accept'
          ? '已接受預約並鎖定商品（狀態轉為 Reserved）！'
          : '已婉拒預約，商品已重新釋出至市集。'
      );
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (tx: Transaction) => {
    setError('');
    setFeedback('');
    setBusyId(tx.id);
    try {
      const res = await apiFetch<{ creditPenaltyLog?: { delta: number } | null }>(
        `/api/v1/transactions/${tx.id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: '使用者主動取消預約' }),
        }
      );
      if (res.creditPenaltyLog) {
        setFeedback(
          `已取消預約。因距離面交時間不足 2 小時，系統自動扣除 ${Math.abs(res.creditPenaltyLog.delta)} 分並寫入信用帳本。`
        );
      } else {
        setFeedback('已取消預約，商品已重新回到上架中狀態。');
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失敗');
    } finally {
      setBusyId(null);
    }
  };

  const handleShowQr = async (txId: string) => {
    setError('');
    setBusyId(txId);
    try {
      const res = await apiFetch<{
        transactionId: string;
        qrDataUrl: string;
        qrToken: string;
      }>(`/api/v1/transactions/${txId}/qr`);
      setQrModal(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生 QR Code 失敗');
    } finally {
      setBusyId(null);
    }
  };

  const submitCheckinToken = async (txId: string, token: string) => {
    setError('');
    setFeedback('');
    setBusyId(txId);
    try {
      await apiFetch(`/api/v1/transactions/${txId}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ qrToken: token }),
      });
      stopCamera();
      setScanTxId(null);
      setManualToken('');
      setFeedback('面交 QR Code 掃碼簽到成功！狀態已轉為「面交已簽到 (Checked_In)」。');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '簽到驗證失敗');
    } finally {
      setBusyId(null);
    }
  };

  const startCameraScan = async (txId: string) => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          scanVideoFrame(txId);
        }
      });
    } catch {
      setError('無法開啟相機（請確認權限），您可直接上傳 QR Code 圖片或貼上簽到碼。');
    }
  };

  const scanVideoFrame = (txId: string) => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height);
        if (decoded?.data) {
          submitCheckinToken(txId, decoded.data);
          return;
        }
      }
    }
    requestAnimationFrame(() => scanVideoFrame(txId));
  };

  const handleQrImageUpload = async (txId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      if (!code?.data) {
        setError('圖片中無法辨識出有效 QR Code');
        return;
      }
      await submitCheckinToken(txId, code.data);
    } catch {
      setError('讀取 QR Code 圖片失敗');
    } finally {
      URL.revokeObjectURL(url);
      e.target.value = '';
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateTx) return;
    setError('');
    setBusyId(rateTx.id);
    try {
      const res = await apiFetch<{ settled: boolean; creditEntries: Array<{ delta: number }> }>(
        `/api/v1/transactions/${rateTx.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating,
            accurateDescription,
            comment,
          }),
        }
      );
      setRateTx(null);
      setFeedback(
        res.settled
          ? '雙方皆已確認完成並互評！交易狀態轉為 Completed，信用積分已即時入帳並寫入歷史定價資料庫。'
          : '已送出您的確認與評價，待對方也點擊確認完成後即完成結算加分。'
      );
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '完成結算失敗');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeTx) return;
    setError('');
    setBusyId(disputeTx.id);
    try {
      await apiFetch(`/api/v1/transactions/${disputeTx.id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({
          reasonType: disputeReasonType,
          description: disputeDesc,
        }),
      });
      setDisputeTx(null);
      setDisputeDesc('');
      setFeedback('已提交申訴案件至管理後台（若為逾時 >15 分鐘未簽到放鳥，系統已依時間戳記自動處理）。');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出申訴失敗');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          交易狀態機與面交 QR Code 核銷
        </h1>
        <p className="text-sm text-slate-600 mt-1.5 max-w-3xl">
          嚴格遵循 Pending_Confirm → Reserved → Checked_In → Completed 狀態機。預約鎖定後由賣家出示含 HMAC 簽章之動態 QR Code，買家現場掃碼留存準時簽到時間戳記並完成雙向互評。
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          {error}
        </div>
      )}
      {feedback && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {feedback}
        </div>
      )}

      {!currentUser ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <p className="text-sm text-slate-600">
            請先驗證或切換為學生身分（例如「林同學」或「陳學長」），即可檢視進行中的面交預約與體驗 QR Code 核銷。
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
          >
            驗證校園信箱
          </button>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-600">
          您目前尚未有任何預約或進行中的交易紀錄。
        </div>
      ) : (
        <div className="space-y-5">
          {transactions.map((tx) => {
            const isSeller = tx.sellerId === currentUser.id;
            const isBuyer = tx.buyerId === currentUser.id;
            const hoursUntilMeetup = (new Date(tx.meetupAt).getTime() - Date.now()) / 3600_000;
            const isLateCancelZone = tx.status === 'Reserved' && hoursUntilMeetup < 2;
            const myConfirmed = isBuyer ? tx.buyerConfirmedComplete : tx.sellerConfirmedComplete;

            const currentStepIdx = STATE_STEPS.indexOf(tx.status);

            return (
              <article
                key={tx.id}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      {isSeller ? '您為賣家' : '您為買家'} ·{' '}
                      <span className="font-semibold text-slate-900">
                        {STATUS_DISPLAY[tx.status]}
                      </span>{' '}
                      · 交易編號 <span className="font-mono">{tx.id}</span>
                    </div>
                    <h2 className="font-display text-lg font-bold text-slate-900 mt-1">
                      {tx.itemTitle}
                    </h2>
                    <div className="text-xs text-slate-600 mt-1.5 space-y-0.5">
                      <div>面交熱點：{tx.hotspotName}</div>
                      <div className="font-mono tabular-nums">
                        約定時間：{new Date(tx.meetupAt).toLocaleString('zh-TW')}
                      </div>
                      <div>
                        交易對象：
                        {isSeller
                          ? tx.buyer
                            ? `${tx.buyer.displayName}（${tx.buyer.university} · 信用 ${tx.buyer.creditScore} 分）`
                            : '買家'
                          : tx.seller
                            ? `${tx.seller.displayName}（${tx.seller.university} · 信用 ${tx.seller.creditScore} 分）`
                            : '賣家'}
                      </div>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0">
                    <div className="font-mono text-xl font-bold tabular-nums text-slate-900">
                      NT$ {tx.amount.toLocaleString()}
                    </div>
                    {tx.buyerCheckedInAt && (
                      <div className="text-xs text-emerald-900 mt-1 font-mono tabular-nums">
                        已簽到：{new Date(tx.buyerCheckedInAt).toLocaleTimeString('zh-TW')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4-step visual state stepper */}
                {tx.status !== 'Cancelled' && tx.status !== 'Disputed' && (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {STATE_STEPS.map((st, idx) => {
                      const reached = currentStepIdx >= idx;
                      return (
                        <div key={st} className="space-y-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              reached ? 'bg-emerald-900' : 'bg-slate-200'
                            }`}
                          />
                          <div
                            className={`text-[11px] font-medium ${
                              reached ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {STATUS_DISPLAY[st]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Low-credit alert for seller */}
                {isSeller && tx.status === 'Pending_Confirm' && tx.buyer?.isRestricted && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      買家信用分為 {tx.buyer.creditScore} 分（低於 70 分受限帳號），您有權評估風險並優先拒絕此預約。
                    </span>
                  </div>
                )}

                {/* Action bar by role & state */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Seller Pending_Confirm */}
                    {isSeller && tx.status === 'Pending_Confirm' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === tx.id}
                          onClick={() => handleSellerDecision(tx.id, 'accept')}
                          className="px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
                        >
                          接受預約並鎖定商品
                        </button>
                        <button
                          type="button"
                          disabled={busyId === tx.id}
                          onClick={() => handleSellerDecision(tx.id, 'reject')}
                          className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          婉拒預約
                        </button>
                      </>
                    )}

                    {/* Seller Reserved -> Show Dynamic HMAC QR */}
                    {isSeller && tx.status === 'Reserved' && (
                      <button
                        type="button"
                        disabled={busyId === tx.id}
                        onClick={() => handleShowQr(tx.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>出示面交動態 QR Code</span>
                      </button>
                    )}

                    {/* Buyer Reserved -> Scan QR Check-in */}
                    {isBuyer && tx.status === 'Reserved' && (
                      <button
                        type="button"
                        disabled={busyId === tx.id}
                        onClick={() => {
                          setScanTxId(tx.id);
                          setManualToken('');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>掃描賣家 QR Code 簽到</span>
                      </button>
                    )}

                    {/* Checked_In -> Mutual Completion & Review */}
                    {tx.status === 'Checked_In' && !myConfirmed && (
                      <button
                        type="button"
                        disabled={busyId === tx.id}
                        onClick={() => setRateTx(tx)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>確認驗貨付款完成並互評</span>
                      </button>
                    )}

                    {tx.status === 'Checked_In' && myConfirmed && (
                      <span className="text-xs text-emerald-900 font-medium">
                        您已完成確認評價，等待對方點擊確認後即入帳信用加分
                      </span>
                    )}
                  </div>

                  {/* Cancel & Dispute secondary controls */}
                  <div className="flex items-center gap-3">
                    {(tx.status === 'Pending_Confirm' || tx.status === 'Reserved') && (
                      <button
                        type="button"
                        disabled={busyId === tx.id}
                        onClick={() => handleCancel(tx)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-red-700 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>
                          {isLateCancelZone ? '臨時取消（<2hr 將扣 5 分）' : '取消預約'}
                        </span>
                      </button>
                    )}

                    {(tx.status === 'Reserved' || tx.status === 'Checked_In') && (
                      <button
                        type="button"
                        onClick={() => setDisputeTx(tx)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>回報放鳥／實物不符申訴</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Seller Dynamic QR Code Modal */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 text-center space-y-4 shadow-xl">
            <h3 className="font-display text-lg font-bold text-slate-900">
              動態面交簽到 QR Code
            </h3>
            <p className="text-xs text-slate-600">
              內含交易編號與 HMAC-SHA256 時效簽章（30 分鐘有效），請由買家現場掃描簽到。
            </p>
            <div className="flex justify-center">
              <img
                src={qrModal.qrDataUrl}
                alt="面交動態 QR Code"
                className="w-56 h-56 border border-slate-200 rounded-lg p-2 bg-white"
              />
            </div>

            <div className="text-left bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500">
                HMAC 簽章憑證（可複製供買家帳號掃碼實測）：
              </div>
              <div className="font-mono text-[11px] text-slate-800 break-all line-clamp-2">
                {qrModal.qrToken}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(qrModal.qrToken);
                  setFeedback('已複製動態簽到憑證！請切換為買家身分後於「掃描賣家 QR Code 簽到」貼上核銷。');
                }}
                className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
              >
                複製簽到憑證字串
              </button>
            </div>

            <button
              type="button"
              onClick={() => setQrModal(null)}
              className="w-full py-2 text-sm font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Buyer QR Scanner Modal */}
      {scanTxId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-display text-lg font-bold text-slate-900">
              掃描賣家 QR Code 完成面交簽到
            </h3>

            {cameraActive ? (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  className="w-full aspect-4/3 bg-slate-900 rounded-lg object-cover"
                  muted
                  playsInline
                />
                <button
                  type="button"
                  onClick={stopCamera}
                  className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  停止相機掃描
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startCameraScan(scanTxId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>開啟鏡頭即時掃碼</span>
                </button>

                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer">
                  <span>上傳 QR 截圖解析</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQrImageUpload(scanTxId, e)}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label htmlFor="manual-qr-token" className="block text-xs font-medium text-slate-700">
                或貼上賣家動態 QR 簽到憑證（桌面驗證模式）
              </label>
              <textarea
                id="manual-qr-token"
                rows={2}
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="貼上賣家出示的 HMAC 簽章 Token..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setScanTxId(null);
                }}
                className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!manualToken.trim() || busyId === scanTxId}
                onClick={() => submitCheckinToken(scanTxId, manualToken)}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                確認簽到
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mutual Completion & Rating Modal */}
      {rateTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCompleteSubmit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              確認完成面交與雙向互評
            </h3>
            <p className="text-xs text-slate-600">
              雙方皆完成確認後，系統將把狀態轉為 Completed，並自動為雙方增加 +2 信用分（實物完全相符五星好評賣家再 +1 分）。
            </p>

            <div>
              <span className="block text-xs font-semibold text-slate-800 mb-1.5">給予星等評分</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`p-1.5 rounded cursor-pointer ${
                      star <= rating ? 'text-amber-500' : 'text-slate-300'
                    }`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
                <span className="text-xs font-mono tabular-nums text-slate-700 ml-1">
                  {rating} / 5 星
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={accurateDescription}
                onChange={(e) => setAccurateDescription(e.target.checked)}
              />
              <span>實物與描述完全相符（五星好評可額外回饋賣家 +1 信用分）</span>
            </label>

            <div>
              <label htmlFor="rate-comment" className="block text-xs font-medium text-slate-700 mb-1">
                交易評語
              </label>
              <input
                id="rate-comment"
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRateTx(null)}
                className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busyId === rateTx.id}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer"
              >
                送出確認與評價
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dispute Filing Modal */}
      {disputeTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleDisputeSubmit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              回報違規或提出交易申訴
            </h3>
            <div>
              <label htmlFor="disp-type" className="block text-xs font-medium text-slate-700 mb-1">
                申訴類型
              </label>
              <select
                id="disp-type"
                value={disputeReasonType}
                onChange={(e) => setDisputeReasonType(e.target.value as 'no_show' | 'item_mismatch')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="no_show">面交逾時 15 分鐘未到（無故放鳥 -15 分）</option>
                <option value="item_mismatch">實物嚴重不符／疑似詐欺（管理員複核 -30 分）</option>
              </select>
            </div>
            <div>
              <label htmlFor="disp-desc" className="block text-xs font-medium text-slate-700 mb-1">
                事件說明
              </label>
              <textarea
                id="disp-desc"
                rows={3}
                required
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
                placeholder="請說明抵達時間、等待狀況或實物落差..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDisputeTx(null)}
                className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busyId === disputeTx.id}
                className="px-5 py-2 text-sm font-medium text-white bg-amber-800 hover:bg-amber-900 rounded-lg cursor-pointer"
              >
                送出申訴
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
