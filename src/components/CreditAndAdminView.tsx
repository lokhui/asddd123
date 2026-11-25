import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Lock, MapPinPlus } from 'lucide-react';
import { apiFetch, getAdminToken, setAdminToken } from '../lib/api';
import type { CreditLog, DisputeCase, PublicUserSummary, SafeHotspot } from '../types';

interface CreditAndAdminViewProps {
  section: 'student_ledger' | 'admin_console' | 'admin_ledger';
  adminAuthVersion: number;
  onAdminAuthChange: () => void;
  currentUser: PublicUserSummary | null;
  personas: PublicUserSummary[];
  inspectedUserId: string | null;
  onSelectInspectedUser: (userId: string) => void;
  onRefreshAll: () => void;
}

export function CreditAndAdminView({
  section,
  adminAuthVersion,
  onAdminAuthChange,
  currentUser,
  personas,
  inspectedUserId,
  onSelectInspectedUser,
  onRefreshAll,
}: CreditAndAdminViewProps) {
  const [targetId, setTargetId] = useState(
    inspectedUserId || currentUser?.id || personas[0]?.id || 'stu_lin'
  );
  const [ledgerUser, setLedgerUser] = useState<PublicUserSummary | null>(null);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Admin state
  const [adminStatus, setAdminStatus] = useState<{
    configured: boolean;
    source: 'env' | 'claimed' | 'unclaimed';
  } | null>(null);
  const [adminAuthed, setAdminAuthed] = useState(Boolean(getAdminToken()));
  const [passcodeInput, setPasscodeInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminFeedback, setAdminFeedback] = useState('');
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [hotspots, setHotspots] = useState<SafeHotspot[]>([]);

  // New hotspot form
  const [hsName, setHsName] = useState('');
  const [hsArea, setHsArea] = useState('');
  const [hsHours, setHsHours] = useState('08:00 - 22:00');

  useEffect(() => {
    if (inspectedUserId) {
      setTargetId(inspectedUserId);
    } else if (currentUser && section === 'student_ledger') {
      setTargetId(currentUser.id);
    }
  }, [inspectedUserId, currentUser, section]);

  useEffect(() => {
    if (!targetId) return;
    if (section !== 'student_ledger' && section !== 'admin_ledger') return;
    let active = true;
    setLoadingLedger(true);
    apiFetch<{ user: PublicUserSummary; creditLogs: CreditLog[] }>(
      `/api/v1/users/${targetId}/credit-history`
    )
      .then((res) => {
        if (!active) return;
        setLedgerUser(res.user);
        setCreditLogs(res.creditLogs);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingLedger(false);
      });
    return () => {
      active = false;
    };
  }, [targetId, currentUser?.creditScore, section]);

  const loadAdminConsole = async () => {
    if (section !== 'admin_console') return;
    try {
      const status = await apiFetch<{ configured: boolean; source: 'env' | 'claimed' | 'unclaimed' }>(
        '/api/v1/auth/admin-status'
      );
      setAdminStatus(status);
      if (getAdminToken()) {
        const data = await apiFetch<{ disputes: DisputeCase[]; hotspots: SafeHotspot[] }>(
          '/api/v1/admin/disputes',
          { useAdminToken: true }
        );
        setDisputes(data.disputes);
        setHotspots(data.hotspots);
        setAdminAuthed(true);
      } else {
        setAdminAuthed(false);
      }
    } catch {
      setAdminAuthed(false);
      setAdminToken(null);
    }
  };

  useEffect(() => {
    loadAdminConsole();
  }, [section, personas, adminAuthVersion]);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    try {
      const endpoint =
        adminStatus?.source === 'unclaimed' ? '/api/v1/auth/admin-claim' : '/api/v1/auth/admin-login';
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      setAdminToken(res.token);
      setPasscodeInput('');
      onAdminAuthChange();
      await loadAdminConsole();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : '管理員驗證失敗');
    }
  };

  const handleResolveDispute = async (
    disputeId: string,
    action: 'dismiss' | 'no_show_15' | 'fraud_30' | 'restore_5'
  ) => {
    setAdminError('');
    setAdminFeedback('');
    try {
      await apiFetch(`/api/v1/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        useAdminToken: true,
        body: JSON.stringify({ action }),
      });
      setAdminFeedback('申訴案件已完成裁決並寫入信用帳本。');
      await loadAdminConsole();
      onRefreshAll();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : '裁決失敗');
    }
  };

  const handleAddHotspot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    try {
      await apiFetch('/api/v1/admin/hotspots', {
        method: 'POST',
        useAdminToken: true,
        body: JSON.stringify({
          name: hsName,
          area: hsArea || '校內公共區',
          hours: hsHours,
          hasCctv: true,
          lightingLevel: '高亮度照明',
        }),
      });
      setHsName('');
      setHsArea('');
      setAdminFeedback('已新增校內安全面交熱點！');
      await loadAdminConsole();
      onRefreshAll();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : '新增熱點失敗');
    }
  };

  const selectableUsers = [
    ...(currentUser && !personas.some((p) => p.id === currentUser.id) ? [currentUser] : []),
    ...personas,
  ];

  // Admin Console View (strictly shown only in Admin Mode)
  if (section === 'admin_console') {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              系統管理員（Admin）申訴仲裁與熱點管理後台
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              專題維運團隊專用：審核面交爽約／實物不符申訴、執行詐欺扣分與停權處分，以及管理校內安全面交熱點清單。
            </p>
          </div>
          {adminAuthed && (
            <button
              type="button"
              onClick={() => {
                setAdminToken(null);
                setAdminAuthed(false);
                onAdminAuthChange();
              }}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0"
            >
              鎖定管理員後台
            </button>
          )}
        </div>

        {adminError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {adminError}
          </div>
        )}
        {adminFeedback && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            {adminFeedback}
          </div>
        )}

        {!adminAuthed ? (
          <form onSubmit={handleAdminSubmit} className="max-w-md space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Lock className="w-4 h-4 text-slate-500" />
              <span>
                {adminStatus?.source === 'unclaimed'
                  ? '首次啟用管理後台：請設定管理員通行碼（至少 6 碼）'
                  : '請輸入管理員通行碼以解鎖仲裁與熱點管理功能'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                required
                minLength={6}
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder={
                  adminStatus?.source === 'unclaimed' ? '設定管理員通行碼' : '輸入管理員通行碼'
                }
                className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {adminStatus?.source === 'unclaimed' ? '啟用並進入' : '解鎖後台'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Disputes queue */}
            <div className="lg:col-span-7 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                申訴案件審核佇列（{disputes.length} 筆）
              </h2>
              {disputes.length === 0 ? (
                <p className="text-xs text-slate-500">目前無申訴案件。</p>
              ) : (
                <div className="space-y-3">
                  {disputes.map((d) => (
                    <div key={d.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          申訴人：{d.reporter?.displayName ?? d.reporterId} → 被申訴人：
                          {d.reportedUser?.displayName ?? d.reportedUserId}
                        </span>
                        <span className="font-medium text-slate-800">
                          {d.status === 'open' ? '待審核' : '已結案'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{d.description}</p>

                      {d.status === 'open' ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(d.id, 'no_show_15')}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-800 text-white rounded-md cursor-pointer"
                          >
                            判定放鳥（-15 分）
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(d.id, 'fraud_30')}
                            className="px-3 py-1.5 text-xs font-medium bg-red-700 text-white rounded-md cursor-pointer"
                          >
                            判定實物不符詐欺（-30 分）
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(d.id, 'restore_5')}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-900 text-white rounded-md cursor-pointer"
                          >
                            異常扣分返還（+5 分）
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(d.id, 'dismiss')}
                            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-700 rounded-md cursor-pointer"
                          >
                            不予處分結案
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-900 font-medium">
                          裁決結果：{d.resolution}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Safe Hotspot management */}
            <div className="lg:col-span-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">校內安全面交熱點管理</h2>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg px-4">
                {hotspots.map((hs) => (
                  <li key={hs.id} className="py-2.5 text-xs">
                    <div className="font-medium text-slate-900">{hs.name}</div>
                    <div className="text-slate-500 mt-0.5">
                      {hs.area} · {hs.hasCctv ? '有監視器' : '無監視器'} · {hs.lightingLevel} ·{' '}
                      {hs.hours}
                    </div>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleAddHotspot} className="space-y-2.5 pt-2">
                <div className="text-xs font-semibold text-slate-800">新增校內安全面交熱點</div>
                <input
                  type="text"
                  required
                  value={hsName}
                  onChange={(e) => setHsName(e.target.value)}
                  placeholder="熱點名稱（例如：工程綜館一樓大廳）"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={hsArea}
                    onChange={(e) => setHsArea(e.target.value)}
                    placeholder="區域（例如：工學院區）"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={hsHours}
                    onChange={(e) => setHsHours(e.target.value)}
                    placeholder="開放時段"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-lg cursor-pointer"
                >
                  <MapPinPlus className="w-3.5 h-3.5" />
                  <span>新增熱點</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    );
  }

  // Student Credit Ledger View (or Admin User Credit Lookup)
  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            {section === 'admin_ledger'
              ? '管理員用戶信用查核（Credit_Logs）'
              : '動態信用積分帳本與履約紀錄'}
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            所有信用變動皆不可篡改地寫入 Credit_Logs 帳本（分數區間 0–150 分）。分數低於 70 分將自動轉為受限帳號，同時僅能預約 1 件商品。
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="inspect-user" className="text-xs text-slate-500">
            檢視學生帳本
          </label>
          <select
            id="inspect-user"
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              onSelectInspectedUser(e.target.value);
            }}
            className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 cursor-pointer"
          >
            {selectableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}（信用 {u.creditScore} 分）
              </option>
            ))}
          </select>
        </div>
      </div>

      {ledgerUser && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Summary card */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">{ledgerUser.verifiedBadge}</div>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                  {ledgerUser.displayName}
                </h2>
              </div>
              {ledgerUser.isRestricted ? (
                <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-800 shrink-0" />
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">動態信用積分</span>
                <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {ledgerUser.creditScore} / 150
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    ledgerUser.isRestricted ? 'bg-amber-600' : 'bg-emerald-900'
                  }`}
                  style={{ width: `${Math.min(100, (ledgerUser.creditScore / 150) * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-600">
                狀態：
                {ledgerUser.suspended
                  ? '已停權'
                  : ledgerUser.isRestricted
                    ? '低信用受限 (<70)'
                    : '正常認證學生'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div>
                <div className="text-xs text-slate-500">面交履約率</div>
                <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 mt-0.5">
                  {ledgerUser.fulfillmentRate}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">完成交易數</div>
                <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 mt-0.5">
                  {ledgerUser.completedTrades} 筆
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
              <div className="font-semibold text-slate-800">計分規則摘要</div>
              <div className="flex justify-between">
                <span>準時面交互評（每日上限 +6）</span>
                <span className="font-mono tabular-nums text-emerald-900">+2 分</span>
              </div>
              <div className="flex justify-between">
                <span>實物完全相符五星好評（賣家）</span>
                <span className="font-mono tabular-nums text-emerald-900">+1 分</span>
              </div>
              <div className="flex justify-between">
                <span>&lt; 2 小時內臨時取消預約</span>
                <span className="font-mono tabular-nums text-amber-800">-5 分</span>
              </div>
              <div className="flex justify-between">
                <span>逾時 15 分鐘無故放鳥</span>
                <span className="font-mono tabular-nums text-red-700">-15 分</span>
              </div>
              <div className="flex justify-between">
                <span>實物嚴重不符／詐欺（累計2次停權）</span>
                <span className="font-mono tabular-nums text-red-700">-30 分</span>
              </div>
            </div>
          </div>

          {/* Credit Logs Table */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Credit_Logs 近期變動明細
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                共 {creditLogs.length} 筆紀錄
              </span>
            </div>

            {loadingLedger ? (
              <div className="p-8 text-center text-sm text-slate-500">載入帳本中...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-4 font-medium">時間</th>
                      <th className="py-3 px-4 font-medium">觸發事件與原因</th>
                      <th className="py-3 px-4 font-medium text-right">分數變動</th>
                      <th className="py-3 px-4 font-medium text-right">異動後餘額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {creditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString('zh-TW')}
                        </td>
                        <td className="py-3 px-4 text-xs sm:text-sm text-slate-800">
                          {log.reason}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            log.delta >= 0 ? 'text-emerald-900' : 'text-red-700'
                          }`}
                        >
                          {log.delta > 0 ? `+${log.delta}` : log.delta}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {log.balanceAfter}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
