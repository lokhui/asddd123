import { useState } from 'react';
import { Bell, ShieldCheck, ShieldAlert, UserCheck, LogOut, Shield } from 'lucide-react';
import type { NotificationItem, PublicUserSummary } from '../types';
import type { DemoModeType } from './DemoWorkbench';

interface WorkspaceBarProps {
  currentUser: PublicUserSummary | null;
  personas: PublicUserSummary[];
  notifications: NotificationItem[];
  demoMode: DemoModeType;
  onSelectDemoMode: (mode: DemoModeType) => void;
  onSwitchPersona: (userId: string) => void;
  onSignOut: () => void;
  onOpenAuthModal: () => void;
  onMarkNotificationsRead: () => void;
  onSelectNotificationTarget: (relatedId?: string) => void;
}

export function WorkspaceBar({
  currentUser,
  personas,
  notifications,
  demoMode,
  onSelectDemoMode,
  onSwitchPersona,
  onSignOut,
  onOpenAuthModal,
  onMarkNotificationsRead,
  onSelectNotificationTarget,
}: WorkspaceBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const isAdminMode = demoMode === 'admin';

  return (
    <div className="bg-slate-100/80 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Current active identity summary */}
        <div className="flex items-center gap-3 text-sm text-slate-700">
          {isAdminMode ? (
            <>
              <Shield className="w-4 h-4 text-slate-900 shrink-0" />
              <span className="font-medium text-slate-900">系統管理員（Admin）示範模式</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-slate-600">
                目前僅顯示管理員仲裁、熱點維運與信用查核功能
              </span>
            </>
          ) : currentUser ? (
            <>
              {currentUser.isRestricted ? (
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0" />
              )}
              <span className="font-medium text-slate-900">{currentUser.displayName}</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-slate-600">{currentUser.verifiedBadge}</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="font-mono text-xs sm:text-sm tabular-nums text-slate-900">
                信用分 {currentUser.creditScore} / 150
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="font-mono text-xs sm:text-sm tabular-nums text-slate-600">
                履約率 {currentUser.fulfillmentRate}%
              </span>
              {currentUser.isRestricted && (
                <>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="text-xs font-medium text-amber-800">
                    低信用受限（最多預約 1 件）
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-600">
                目前為未驗證訪客（Guest）：僅可瀏覽公開商品，完成 .edu.tw 驗證即可預約與上架
              </span>
            </>
          )}
        </div>

        {/* Unified Demo Mode Identity Switcher + Student Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!isAdminMode && (
            <>
              <div className="flex items-center gap-2">
                <label htmlFor="persona-select" className="text-xs text-slate-500 whitespace-nowrap">
                  測試學生身分
                </label>
                <select
                  id="persona-select"
                  value={currentUser?.id ?? 'guest'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'guest') {
                      onSignOut();
                    } else {
                      onSwitchPersona(val);
                    }
                  }}
                  className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-800 cursor-pointer"
                >
                  <option value="guest">未驗證訪客 (Guest)</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}（{p.university} · 信用 {p.creditScore}）
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={onOpenAuthModal}
                className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer px-2 py-1"
              >
                .edu.tw 驗證登入
              </button>
            </>
          )}

          {/* Unified Demo Mode Segmented Control */}
          <div
            className="flex items-center gap-1 p-0.5 bg-white border border-slate-300 rounded-lg"
            role="group"
            aria-label="統一示範模式切換"
          >
            <button
              type="button"
              onClick={() => onSelectDemoMode(null)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                demoMode === null
                  ? 'bg-slate-200 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              關閉示範
            </button>
            <button
              type="button"
              onClick={() => onSelectDemoMode('student')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                demoMode === 'student'
                  ? 'bg-emerald-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              用戶示範模式
            </button>
            <button
              type="button"
              onClick={() => onSelectDemoMode('admin')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                demoMode === 'admin'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              管理員示範模式
            </button>
          </div>

          {!isAdminMode && currentUser && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next && unreadCount > 0) {
                    onMarkNotificationsRead();
                  }
                }}
                aria-label="開啟通知中心"
                className="relative p-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-emerald-900 text-white text-[10px] font-mono tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-lg z-40 p-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-900">站內通知與配對提醒</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      關閉
                    </button>
                  </div>
                  <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500">目前沒有新通知</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onSelectNotificationTarget(n.relatedId);
                          }}
                          className="w-full text-left py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isAdminMode && currentUser && (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="登出目前學生身分"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white cursor-pointer"
              title="切換為訪客"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
