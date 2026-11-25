export type ActiveTab =
  | 'marketplace'
  | 'bundles'
  | 'wishlist'
  | 'transactions'
  | 'credit_admin'
  | 'admin_ledger';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isAuthenticated: boolean;
  isAdminMode: boolean;
  onPrimaryAction: () => void;
}

const STUDENT_NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'marketplace', label: '探索市集' },
  { id: 'bundles', label: '畢業打包' },
  { id: 'wishlist', label: '許願配對' },
  { id: 'transactions', label: '面交狀態機' },
  { id: 'credit_admin', label: '信用帳本' },
];

const ADMIN_NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'credit_admin', label: '申訴與熱點管理' },
  { id: 'admin_ledger', label: '用戶信用查核' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  isAuthenticated,
  isAdminMode,
  onPrimaryAction,
}: TopBarProps) {
  const navItems = isAdminMode ? ADMIN_NAV_ITEMS : STUDENT_NAV_ITEMS;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab(isAdminMode ? 'credit_admin' : 'marketplace')}
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-800 rounded"
        >
          CampusLoop
        </button>

        {/* Zone 2: Single-line navigation links scoped to current role */}
        <nav className="hidden md:flex items-center gap-6" aria-label="主要導覽">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                  isActive
                    ? 'text-emerald-900 border-emerald-800'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
          >
            {isAdminMode
              ? '切換用戶示範'
              : isAuthenticated
                ? 'AI 拍照上架'
                : '驗證校園信箱'}
          </button>
        </div>
      </div>

      {/* Mobile compact navigation */}
      <nav
        className="md:hidden flex items-center gap-4 px-4 pb-2.5 overflow-x-auto border-t border-slate-100 pt-2"
        aria-label="行動版導覽"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-md transition-colors ${
                isActive
                  ? 'bg-emerald-900 text-white'
                  : 'text-slate-600 bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
