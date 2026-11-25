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

export interface PublicUserSummary {
  id: string;
  displayName: string;
  university: string;
  verifiedBadge: string;
  creditScore: number;
  fulfillmentRate: number;
  completedTrades: number;
  isRestricted: boolean;
  suspended: boolean;
}

export interface CreditLog {
  id: string;
  userId: string;
  delta: number;
  balanceAfter: number;
  eventType: string;
  reason: string;
  transactionId?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  sellerId: string;
  seller: PublicUserSummary | null;
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
  version: number;
  createdAt: string;
}

export interface Bundle {
  id: string;
  sellerId: string;
  seller: PublicUserSummary | null;
  title: string;
  description: string;
  itemIds: string[];
  items: Product[];
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
  rating: number;
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
  seller: PublicUserSummary | null;
  buyer: PublicUserSummary | null;
  hotspotId: string;
  hotspotName: string;
  meetupAt: string;
  status: TransactionStatus;
  riskAcknowledged: boolean;
  buyerCheckedInAt?: string;
  sellerCheckedInAt?: string;
  buyerConfirmedComplete: boolean;
  sellerConfirmedComplete: boolean;
  buyerReview?: TransactionReview;
  sellerReview?: TransactionReview;
  cancelReason?: string;
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
  reporter: PublicUserSummary | null;
  reportedUser: PublicUserSummary | null;
  reasonType: 'no_show' | 'item_mismatch' | 'other';
  description: string;
  status: 'open' | 'resolved';
  resolution?: string;
  penaltyApplied?: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface AiAnalyzeResponse {
  analysis: {
    category: ProductCategory;
    condition_level: ConditionLevel;
    suggested_title: string;
    suggested_description: string;
    keywords: string[];
    estimated_new_price_twd: number;
  };
  pricing: {
    source: 'historical' | 'ai_fallback';
    sampleCount: number;
    p25: number;
    p75: number;
    minSuggested: number;
    maxSuggested: number;
    medianPrice: number;
    matchedSamples: Array<{ title: string; soldPrice: number; soldAt: string }>;
  };
  exifStripped: boolean;
  analysisMode?: 'gemini' | 'demo_preset';
}
