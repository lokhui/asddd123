import { useEffect, useState } from 'react';
import {
  X,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Lock,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  apiFetch,
  getAdminToken,
  setAdminToken,
  setAuthToken,
  stripImageExif,
} from '../lib/api';
import type {
  AiAnalyzeResponse,
  DisputeCase,
  Product,
  PublicUserSummary,
  Transaction,
} from '../types';
import type { ActiveTab } from './TopBar';

export type DemoModeType = 'student' | 'admin' | null;

interface DemoWorkbenchProps {
  mode: DemoModeType;
  adminAuthVersion: number;
  onAdminAuthChange: () => void;
  onClose: () => void;
  onSwitchMode: (mode: DemoModeType) => void;
  products: Product[];
  onRefreshAll: () => Promise<void>;
  onNavigateTab: (tab: ActiveTab) => void;
  onOpenListingModal: () => void;
  onInspectUser: (userId: string) => void;
  onShowToast: (msg: string) => void;
}

type StepStatus = 'idle' | 'running' | 'done' | 'error';

interface StepOutcome {
  status: StepStatus;
  summary?: string;
  detail?: string;
}

export function DemoWorkbench({
  mode,
  adminAuthVersion,
  onAdminAuthChange,
  onClose,
  onSwitchMode,
  products,
  onRefreshAll,
  onNavigateTab,
  onOpenListingModal,
  onInspectUser,
  onShowToast,
}: DemoWorkbenchProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, StepOutcome>>({});
  const [demoQrPreview, setDemoQrPreview] = useState<{
    txId: string;
    qrDataUrl: string;
    qrToken: string;
  } | null>(null);
  const [resetting, setResetting] = useState(false);

  // Admin demo mode state
  const [adminStatus, setAdminStatus] = useState<{
    configured: boolean;
    source: 'env' | 'claimed' | 'unclaimed';
  } | null>(null);
  const [adminAuthed, setAdminAuthed] = useState(Boolean(getAdminToken()));
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminDisputes, setAdminDisputes] = useState<DisputeCase[]>([]);

  useEffect(() => {
    setCollapsed(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'admin') return;
    let active = true;
    const syncAdmin = async () => {
      try {
        const st = await apiFetch<{ configured: boolean; source: 'env' | 'claimed' | 'unclaimed' }>(
          '/api/v1/auth/admin-status'
        );
        if (!active) return;
        setAdminStatus(st);
        if (getAdminToken()) {
          const data = await apiFetch<{ disputes: DisputeCase[] }>('/api/v1/admin/disputes', {
            useAdminToken: true,
          });
          if (!active) return;
          setAdminDisputes(data.disputes);
          setAdminAuthed(true);
        } else {
          setAdminAuthed(false);
        }
      } catch {
        if (active) setAdminAuthed(false);
      }
    };
    syncAdmin();
    return () => {
      active = false;
    };
  }, [mode, adminAuthVersion]);

  if (!mode) return null;

  const setOutcome = (key: string, outcome: StepOutcome) => {
    setOutcomes((prev) => ({ ...prev, [key]: outcome }));
  };

  const getDemoSession = async (userId: string) => {
    return apiFetch<{ token: string; user: PublicUserSummary }>('/api/v1/auth/demo-session', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  };

  const handleResetDatabase = async () => {
    setResetting(true);
    try {
      await apiFetch('/api/v1/demo/reset', { method: 'POST' });
      setAuthToken(null);
      setOutcomes({});
      setDemoQrPreview(null);
      if (mode === 'admin' && getAdminToken()) {
        const data = await apiFetch<{ disputes: DisputeCase[] }>('/api/v1/admin/disputes', {
          useAdminToken: true,
        });
        setAdminDisputes(data.disputes);
      }
      await onRefreshAll();
      onNavigateTab(mode === 'admin' ? 'credit_admin' : 'marketplace');
      onShowToast('已將示範資料庫重置為初始狀態，所有測試案例皆可重新演練');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : '重置失敗');
    } finally {
      setResetting(false);
    }
  };

  // =========================================================================
  // STUDENT DEMO HANDLERS (01 ~ 06, NO ADMIN)
  // =========================================================================

  const runDemo1Auth = async () => {
    setOutcome('demo1', { status: 'running' });
    try {
      const randomNum = Math.floor(1000 + Math.random() * 8999);
      const email = `b1190${randomNum}@ntu.edu.tw`;
      const reqRes = await apiFetch<{ previewOtp?: string; university: string }>(
        '/api/v1/auth/request-otp',
        {
          method: 'POST',
          body: JSON.stringify({ email, displayName: `示範新生 ${randomNum}` }),
        }
      );
      if (!reqRes.previewOtp) {
        throw new Error('未取得預覽 OTP 驗證碼');
      }
      const verifyRes = await apiFetch<{ token: string; user: PublicUserSummary }>(
        '/api/v1/auth/verify-edu',
        {
          method: 'POST',
          body: JSON.stringify({ email, otp: reqRes.previewOtp }),
        }
      );
      setAuthToken(verifyRes.token);
      await onRefreshAll();
      onInspectUser(verifyRes.user.id);
      onNavigateTab('credit_admin');
      setOutcome('demo1', {
        status: 'done',
        summary: `已驗證 ${email}（OTP: ${reqRes.previewOtp}）`,
        detail: `建立帳號「${verifyRes.user.displayName}」，配發初始信用 ${verifyRes.user.creditScore} 分並寫入 Credit_Logs`,
      });
    } catch (err) {
      setOutcome('demo1', {
        status: 'error',
        summary: err instanceof Error ? err.message : '驗證示範失敗',
      });
    }
  };

  const runDemo2AiListing = async () => {
    setOutcome('demo2', { status: 'running' });
    try {
      const sess = await getDemoSession('stu_chen');
      setAuthToken(sess.token);

      const imgRes = await fetch('/src/assets/images/product_calculator_scientific_1795605809857.jpg');
      const blob = await imgRes.blob();
      const file = new File([blob], 'calc_demo.jpg', { type: 'image/jpeg' });
      const cleanDataUrl = await stripImageExif(file);

      const aiRes = await apiFetch<AiAnalyzeResponse>('/api/v1/products/ai-analyze', {
        method: 'POST',
        overrideToken: sess.token,
        body: JSON.stringify({
          imageDataUrl: cleanDataUrl,
          demoPresetKey: 'calculator',
        }),
      });

      const pubRes = await apiFetch<{ product: Product; matchedWishlistCount: number }>(
        '/api/v1/products',
        {
          method: 'POST',
          overrideToken: sess.token,
          body: JSON.stringify({
            title: aiRes.analysis.suggested_title,
            description: aiRes.analysis.suggested_description,
            category: aiRes.analysis.category,
            conditionLevel: aiRes.analysis.condition_level,
            price: aiRes.pricing.medianPrice,
            estimatedMinPrice: aiRes.pricing.minSuggested,
            estimatedMaxPrice: aiRes.pricing.maxSuggested,
            images: [cleanDataUrl],
            keywords: aiRes.analysis.keywords,
            pickupZone: '總圖書館一樓大廳',
          }),
        }
      );

      await onRefreshAll();
      onNavigateTab('marketplace');
      const modeTag =
        aiRes.analysisMode === 'demo_preset' ? '示範樣本辨識' : 'Gemini 視覺辨識';
      setOutcome('demo2', {
        status: 'done',
        summary: `${modeTag}為「${aiRes.analysis.category} · ${aiRes.analysis.condition_level}」並已發布`,
        detail: `文案 ${aiRes.analysis.suggested_description.length} 字 · 校內建議價 NT$ ${aiRes.pricing.minSuggested}–${aiRes.pricing.maxSuggested} · 配對 ${pubRes.matchedWishlistCount} 筆許願單`,
      });
    } catch (err) {
      setOutcome('demo2', {
        status: 'error',
        summary: err instanceof Error ? err.message : 'AI 上架示範失敗',
      });
    }
  };

  const runDemo3WishlistMatch = async () => {
    setOutcome('demo3', { status: 'running' });
    try {
      const buyerSess = await getDemoSession('stu_lin');
      setAuthToken(buyerSess.token);

      const kw = 'USB-C';
      const wlRes = await apiFetch<{ instantMatchCount: number }>('/api/v1/wishlists', {
        method: 'POST',
        overrideToken: buyerSess.token,
        body: JSON.stringify({
          keyword: kw,
          category: '3C 配件',
          maxPrice: 600,
        }),
      });

      await onRefreshAll();
      onNavigateTab('wishlist');
      setOutcome('demo3', {
        status: 'done',
        summary: `已為林同學建立「${kw}（預算 <= NT$ 600）」許願單`,
        detail: `系統自動配對到 ${wlRes.instantMatchCount} 件符合條件的架上商品，已推送至通知清單`,
      });
    } catch (err) {
      setOutcome('demo3', {
        status: 'error',
        summary: err instanceof Error ? err.message : '許願配對示範失敗',
      });
    }
  };

  const runDemo4Concurrency = async () => {
    setOutcome('demo4', { status: 'running' });
    try {
      const target = products.find(
        (p) => p.status === 'Listed' && p.sellerId !== 'stu_lin' && p.sellerId !== 'stu_wu_nthu'
      );
      if (!target) {
        throw new Error('目前沒有可搶購的 Listed 商品，請先點擊「重置示範資料」');
      }

      const [buyerA, buyerB] = await Promise.all([
        getDemoSession('stu_lin'),
        getDemoSession('stu_wu_nthu'),
      ]);

      const payload = JSON.stringify({
        targetType: 'product',
        productId: target.id,
        hotspotId: 'hs_ntu_lib',
        meetupAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        riskAcknowledged: true,
        expectedVersion: target.version,
      });

      const [resA, resB] = await Promise.allSettled([
        apiFetch('/api/v1/transactions/reserve', {
          method: 'POST',
          overrideToken: buyerA.token,
          body: payload,
        }),
        apiFetch('/api/v1/transactions/reserve', {
          method: 'POST',
          overrideToken: buyerB.token,
          body: payload,
        }),
      ]);

      setAuthToken(buyerA.token);
      await onRefreshAll();
      onNavigateTab('marketplace');

      const aText =
        resA.status === 'fulfilled'
          ? '買家 A（林同學）：預約成功並鎖定'
          : `買家 A：${resA.reason instanceof Error ? resA.reason.message : '失敗'}`;
      const bText =
        resB.status === 'fulfilled'
          ? '買家 B（吳同學）：預約成功並鎖定'
          : `買家 B（吳同學）：${resB.reason instanceof Error ? resB.reason.message : '被系統阻擋'}`;

      setOutcome('demo4', {
        status: 'done',
        summary: `標的：${target.title}`,
        detail: `${aText} ｜ ${bText}`,
      });
    } catch (err) {
      setOutcome('demo4', {
        status: 'error',
        summary: err instanceof Error ? err.message : '併發測試失敗',
      });
    }
  };

  const runDemo5aLateCancel = async () => {
    setOutcome('demo5a', { status: 'running' });
    try {
      const target = products.find((p) => p.status === 'Listed' && p.sellerId !== 'stu_lin');
      if (!target) {
        throw new Error('找不到可供預約取消測試的商品，請先「重置示範資料」');
      }
      const buyerSess = await getDemoSession('stu_lin');
      const sellerSess = await getDemoSession(target.sellerId);

      const reserveRes = await apiFetch<{ transaction: Transaction }>(
        '/api/v1/transactions/reserve',
        {
          method: 'POST',
          overrideToken: buyerSess.token,
          body: JSON.stringify({
            targetType: 'product',
            productId: target.id,
            hotspotId: 'hs_ntu_lib',
            meetupAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            riskAcknowledged: true,
            expectedVersion: target.version,
          }),
        }
      );

      await apiFetch(`/api/v1/transactions/${reserveRes.transaction.id}/confirm`, {
        method: 'POST',
        overrideToken: sellerSess.token,
        body: JSON.stringify({ decision: 'accept' }),
      });

      const cancelRes = await apiFetch<{ creditPenaltyLog?: { delta: number; balanceAfter: number } }>(
        `/api/v1/transactions/${reserveRes.transaction.id}/cancel`,
        {
          method: 'POST',
          overrideToken: buyerSess.token,
          body: JSON.stringify({ reason: '示範 2 小時內臨時取消預約' }),
        }
      );

      setAuthToken(buyerSess.token);
      await onRefreshAll();
      onInspectUser('stu_lin');
      onNavigateTab('credit_admin');

      setOutcome('demo5a', {
        status: 'done',
        summary: `距離面交 1 小時取消預約，系統自動扣 ${Math.abs(cancelRes.creditPenaltyLog?.delta ?? -5)} 分`,
        detail: `林同學最新信用餘額：${cancelRes.creditPenaltyLog?.balanceAfter ?? ''} 分（已寫入 Credit_Logs）`,
      });
    } catch (err) {
      setOutcome('demo5a', {
        status: 'error',
        summary: err instanceof Error ? err.message : '扣分測試失敗',
      });
    }
  };

  const runDemo5bRestricted = async () => {
    setOutcome('demo5b', { status: 'running' });
    try {
      const lowSess = await getDemoSession('stu_chang_low');
      setAuthToken(lowSess.token);

      const available = products.filter(
        (p) => p.status === 'Listed' && p.sellerId !== 'stu_chang_low'
      );
      if (available.length < 2) {
        throw new Error('需要至少 2 件上架中商品進行受限測試，請先「重置示範資料」');
      }

      const existingTx = await apiFetch<{ transactions: Transaction[] }>('/api/v1/transactions', {
        overrideToken: lowSess.token,
      });
      const activeCount = existingTx.transactions.filter(
        (t) =>
          t.buyerId === 'stu_chang_low' &&
          (t.status === 'Pending_Confirm' || t.status === 'Reserved' || t.status === 'Checked_In')
      ).length;

      let firstMsg = '已有 1 筆進行中預約';
      let secondIdx = 0;

      if (activeCount === 0) {
        await apiFetch('/api/v1/transactions/reserve', {
          method: 'POST',
          overrideToken: lowSess.token,
          body: JSON.stringify({
            targetType: 'product',
            productId: available[0].id,
            hotspotId: 'hs_ntu_gate',
            meetupAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
            riskAcknowledged: true,
            expectedVersion: available[0].version,
          }),
        });
        firstMsg = `第 1 件「${available[0].title.slice(0, 12)}...」已勾選風險確認並預約成功`;
        secondIdx = 1;
      }

      let blockedMsg = '';
      try {
        await apiFetch('/api/v1/transactions/reserve', {
          method: 'POST',
          overrideToken: lowSess.token,
          body: JSON.stringify({
            targetType: 'product',
            productId: available[secondIdx].id,
            hotspotId: 'hs_ntu_gate',
            meetupAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
            riskAcknowledged: true,
            expectedVersion: available[secondIdx].version,
          }),
        });
        blockedMsg = '未預期通過';
      } catch (blockErr) {
        blockedMsg = blockErr instanceof Error ? blockErr.message : '已阻擋';
      }

      await onRefreshAll();
      onNavigateTab('transactions');
      setOutcome('demo5b', {
        status: 'done',
        summary: `張同學（信用 65 分 < 70）：${firstMsg}`,
        detail: `嘗試預約第 2 件遭系統阻擋 → 「${blockedMsg}」`,
      });
    } catch (err) {
      setOutcome('demo5b', {
        status: 'error',
        summary: err instanceof Error ? err.message : '低信用受限測試失敗',
      });
    }
  };

  const runDemo6aGenerateQr = async () => {
    setOutcome('demo6a', { status: 'running' });
    try {
      const sellerSess = await getDemoSession('stu_chen');
      setAuthToken(sellerSess.token);

      const txRes = await apiFetch<{ transactions: Transaction[] }>('/api/v1/transactions', {
        overrideToken: sellerSess.token,
      });
      const targetTx = txRes.transactions.find(
        (t) => t.sellerId === 'stu_chen' && t.status === 'Reserved'
      );
      if (!targetTx) {
        throw new Error('找不到 Reserved 狀態的面交交易，請先點擊「重置示範資料」');
      }

      const qrRes = await apiFetch<{ transactionId: string; qrDataUrl: string; qrToken: string }>(
        `/api/v1/transactions/${targetTx.id}/qr`,
        { overrideToken: sellerSess.token }
      );
      setDemoQrPreview({
        txId: targetTx.id,
        qrDataUrl: qrRes.qrDataUrl,
        qrToken: qrRes.qrToken,
      });
      await onRefreshAll();
      onNavigateTab('transactions');
      setOutcome('demo6a', {
        status: 'done',
        summary: `已為交易 ${targetTx.id} 產生動態 HMAC QR Code`,
        detail: '請點擊下一步「步驟 B：買家掃碼簽到」完成核銷',
      });
    } catch (err) {
      setOutcome('demo6a', {
        status: 'error',
        summary: err instanceof Error ? err.message : '產生 QR Code 失敗',
      });
    }
  };

  const runDemo6bBuyerScan = async () => {
    setOutcome('demo6b', { status: 'running' });
    try {
      if (!demoQrPreview) {
        throw new Error('請先執行步驟 A 產生賣家動態 QR Code');
      }
      const buyerSess = await getDemoSession('stu_lin');
      setAuthToken(buyerSess.token);

      await apiFetch(`/api/v1/transactions/${demoQrPreview.txId}/checkin`, {
        method: 'POST',
        overrideToken: buyerSess.token,
        body: JSON.stringify({ qrToken: demoQrPreview.qrToken }),
      });

      await onRefreshAll();
      onNavigateTab('transactions');
      setOutcome('demo6b', {
        status: 'done',
        summary: '買家現場掃碼驗證 HMAC 簽章成功！',
        detail: '交易狀態已轉為 Checked_In（面交已簽到），並寫入雙方到場時間戳記',
      });
    } catch (err) {
      setOutcome('demo6b', {
        status: 'error',
        summary: err instanceof Error ? err.message : '掃碼簽到失敗',
      });
    }
  };

  const runDemo6cCompleteAndRate = async () => {
    setOutcome('demo6c', { status: 'running' });
    try {
      const buyerSess = await getDemoSession('stu_lin');
      const sellerSess = await getDemoSession('stu_chen');

      const txRes = await apiFetch<{ transactions: Transaction[] }>('/api/v1/transactions', {
        overrideToken: buyerSess.token,
      });
      const checkedInTx = txRes.transactions.find((t) => t.status === 'Checked_In');
      if (!checkedInTx) {
        throw new Error('請先完成步驟 B 掃碼簽到（Checked_In）');
      }

      await apiFetch(`/api/v1/transactions/${checkedInTx.id}/complete`, {
        method: 'POST',
        overrideToken: buyerSess.token,
        body: JSON.stringify({
          rating: 5,
          accurateDescription: true,
          comment: '實物與描述完全相符，準時面交！',
        }),
      });

      await apiFetch(`/api/v1/transactions/${checkedInTx.id}/complete`, {
        method: 'POST',
        overrideToken: sellerSess.token,
        body: JSON.stringify({
          rating: 5,
          accurateDescription: true,
          comment: '買家非常準時，交易順利。',
        }),
      });

      setAuthToken(buyerSess.token);
      await onRefreshAll();
      onInspectUser('stu_lin');
      onNavigateTab('credit_admin');
      setDemoQrPreview(null);

      setOutcome('demo6c', {
        status: 'done',
        summary: '雙向互評結算完成（Completed）！',
        detail: '買家與賣家信用分各 +2 分（賣家獲實物相符五星好評再 +1 分），成交價已納入歷史定價庫',
      });
    } catch (err) {
      setOutcome('demo6c', {
        status: 'error',
        summary: err instanceof Error ? err.message : '結算完成失敗',
      });
    }
  };

  // =========================================================================
  // ADMIN DEMO HANDLERS (System Admin Exclusive Mode)
  // =========================================================================

  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setOutcome('adminAuth', { status: 'running' });
    try {
      const endpoint =
        adminStatus?.source === 'unclaimed' ? '/api/v1/auth/admin-claim' : '/api/v1/auth/admin-login';
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ passcode: adminPasscode }),
      });
      setAdminToken(res.token);
      setAdminPasscode('');
      const data = await apiFetch<{ disputes: DisputeCase[] }>('/api/v1/admin/disputes', {
        useAdminToken: true,
      });
      setAdminDisputes(data.disputes);
      setAdminAuthed(true);
      onAdminAuthChange();
      onNavigateTab('credit_admin');
      setOutcome('adminAuth', {
        status: 'done',
        summary: '管理員權限已驗證解鎖',
        detail: `目前申訴佇列共 ${data.disputes.length} 筆案件`,
      });
    } catch (err) {
      setOutcome('adminAuth', {
        status: 'error',
        summary: err instanceof Error ? err.message : '管理員驗證失敗',
      });
    }
  };

  const refreshAdminDisputes = async () => {
    const data = await apiFetch<{ disputes: DisputeCase[] }>('/api/v1/admin/disputes', {
      useAdminToken: true,
    });
    setAdminDisputes(data.disputes);
    return data.disputes;
  };

  const runAdminDemo1SeedDispute = async () => {
    setOutcome('adm1', { status: 'running' });
    try {
      const buyerSess = await getDemoSession('stu_chang_low');
      const sellerSess = await getDemoSession('stu_chen');
      const target = products.find((p) => p.status === 'Listed' && p.sellerId === 'stu_chen');
      if (!target) {
        throw new Error('找不到可供建立申訴案件的陳學長上架商品，請先「重置示範資料」');
      }

      const resTx = await apiFetch<{ transaction: Transaction }>('/api/v1/transactions/reserve', {
        method: 'POST',
        overrideToken: buyerSess.token,
        body: JSON.stringify({
          targetType: 'product',
          productId: target.id,
          hotspotId: 'hs_ntu_gate',
          meetupAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          riskAcknowledged: true,
          expectedVersion: target.version,
        }),
      });

      await apiFetch(`/api/v1/transactions/${resTx.transaction.id}/confirm`, {
        method: 'POST',
        overrideToken: sellerSess.token,
        body: JSON.stringify({ decision: 'accept' }),
      });

      const dispRes = await apiFetch<{ dispute: DisputeCase }>(
        `/api/v1/transactions/${resTx.transaction.id}/dispute`,
        {
          method: 'POST',
          overrideToken: sellerSess.token,
          body: JSON.stringify({
            reasonType: 'item_mismatch',
            description: '示範申訴案件：買家現場惡意調包或實物嚴重不符，申請系統管理員介入仲裁。',
          }),
        }
      );

      await refreshAdminDisputes();
      await onRefreshAll();
      onAdminAuthChange();
      onNavigateTab('credit_admin');

      setOutcome('adm1', {
        status: 'done',
        summary: `已建立新申訴案件（${dispRes.dispute.id}）`,
        detail: `交易 ${resTx.transaction.id} 已進入 Disputed 狀態並送入下方審核佇列`,
      });
    } catch (err) {
      setOutcome('adm1', {
        status: 'error',
        summary: err instanceof Error ? err.message : '建立申訴案件失敗',
      });
    }
  };

  const runAdminDemo2Resolve = async (
    action: 'no_show_15' | 'fraud_30' | 'restore_5'
  ) => {
    const key = `adm_${action}`;
    setOutcome(key, { status: 'running' });
    try {
      const currentDisputes = await refreshAdminDisputes();
      const openCase = currentDisputes.find((d) => d.status === 'open');
      if (!openCase) {
        throw new Error('目前沒有待審核（open）的申訴案件，請先執行「Admin 01 產生待審核申訴案件」');
      }

      const res = await apiFetch<{ dispute: DisputeCase }>(
        `/api/v1/admin/disputes/${openCase.id}/resolve`,
        {
          method: 'POST',
          useAdminToken: true,
          body: JSON.stringify({ action }),
        }
      );

      await refreshAdminDisputes();
      await onRefreshAll();
      onAdminAuthChange();
      onInspectUser(openCase.reportedUserId);
      onNavigateTab('credit_admin');

      setOutcome(key, {
        status: 'done',
        summary: `已裁決案件 ${openCase.id}`,
        detail: res.dispute.resolution,
      });
    } catch (err) {
      setOutcome(key, {
        status: 'error',
        summary: err instanceof Error ? err.message : '仲裁執行失敗',
      });
    }
  };

  const runAdminDemo3AddHotspot = async () => {
    setOutcome('adm_hotspot', { status: 'running' });
    try {
      const suffix = Math.floor(10 + Math.random() * 89);
      const res = await apiFetch<{ hotspot: { name: string } }>('/api/v1/admin/hotspots', {
        method: 'POST',
        useAdminToken: true,
        body: JSON.stringify({
          name: `綜合體育館一樓服務台旁（示範熱點 #${suffix}）`,
          university: '國立臺灣大學',
          area: '新體運動區',
          hasCctv: true,
          lightingLevel: '高亮度照明',
          hours: '07:00 - 22:00',
        }),
      });
      await onRefreshAll();
      onAdminAuthChange();
      onNavigateTab('credit_admin');
      setOutcome('adm_hotspot', {
        status: 'done',
        summary: `已新增安全面交熱點：${res.hotspot.name}`,
        detail: '下方校內安全面交熱點清單與預約選單已即時同步更新',
      });
    } catch (err) {
      setOutcome('adm_hotspot', {
        status: 'error',
        summary: err instanceof Error ? err.message : '新增熱點失敗',
      });
    }
  };

  const renderStatus = (key: string) => {
    const o = outcomes[key];
    if (!o || o.status === 'idle') return null;
    if (o.status === 'running') {
      return (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>正在呼叫後端 API 執行實測...</span>
        </div>
      );
    }
    if (o.status === 'error') {
      return (
        <div className="mt-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{o.summary}</span>
        </div>
      );
    }
    return (
      <div className="mt-2 p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
        <div className="flex items-start gap-1.5 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800 shrink-0 mt-0.5" />
          <span>{o.summary}</span>
        </div>
        {o.detail && <p className="text-[11px] text-emerald-900 pl-5">{o.detail}</p>}
      </div>
    );
  };

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
      aria-label={mode === 'admin' ? '系統管理員示範模式控制台' : '一般用戶示範模式控制台'}
    >
      {/* Unified In-Page Demo Mode Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
            {mode === 'admin'
              ? '系統管理員（Admin）示範模式控制台'
              : '一般用戶示範模式控制台'}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {mode === 'admin'
              ? '所有管理員示範按鈕皆整合於本頁面內，點擊後即時同步下方申訴仲裁與熱點管理後台（不含學生買賣端功能）'
              : '所有用戶示範按鈕皆整合於本頁面內，點擊後立即更新下方市集、打包、許願、交易與信用帳本（不含系統管理員功能）'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchMode(mode === 'admin' ? 'student' : 'admin')}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer whitespace-nowrap"
          >
            <span>{mode === 'admin' ? '切換為用戶示範' : '切換為管理員示範'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            disabled={resetting}
            onClick={handleResetDatabase}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{resetting ? '重置中...' : '重置示範資料'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer whitespace-nowrap"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{collapsed ? '展開示範按鈕' : '收合示範按鈕'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉示範模式"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-md cursor-pointer whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            <span>關閉</span>
          </button>
        </div>
      </div>

      {/* Inline Demo Buttons Grid */}
      {!collapsed && (
        <div className="p-5 bg-slate-50/50">
          {mode === 'student' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* 01. .edu.tw OTP */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-900 font-semibold">
                    01 · FR-1.1 校園驗證
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    .edu.tw 信箱 OTP 註冊與雜湊綁定
                  </h3>
                  <p className="text-xs text-slate-600">
                    自動申請 6 位數驗證碼並完成註冊，領取 100 分初始信用並檢視個人帳本。
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={runDemo1Auth}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>執行校園信箱驗證示範</span>
                  </button>
                  {renderStatus('demo1')}
                </div>
              </div>

              {/* 02. AI Listing & P25-P75 */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-900 font-semibold">
                    02 · AC-01 AI 上架與定價
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    EXIF 清除、AI 辨識與 P25–P75 定價
                  </h3>
                  <p className="text-xs text-slate-600">
                    將實拍圖去除 EXIF 後送交多模態 AI 解析文案與歷史成交價格帶並上架。
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runDemo2AiListing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>一鍵 AI 辨識並上架</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const s = await getDemoSession('stu_chen');
                        setAuthToken(s.token);
                        await onRefreshAll();
                        onOpenListingModal();
                      }}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      手動開啟上架精靈
                    </button>
                  </div>
                  {renderStatus('demo2')}
                </div>
              </div>

              {/* 03. Bundle & Wishlist */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-900 font-semibold">
                    03 · FR-3.1 / 3.2 打包與許願
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    畢業季整批打包 & 許願自動配對
                  </h3>
                  <p className="text-xs text-slate-600">
                    示範建立買家許願條件即時配對通知，或切換至畢業季整批打包轉讓區。
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runDemo3WishlistMatch}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>示範許願自動配對</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('bundles')}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      <span>查看畢業打包區</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {renderStatus('demo3')}
                </div>
              </div>

              {/* 04. Concurrent Lock */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-900 font-semibold">
                    04 · AC-02 併發鎖定
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    雙人同時搶購樂觀鎖防超賣測試
                  </h3>
                  <p className="text-xs text-slate-600">
                    同時以買家 A（林同學）與買家 B（吳同學）對同一件商品發起平行預約請求。
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={runDemo4Concurrency}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>執行平行搶購併發測試</span>
                  </button>
                  {renderStatus('demo4')}
                </div>
              </div>

              {/* 05. Credit Penalty & Restricted User */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-900 font-semibold">
                    05 · AC-03 動態信用機制
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    臨陣取消扣分與低信用 (&lt;70) 限額阻擋
                  </h3>
                  <p className="text-xs text-slate-600">
                    驗證 2 小時內取消預約扣 5 分，及信用 65 分帳號最多僅能預約 1 件商品。
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runDemo5aLateCancel}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-amber-800 hover:bg-amber-900 rounded-md cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>2hr 內取消 (-5 分)</span>
                    </button>
                    <button
                      type="button"
                      onClick={runDemo5bRestricted}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>低信用阻擋第 2 件</span>
                    </button>
                  </div>
                  {renderStatus('demo5a')}
                  {renderStatus('demo5b')}
                </div>
              </div>

              {/* 06. QR Code Check-In & Mutual Rating */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-900 font-semibold">
                    06 · AC-04 QR 核銷與互評
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    動態 QR Code 面交簽到與完成加分
                  </h3>
                  <p className="text-xs text-slate-600">
                    依序演練賣家出示 HMAC QR、買家現場掃碼簽到，及雙方互評結算加分。
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={runDemo6aGenerateQr}
                    className="w-full text-left inline-flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                  >
                    <span>步驟 A：賣家產生動態 QR Code</span>
                    <Play className="w-3 h-3 text-emerald-900 shrink-0" />
                  </button>

                  {demoQrPreview && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2.5">
                      <img
                        src={demoQrPreview.qrDataUrl}
                        alt="示範面交動態 QR Code"
                        className="w-16 h-16 rounded border border-slate-200 bg-white p-1 shrink-0"
                      />
                      <div className="text-[11px] text-slate-600 space-y-0.5 min-w-0">
                        <div className="font-semibold text-slate-900">動態 QR 已簽發</div>
                        <div className="font-mono truncate">{demoQrPreview.qrToken}</div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={runDemo6bBuyerScan}
                    className="w-full text-left inline-flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                  >
                    <span>步驟 B：買家掃碼簽到 → Checked_In</span>
                    <Play className="w-3 h-3 text-emerald-900 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={runDemo6cCompleteAndRate}
                    className="w-full text-left inline-flex items-center justify-between px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                  >
                    <span>步驟 C：雙方五星互評 → Completed (+2/+3)</span>
                    <Play className="w-3 h-3 shrink-0" />
                  </button>

                  {renderStatus('demo6a')}
                  {renderStatus('demo6b')}
                  {renderStatus('demo6c')}
                </div>
              </div>
            </div>
          ) : (
            /* ================================================================
               ADMIN DEMO MODE (System Admin Only, In-Page)
               ================================================================ */
            <div className="space-y-4">
              {!adminAuthed ? (
                <form
                  onSubmit={handleAdminUnlock}
                  className="bg-white border border-slate-200 rounded-lg p-5 max-w-xl space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Lock className="w-4 h-4 text-slate-600" />
                    <span>
                      {adminStatus?.source === 'unclaimed'
                        ? '啟用管理員示範模式：設定管理員通行碼'
                        : '驗證管理員通行碼以解鎖 Admin 示範按鈕'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {adminStatus?.source === 'unclaimed'
                      ? '首次使用請設定至少 6 碼通行碼，系統將以 scrypt 雜湊儲存於伺服器端，並同步解鎖下方管理員後台。'
                      : '請輸入已設定的管理員通行碼以同時解鎖上方示範按鈕與下方申訴仲裁後台。'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={adminPasscode}
                      onChange={(e) => setAdminPasscode(e.target.value)}
                      placeholder="輸入通行碼（至少 6 碼）"
                      className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {adminStatus?.source === 'unclaimed' ? '設定並解鎖' : '解鎖管理員示範'}
                    </button>
                  </div>
                  {renderStatus('adminAuth')}
                </form>
              ) : (
                <>
                  <div className="px-4 py-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span className="text-slate-700 font-medium">
                      管理員權限已解鎖 · 目前待審申訴{' '}
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {adminDisputes.filter((d) => d.status === 'open').length}
                      </span>{' '}
                      筆
                    </span>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => onNavigateTab('credit_admin')}
                        className="text-emerald-900 font-medium hover:underline cursor-pointer"
                      >
                        顯示申訴與熱點管理
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('admin_ledger')}
                        className="text-emerald-900 font-medium hover:underline cursor-pointer"
                      >
                        顯示用戶信用查核
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {/* Admin 01 */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-xs font-mono text-emerald-900 font-semibold">
                          Admin 01 · 建立待審申訴案例
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          模擬提出違規／實物不符申訴
                        </h3>
                        <p className="text-xs text-slate-600">
                          建立測試交易並送出申訴，讓下方待審核佇列即時產生可供仲裁的案件。
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={runAdminDemo1SeedDispute}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>產生待審核申訴案件</span>
                        </button>
                        {renderStatus('adm1')}
                      </div>
                    </div>

                    {/* Admin 02 */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-xs font-mono text-emerald-900 font-semibold">
                          Admin 02 · 爽約仲裁 (-15 分)
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          裁決「面交逾時無故放鳥」成立
                        </h3>
                        <p className="text-xs text-slate-600">
                          對佇列中待審案件執行仲裁，扣除違規方 15 分信用並釋出鎖定商品。
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => runAdminDemo2Resolve('no_show_15')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-amber-800 hover:bg-amber-900 rounded-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>執行放鳥扣分裁決 (-15 分)</span>
                        </button>
                        {renderStatus('adm_no_show_15')}
                      </div>
                    </div>

                    {/* Admin 03 */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-xs font-mono text-emerald-900 font-semibold">
                          Admin 03 · 詐欺處分 (-30 分 / 停權)
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          裁決「實物嚴重不符／詐欺」與停權
                        </h3>
                        <p className="text-xs text-slate-600">
                          執行 -30 分重罰；若累計達兩次詐欺違規，系統自動執行帳號停權。
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => runAdminDemo2Resolve('fraud_30')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>執行詐欺重罰 (-30 分)</span>
                        </button>
                        {renderStatus('adm_fraud_30')}
                      </div>
                    </div>

                    {/* Admin 04 */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-xs font-mono text-emerald-900 font-semibold">
                          Admin 04 · 異常扣分平反 (+5 分)
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          審核申訴平反並返還異常扣分
                        </h3>
                        <p className="text-xs text-slate-600">
                          核可同學提出之誤判申訴，執行 +5 分信用返還並記錄於不可篡改帳本。
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => runAdminDemo2Resolve('restore_5')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>執行平反返還 (+5 分)</span>
                        </button>
                        {renderStatus('adm_restore_5')}
                      </div>
                    </div>

                    {/* Admin 05 */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-xs font-mono text-emerald-900 font-semibold">
                          Admin 05 · 校內面交熱點維運
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          新增校內監視器安全面交熱點
                        </h3>
                        <p className="text-xs text-slate-600">
                          新增含高亮度照明與監視器之校內熱點，立即同步至下方熱點列表與買家選單。
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={runAdminDemo3AddHotspot}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>一鍵新增示範面交熱點</span>
                        </button>
                        {renderStatus('adm_hotspot')}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
