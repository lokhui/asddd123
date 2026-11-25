import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api';
import { TopBar, type ActiveTab } from './components/TopBar';
import { WorkspaceBar } from './components/WorkspaceBar';
import { MarketplaceView } from './components/MarketplaceView';
import { BundlesView } from './components/BundlesView';
import { WishlistView } from './components/WishlistView';
import { TransactionsView } from './components/TransactionsView';
import { CreditAndAdminView } from './components/CreditAndAdminView';
import { AuthModal } from './components/AuthModal';
import { AiListingModal } from './components/AiListingModal';
import { ProductDetailModal } from './components/ProductDetailModal';
import { DemoWorkbench, type DemoModeType } from './components/DemoWorkbench';
import type {
  Bundle,
  NotificationItem,
  Product,
  PublicUserSummary,
  SafeHotspot,
  Transaction,
  WishlistItem,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('marketplace');
  const [currentUser, setCurrentUser] = useState<PublicUserSummary | null>(null);
  const [personas, setPersonas] = useState<PublicUserSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [hotspots, setHotspots] = useState<SafeHotspot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wishlists, setWishlists] = useState<WishlistItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Modals & cross-view state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [listingModalOpen, setListingModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<DemoModeType>(null);
  const [adminAuthVersion, setAdminAuthVersion] = useState(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 5000);
  };

  const fetchPublicCatalog = useCallback(async () => {
    try {
      const [prodRes, bundleRes, hsRes, personaRes] = await Promise.all([
        apiFetch<{ products: Product[] }>('/api/v1/products'),
        apiFetch<{ bundles: Bundle[] }>('/api/v1/bundles'),
        apiFetch<{ hotspots: SafeHotspot[] }>('/api/v1/hotspots'),
        apiFetch<{ personas: PublicUserSummary[] }>('/api/v1/users/personas'),
      ]);
      setProducts(prodRes.products);
      setBundles(bundleRes.bundles);
      setHotspots(hsRes.hotspots);
      setPersonas(personaRes.personas);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchAuthenticatedData = useCallback(async () => {
    if (!getAuthToken()) {
      setCurrentUser(null);
      setTransactions([]);
      setWishlists([]);
      setNotifications([]);
      return;
    }

    try {
      const meRes = await apiFetch<{
        role: string;
        user: PublicUserSummary | null;
      }>('/api/v1/auth/me');
      if (!meRes.user) {
        setAuthToken(null);
        setCurrentUser(null);
        return;
      }
      setCurrentUser(meRes.user);

      const [txRes, wlRes, notifRes] = await Promise.all([
        apiFetch<{ transactions: Transaction[] }>('/api/v1/transactions'),
        apiFetch<{ wishlists: WishlistItem[] }>('/api/v1/wishlists'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/v1/notifications'),
      ]);
      setTransactions(txRes.transactions);
      setWishlists(wlRes.wishlists);
      setNotifications(notifRes.notifications);
    } catch {
      setAuthToken(null);
      setCurrentUser(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchPublicCatalog(), fetchAuthenticatedData()]);
  }, [fetchPublicCatalog, fetchAuthenticatedData]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleSwitchPersona = async (userId: string) => {
    try {
      const res = await apiFetch<{ token: string; user: PublicUserSummary }>(
        '/api/v1/auth/demo-session',
        {
          method: 'POST',
          body: JSON.stringify({ userId }),
        }
      );
      setAuthToken(res.token);
      setCurrentUser(res.user);
      await fetchAuthenticatedData();
      showToast(`已切換身分：${res.user.displayName}（${res.user.university} · 信用 ${res.user.creditScore} 分）`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '切換身分失敗');
    }
  };

  const handleSignOut = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setTransactions([]);
    setWishlists([]);
    setNotifications([]);
    showToast('已切換為未驗證訪客模式');
  };

  const handleMarkNotificationsRead = async () => {
    if (!getAuthToken()) return;
    try {
      await apiFetch('/api/v1/notifications/read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Ignore non-critical read sync error
    }
  };

  const handleSelectProductById = (relatedId?: string) => {
    if (!relatedId) return;
    const found = products.find((p) => p.id === relatedId);
    if (found) {
      setActiveTab('marketplace');
      setSelectedProduct(found);
      return;
    }
    const foundTx = transactions.find((t) => t.id === relatedId);
    if (foundTx) {
      setActiveTab('transactions');
    }
  };

  const isAdminMode = demoMode === 'admin';

  const handleSelectDemoMode = (nextMode: DemoModeType) => {
    const prevMode = demoMode;
    setDemoMode(nextMode);
    if (nextMode === 'admin') {
      setListingModalOpen(false);
      setAuthModalOpen(false);
      setSelectedProduct(null);
      if (activeTab !== 'admin_ledger') {
        setActiveTab('credit_admin');
      }
    } else if (prevMode === 'admin' || activeTab === 'admin_ledger') {
      setActiveTab('marketplace');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isAuthenticated={Boolean(currentUser)}
        isAdminMode={isAdminMode}
        onPrimaryAction={() => {
          if (isAdminMode) {
            handleSelectDemoMode('student');
          } else if (currentUser) {
            setListingModalOpen(true);
          } else {
            setAuthModalOpen(true);
          }
        }}
      />

      <WorkspaceBar
        currentUser={currentUser}
        personas={personas}
        notifications={notifications}
        demoMode={demoMode}
        onSelectDemoMode={handleSelectDemoMode}
        onSwitchPersona={handleSwitchPersona}
        onSignOut={handleSignOut}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onMarkNotificationsRead={handleMarkNotificationsRead}
        onSelectNotificationTarget={handleSelectProductById}
      />

      {toastMessage && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="px-4 py-2.5 rounded-lg bg-emerald-900 text-white text-xs sm:text-sm font-medium flex items-center justify-between gap-4">
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-200 hover:text-white text-xs cursor-pointer"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        <DemoWorkbench
          mode={demoMode}
          adminAuthVersion={adminAuthVersion}
          onAdminAuthChange={() => setAdminAuthVersion((v) => v + 1)}
          onClose={() => handleSelectDemoMode(null)}
          onSwitchMode={handleSelectDemoMode}
          products={products}
          onRefreshAll={refreshAll}
          onNavigateTab={setActiveTab}
          onOpenListingModal={() => setListingModalOpen(true)}
          onInspectUser={setInspectedUserId}
          onShowToast={showToast}
        />

        {!isAdminMode && activeTab === 'marketplace' && (
          <MarketplaceView
            products={products}
            loading={loadingProducts}
            onSelectProduct={setSelectedProduct}
            onOpenListingModal={() => {
              if (currentUser) {
                setListingModalOpen(true);
              } else {
                setAuthModalOpen(true);
              }
            }}
            onJumpToBundles={() => setActiveTab('bundles')}
          />
        )}

        {!isAdminMode && activeTab === 'bundles' && (
          <BundlesView
            bundles={bundles}
            myListedProducts={
              currentUser ? products.filter((p) => p.sellerId === currentUser.id) : []
            }
            currentUser={currentUser}
            hotspots={hotspots}
            onRefresh={async () => {
              await refreshAll();
              showToast('打包組合與交易狀態已更新');
            }}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}

        {!isAdminMode && activeTab === 'wishlist' && (
          <WishlistView
            currentUser={currentUser}
            wishlists={wishlists}
            notifications={notifications}
            onRefresh={refreshAll}
            onRequireAuth={() => setAuthModalOpen(true)}
            onSelectProductId={handleSelectProductById}
          />
        )}

        {!isAdminMode && activeTab === 'transactions' && (
          <TransactionsView
            currentUser={currentUser}
            transactions={transactions}
            onRefresh={refreshAll}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}

        {(activeTab === 'credit_admin' || (isAdminMode && activeTab === 'admin_ledger')) && (
          <CreditAndAdminView
            section={
              isAdminMode
                ? activeTab === 'admin_ledger'
                  ? 'admin_ledger'
                  : 'admin_console'
                : 'student_ledger'
            }
            adminAuthVersion={adminAuthVersion}
            onAdminAuthChange={() => setAdminAuthVersion((v) => v + 1)}
            currentUser={currentUser}
            personas={personas}
            inspectedUserId={inspectedUserId}
            onSelectInspectedUser={setInspectedUserId}
            onRefreshAll={refreshAll}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            CampusLoop — 校園二手物品循環與動態信用擔保交易市集
          </div>
          <div className="flex items-center gap-6">
            <span>.edu.tw 實名雜湊保護</span>
            <span>EXIF 隱私自動清除</span>
            <span>校內安全熱點 QR 核銷</span>
          </div>
        </div>
      </footer>

      <AuthModal
        open={!isAdminMode && authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={async (user) => {
          setCurrentUser(user);
          await refreshAll();
          showToast(`歡迎加入 CampusLoop！已通過 ${user.university}認證（信用分 ${user.creditScore}）`);
        }}
      />

      <AiListingModal
        open={!isAdminMode && listingModalOpen}
        onClose={() => setListingModalOpen(false)}
        onPublished={async (_product, matchedCount) => {
          await refreshAll();
          showToast(
            matchedCount > 0
              ? `商品已成功上架，並自動配對通知 ${matchedCount} 位許願買家！`
              : '商品已成功發布至校園市集！'
          );
        }}
      />

      <ProductDetailModal
        product={isAdminMode ? null : selectedProduct}
        currentUser={currentUser}
        hotspots={hotspots}
        onClose={() => setSelectedProduct(null)}
        onReserved={async () => {
          await refreshAll();
          setActiveTab('transactions');
          showToast('已送出校內面交預約，商品進入待確認鎖定狀態');
        }}
        onRequireAuth={() => {
          setSelectedProduct(null);
          setAuthModalOpen(true);
        }}
        onInspectSellerCredit={(sellerId) => {
          setInspectedUserId(sellerId);
          setActiveTab('credit_admin');
        }}
      />
    </div>
  );
}
