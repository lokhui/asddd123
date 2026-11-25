export type ProductCategory =
  | '教科書'
  | '小家電'
  | '租屋家具'
  | '3C 配件'
  | '生活日用品';

export type ConditionLevel =
  | '95% 新'
  | '85% 新'
  | '70% 新（有明顯使用痕跡）';

export type ProductStatus = 'Listed' | 'Pending_Confirm' | 'Reserved' | 'Sold';

export type TransactionStatus =
  | 'Pending_Confirm'
  | 'Reserved'
  | 'Checked_In'
  | 'Completed'
  | 'Cancelled'
  | 'Disputed';

export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  emailHash: string; // SHA-256 of normalized .edu.tw email (never exposed to public)
  displayName: string; // Public nickname (e.g. "林同學", never student ID)
  university: string; // e.g. "國立臺灣大學"
  domain: string; // e.g. "ntu.edu.tw"
  role: UserRole;
  creditScore: number; // 0 ~ 150, initial 100
  completedTrades: number;
  totalAgreedTrades: number;
  fraudStrikes: number;
  suspended: boolean;
  dailyTradeBonusDate: string; // YYYY-MM-DD
  dailyTradeBonusPoints: number; // max +6/day from completed trades
  createdAt: string;
}

export interface PublicUserSummary {
  id: string;
  displayName: string;
  university: string;
  verifiedBadge: string; // e.g. "已通過 國立臺灣大學認證"
  creditScore: number;
  fulfillmentRate: number; // percentage 0-100
  completedTrades: number;
  isRestricted: boolean; // creditScore < 70
  suspended: boolean;
}

export interface CreditLog {
  id: string;
  userId: string;
  delta: number;
  balanceAfter: number;
  eventType:
    | 'INITIAL_VERIFICATION'
    | 'TRADE_COMPLETED'
    | 'FIVE_STAR_MATCH_BONUS'
    | 'LATE_CANCEL_PENALTY'
    | 'NO_SHOW_PENALTY'
    | 'FRAUD_MISMATCH_PENALTY'
    | 'ADMIN_ADJUSTMENT';
  reason: string;
  transactionId?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: ProductCategory;
  conditionLevel: ConditionLevel;
  price: number;
  estimatedMinPrice?: number;
  estimatedMaxPrice?: number;
  images: string[];
  keywords: string[];
  pickupZone: string;
  status: ProductStatus;
  bundleId?: string | null;
  version: number; // Optimistic lock version
  createdAt: string;
}

export interface Bundle {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  itemIds: string[];
  originalTotalPrice: number;
  bundlePrice: number;
  salesMode: 'bundle_only' | 'allow_individual';
  pickupZone: string;
  status: 'Listed' | 'Pending_Confirm' | 'Reserved' | 'Sold' | 'Deactivated';
  version: number;
  createdAt: string;
}

export interface SafeHotspot {
  id: string;
  name: string;
  university: string;
  area: string;
  hasCctv: boolean;
  lightingLevel: '高亮度照明' | '標準照明';
  hours: string;
  active: boolean;
}

export interface TransactionReview {
  reviewerId: string;
  rating: number; // 1-5
  accurateDescription: boolean;
  comment: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  targetType: 'product' | 'bundle';
  productId?: string;
  bundleId?: string;
  itemTitle: string;
  amount: number;
  sellerId: string;
  buyerId: string;
  hotspotId: string;
  hotspotName: string;
  meetupAt: string; // ISO string
  status: TransactionStatus;
  riskAcknowledged: boolean;
  buyerCheckedInAt?: string;
  sellerCheckedInAt?: string;
  buyerConfirmedComplete: boolean;
  sellerConfirmedComplete: boolean;
  buyerReview?: TransactionReview;
  sellerReview?: TransactionReview;
  cancelReason?: string;
  cancelledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  id: string;
  userId: string;
  keyword: string;
  category: ProductCategory | '全部';
  maxPrice: number;
  active: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'wishlist_match' | 'transaction_update' | 'credit_update' | 'dispute_update';
  title: string;
  message: string;
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface DisputeCase {
  id: string;
  transactionId: string;
  reporterId: string;
  reportedUserId: string;
  reasonType: 'no_show' | 'item_mismatch' | 'other';
  description: string;
  status: 'open' | 'resolved';
  resolution?: string;
  penaltyApplied?: number;
  resolvedBy?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface HistoricalPriceRecord {
  id: string;
  category: ProductCategory;
  conditionLevel: ConditionLevel;
  title: string;
  keywords: string[];
  soldPrice: number;
  soldAt: string;
}

export interface OtpChallenge {
  emailHash: string;
  email: string;
  university: string;
  domain: string;
  displayName: string;
  codeHash: string;
  expiresAt: number;
}

export interface DatabaseState {
  users: User[];
  creditLogs: CreditLog[];
  products: Product[];
  bundles: Bundle[];
  hotspots: SafeHotspot[];
  transactions: Transaction[];
  wishlists: WishlistItem[];
  notifications: NotificationItem[];
  disputes: DisputeCase[];
  historicalPrices: HistoricalPriceRecord[];
  adminCredentialHash?: string; // scrypt hash when claimed via first-run UI
}
