import { useState } from 'react';
import { X, MailCheck, ShieldCheck } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { PublicUserSummary } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: PublicUserSummary) => void;
}

export function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otp, setOtp] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [university, setUniversity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        message: string;
        university: string;
        previewOtp?: string;
      }>('/api/v1/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email, displayName }),
      });
      setUniversity(res.university);
      setPreviewOtp(res.previewOtp ?? null);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送驗證碼失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        token: string;
        user: PublicUserSummary;
      }>('/api/v1/auth/verify-edu', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
      onClose();
      setStep('email');
      setOtp('');
      setPreviewOtp(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '驗證失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-slate-900">
              校園 .edu.tw 身分驗證
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              信箱僅用於 SHA-256 唯一性雜湊防分身，前台僅顯示大學認證徽章。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉驗證視窗"
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

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
            <div>
              <label htmlFor="edu-email" className="block text-sm font-medium text-slate-800 mb-1.5">
                學校電子信箱（*.edu.tw）
              </label>
              <input
                id="edu-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="例如 b10902001@ntu.edu.tw"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>

            <div>
              <label htmlFor="display-name" className="block text-sm font-medium text-slate-800 mb-1.5">
                市集顯示暱稱（不公開真實學號）
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：王同學"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>

            <div className="pt-1 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {loading ? '發送中...' : '寄送 6 位數驗證碼'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                <MailCheck className="w-4 h-4 text-emerald-800" />
                <span>已寄出 6 位數一次性驗證碼（10 分鐘內有效）</span>
              </div>
              <p>認證學校：{university}</p>
              {previewOtp && (
                <p className="font-mono text-emerald-900 font-semibold pt-1">
                  預覽模擬收件匣驗證碼：{previewOtp}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="otp-code" className="block text-sm font-medium text-slate-800 mb-1.5">
                輸入 6 位數驗證碼
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6 位數數字"
                className="w-full px-3.5 py-2.5 text-base font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-2 focus:outline-emerald-800"
              />
            </div>

            <div className="pt-1 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError('');
                }}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                更換信箱
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                {loading ? '驗證中...' : '完成驗證（領取 100 初始信用分）'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
