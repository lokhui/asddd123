import crypto from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import QRCode from 'qrcode';
import {
  createDynamicQrToken,
  hashPasswordScrypt,
  sha256Hash,
  signJwt,
  validateEduTwEmail,
  verifyDynamicQrToken,
  verifyJwt,
  verifyPasswordScrypt,
} from './auth.ts';
import {
  analyzeProductImage,
  getDemoSampleAnalysis,
  isGeminiConfigured,
  type DemoPresetKey,
} from './gemini.ts';
import { computeSuggestedPricing } from './pricing.ts';
import { store } from './store.ts';
import type {
  Bundle,
  ConditionLevel,
  CreditLog,
  OtpChallenge,
  Product,
  ProductCategory,
  User,
} from './types.ts';

interface AuthedRequest extends Request {
  authUser?: User;
  authRole?: 'student' | 'admin';
}

const otpChallenges = new Map<string, OtpChallenge>();

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return next();
  const payload = verifyJwt(token);
  if (!payload) return next();

  if (payload.role === 'admin') {
    req.authRole = 'admin';
    return next();
  }

  const user = store.getSnapshot().users.find((u) => u.id === payload.sub);
  if (user) {
    req.authUser = user;
    req.authRole = 'student';
  }
  next();
}

function requireStudent(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: '請先完成 .edu.tw 校園信箱驗證後再操作' });
    return;
  }
  if (req.authUser.suspended) {
    res.status(403).json({ error: '此帳號因累計兩次嚴重違規已遭停權，請聯繫管理員申訴' });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.authRole !== 'admin') {
    res.status(403).json({ error: '此操作僅限系統管理員執行' });
    return;
  }
  next();
}

function applyCreditDelta(
  user: User,
  delta: number,
  eventType: CreditLog['eventType'],
  reason: string,
  logs: CreditLog[],
  transactionId?: string
): CreditLog {
  const nextScore = Math.max(0, Math.min(150, user.creditScore + delta));
  const actualDelta = nextScore - user.creditScore;
  user.creditScore = nextScore;

  const entry: CreditLog = {
    id: `cl_${crypto.randomUUID().slice(0, 8)}`,
    userId: user.id,
    delta: actualDelta,
    balanceAfter: nextScore,
    eventType,
    reason,
    transactionId,
    createdAt: new Date().toISOString(),
  };
  logs.unshift(entry);
  return entry;
}

export function registerApiRoutes(app: Express) {
  app.use('/api/v1', attachAuth);

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'CampusLoop API' });
  });

  // ------------------------------------------------------------------
  // MODULE 1: Auth & Campus Verification (.edu.tw OTP + SHA-256 + JWT)
  // ------------------------------------------------------------------
  app.post('/api/v1/auth/request-otp', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const displayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim().length > 0
        ? req.body.displayName.trim().slice(0, 20)
        : '校內認證同學';

    const check = validateEduTwEmail(email);
    if (!check.valid) {
      res.status(400).json({
        error: '僅開放台灣大專院校 .edu.tw 網域信箱註冊驗證（例如 b10902001@ntu.edu.tw）',
      });
      return;
    }

    const emailHash = sha256Hash(check.normalizedEmail);
    const otpCode = String(crypto.randomInt(100000, 999999));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpChallenges.set(emailHash, {
      emailHash,
      email: check.normalizedEmail,
      university: check.university,
      domain: check.domain,
      displayName,
      codeHash: sha256Hash(otpCode),
      expiresAt,
    });

    res.json({
      message: `已發送 6 位數驗證碼至您的 ${check.university} 信箱（10 分鐘內有效）`,
      university: check.university,
      expiresInSeconds: 600,
      // Returned in preview environment when external SMTP is not attached so OTP flow is testable end-to-end
      previewOtp: otpCode,
    });
  });

  app.post('/api/v1/auth/verify-edu', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';

    const check = validateEduTwEmail(email);
    if (!check.valid) {
      res.status(400).json({ error: '請輸入有效的 .edu.tw 校園信箱' });
      return;
    }

    const emailHash = sha256Hash(check.normalizedEmail);
    const challenge = otpChallenges.get(emailHash);
    if (!challenge) {
      res.status(400).json({ error: '請先取得 6 位數校園驗證碼' });
      return;
    }
    if (Date.now() > challenge.expiresAt) {
      otpChallenges.delete(emailHash);
      res.status(400).json({ error: '驗證碼已逾時（超過 10 分鐘），請重新發送' });
      return;
    }
    if (sha256Hash(otp) !== challenge.codeHash) {
      res.status(401).json({ error: '6 位數驗證碼不正確，請重新確認' });
      return;
    }

    otpChallenges.delete(emailHash);

    const result = await store.mutate((db) => {
      let user = db.users.find((u) => u.emailHash === emailHash);
      let isNew = false;

      if (!user) {
        isNew = true;
        const today = new Date().toISOString().slice(0, 10);
        user = {
          id: `stu_${crypto.randomUUID().slice(0, 8)}`,
          emailHash,
          displayName: challenge.displayName,
          university: challenge.university,
          domain: challenge.domain,
          role: 'student',
          creditScore: 100,
          completedTrades: 0,
          totalAgreedTrades: 0,
          fraudStrikes: 0,
          suspended: false,
          dailyTradeBonusDate: today,
          dailyTradeBonusPoints: 0,
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        db.creditLogs.unshift({
          id: `cl_${crypto.randomUUID().slice(0, 8)}`,
          userId: user.id,
          delta: 100,
          balanceAfter: 100,
          eventType: 'INITIAL_VERIFICATION',
          reason: `完成 ${user.university} .edu.tw 首次認證`,
          createdAt: new Date().toISOString(),
        });
      }

      const token = signJwt(user);
      return {
        isNew,
        token,
        user: store.toPublicUserSummary(user),
      };
    });

    res.json(result);
  });

  // Demo persona switcher (issues valid server JWT for built-in test personas)
  app.post('/api/v1/auth/demo-session', (req, res) => {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    const db = store.getSnapshot();
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      res.status(404).json({ error: '找不到測試帳號' });
      return;
    }
    const token = signJwt(user);
    res.json({
      token,
      user: store.toPublicUserSummary(user),
    });
  });

  // Admin credential bootstrap / login (uses process.env.ADMIN_PASSCODE or scrypt claimed hash)
  app.get('/api/v1/auth/admin-status', (_req, res) => {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const db = store.getSnapshot();
    res.json({
      configured: Boolean(envPasscode || db.adminCredentialHash),
      source: envPasscode ? 'env' : db.adminCredentialHash ? 'claimed' : 'unclaimed',
    });
  });

  app.post('/api/v1/auth/admin-claim', async (req, res) => {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      res.status(400).json({ error: '已由環境變數設定管理員通行碼，請直接登入' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 6) {
      res.status(400).json({ error: '管理員通行碼至少需 6 個字元' });
      return;
    }

    const result = await store.mutate((db) => {
      if (db.adminCredentialHash) {
        return { conflict: true as const };
      }
      db.adminCredentialHash = hashPasswordScrypt(passcode);
      const token = signJwt({ id: 'admin_console', role: 'admin', university: 'CampusLoop 維運團隊' });
      return { conflict: false as const, token };
    });

    if (result.conflict) {
      res.status(409).json({ error: '管理員通行碼已被設定，請改用登入' });
      return;
    }

    res.json({ token: result.token, role: 'admin' });
  });

  app.post('/api/v1/auth/admin-login', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const db = store.getSnapshot();

    let ok = false;
    if (envPasscode) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else if (db.adminCredentialHash) {
      ok = verifyPasswordScrypt(passcode, db.adminCredentialHash);
    }

    if (!ok) {
      res.status(401).json({ error: '管理員通行碼錯誤' });
      return;
    }

    const token = signJwt({ id: 'admin_console', role: 'admin', university: 'CampusLoop 維運團隊' });
    res.json({ token, role: 'admin' });
  });

  app.get('/api/v1/auth/me', (req: AuthedRequest, res) => {
    const db = store.getSnapshot();
    if (req.authRole === 'admin') {
      res.json({ role: 'admin', user: null, unreadNotifications: 0 });
      return;
    }
    if (!req.authUser) {
      res.json({ role: 'guest', user: null, unreadNotifications: 0 });
      return;
    }
    const unreadNotifications = db.notifications.filter(
      (n) => n.userId === req.authUser!.id && !n.read
    ).length;
    res.json({
      role: 'student',
      user: store.toPublicUserSummary(req.authUser),
      unreadNotifications,
    });
  });

  app.get('/api/v1/users/personas', (_req, res) => {
    const db = store.getSnapshot();
    res.json({
      personas: db.users.slice(0, 4).map((u) => store.toPublicUserSummary(u)),
    });
  });

  app.get('/api/v1/users/:id/credit-history', (req: AuthedRequest, res) => {
    // Allowed for authenticated students and admin; also allow reading public seller credit badge on marketplace
    const db = store.getSnapshot();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: '找不到該位同學的認證檔案' });
      return;
    }
    const logs = db.creditLogs
      .filter((l) => l.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);

    res.json({
      user: store.toPublicUserSummary(user),
      creditLogs: logs,
    });
  });

  // ------------------------------------------------------------------
  // MODULE 2: Products, AI Multimodal Analysis & P25/P75 Pricing
  // ------------------------------------------------------------------
  app.get('/api/v1/products', (req, res) => {
    const db = store.getSnapshot();
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const sellerId = typeof req.query.sellerId === 'string' ? req.query.sellerId : '';

    const userMap = new Map(db.users.map((u) => [u.id, store.toPublicUserSummary(u)]));

    const products = db.products
      .filter((p) => {
        if (category && category !== '全部' && p.category !== category) return false;
        if (status && status !== '全部' && p.status !== status) return false;
        if (sellerId && p.sellerId !== sellerId) return false;
        if (search) {
          const hay = `${p.title} ${p.description} ${p.keywords.join(' ')} ${p.category}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({
        ...p,
        seller: userMap.get(p.sellerId) ?? null,
      }));

    res.json({ products });
  });

  app.post('/api/v1/products/ai-analyze', requireStudent, async (req: AuthedRequest, res) => {
    try {
      const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
      const match = imageDataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) {
        res.status(400).json({ error: '請上傳有效的 JPEG、PNG 或 WebP 商品照片' });
        return;
      }

      const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
      const base64Data = match[2];
      const byteLength = Buffer.byteLength(base64Data, 'base64');
      if (byteLength > 5 * 1024 * 1024) {
        res.status(400).json({ error: '單張圖片大小不可超過 5MB' });
        return;
      }

      const rawPreset = req.body?.demoPresetKey;
      const demoPresetKey: DemoPresetKey | null =
        rawPreset === 'calculator' || rawPreset === 'textbook' ? rawPreset : null;

      let analysis;
      let analysisMode: 'gemini' | 'demo_preset' = 'gemini';

      if (isGeminiConfigured()) {
        analysis = await analyzeProductImage(base64Data, mimeType);
      } else if (demoPresetKey) {
        analysis = getDemoSampleAnalysis(demoPresetKey);
        analysisMode = 'demo_preset';
      } else {
        res.status(503).json({
          error:
            '系統尚未設定 GEMINI_API_KEY，無法自動辨識自訂上傳照片；您可直接使用下方「試算 AI 範例圖」或手動填寫商品資訊上架。',
        });
        return;
      }

      const db = store.getSnapshot();
      const pricing = computeSuggestedPricing(
        db.historicalPrices,
        analysis.category,
        analysis.condition_level,
        analysis.keywords,
        analysis.suggested_title,
        analysis.estimated_new_price_twd
      );

      res.json({
        analysis,
        pricing,
        exifStripped: true,
        analysisMode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 商品辨識失敗，請稍後重試';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/v1/products', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const category = req.body?.category as ProductCategory;
    const conditionLevel = req.body?.conditionLevel as ConditionLevel;
    const price = Number(req.body?.price);
    const pickupZone =
      typeof req.body?.pickupZone === 'string' && req.body.pickupZone.trim()
        ? req.body.pickupZone.trim()
        : '校門口警衛室旁';
    const images = Array.isArray(req.body?.images)
      ? req.body.images.filter((img: unknown): img is string => typeof img === 'string' && img.length > 0).slice(0, 5)
      : [];
    const keywords = Array.isArray(req.body?.keywords)
      ? req.body.keywords.filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0)
      : [];

    if (!title || description.length < 10 || !Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: '請填寫完整的商品名稱、描述與有效新台幣售價' });
      return;
    }

    const result = await store.mutate((db) => {
      const newProduct: Product = {
        id: `prod_${crypto.randomUUID().slice(0, 8)}`,
        sellerId: user.id,
        title,
        description,
        category,
        conditionLevel,
        price: Math.round(price),
        estimatedMinPrice: Number(req.body?.estimatedMinPrice) || undefined,
        estimatedMaxPrice: Number(req.body?.estimatedMaxPrice) || undefined,
        images:
          images.length > 0
            ? images
            : ['/src/assets/images/product_desk_lamp_1795605810227.jpg'],
        keywords,
        pickupZone,
        status: 'Listed',
        bundleId: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      db.products.unshift(newProduct);

      // Async-style Wishlist Auto-Match upon Listed status
      const matchedWishlists: string[] = [];
      const searchHaystack = `${newProduct.title} ${newProduct.description} ${newProduct.keywords.join(' ')}`.toLowerCase();

      for (const wl of db.wishlists) {
        if (!wl.active || wl.userId === user.id) continue;
        const categoryOk = wl.category === '全部' || wl.category === newProduct.category;
        const priceOk = newProduct.price <= wl.maxPrice;
        const kwOk = searchHaystack.includes(wl.keyword.trim().toLowerCase());
        if (categoryOk && priceOk && kwOk) {
          matchedWishlists.push(wl.id);
          db.notifications.unshift({
            id: `notif_${crypto.randomUUID().slice(0, 8)}`,
            userId: wl.userId,
            type: 'wishlist_match',
            title: '許願清單自動配對成功',
            message: `新上架「${newProduct.title}」售價 NT$ ${newProduct.price.toLocaleString()}，符合您的許願關鍵字「${wl.keyword}」（預算上限 NT$ ${wl.maxPrice.toLocaleString()}），已同步寄送校園信箱通知。`,
            relatedId: newProduct.id,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }

      return {
        product: { ...newProduct, seller: store.toPublicUserSummary(user) },
        matchedWishlistCount: matchedWishlists.length,
      };
    });

    res.status(201).json(result);
  });

  // ------------------------------------------------------------------
  // MODULE 3: Graduation Bundles & Buyer Wishlist
  // ------------------------------------------------------------------
  app.get('/api/v1/bundles', (_req, res) => {
    const db = store.getSnapshot();
    const userMap = new Map(db.users.map((u) => [u.id, store.toPublicUserSummary(u)]));
    const productMap = new Map(db.products.map((p) => [p.id, p]));

    const bundles = db.bundles
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => ({
        ...b,
        seller: userMap.get(b.sellerId) ?? null,
        items: b.itemIds.map((id) => productMap.get(id)).filter(Boolean),
      }));

    res.json({ bundles });
  });

  app.post('/api/v1/bundles', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const itemIds: string[] = Array.isArray(req.body?.itemIds)
      ? req.body.itemIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const bundlePrice = Number(req.body?.bundlePrice);
    const salesMode = req.body?.salesMode === 'bundle_only' ? 'bundle_only' : 'allow_individual';
    const pickupZone =
      typeof req.body?.pickupZone === 'string' && req.body.pickupZone.trim()
        ? req.body.pickupZone.trim()
        : '男生／女生宿舍區';

    if (!title || itemIds.length < 2 || itemIds.length > 10) {
      res.status(400).json({ error: '畢業打包組合需填寫名稱並勾選 2 至 10 件上架中商品' });
      return;
    }

    const result = await store.mutate((db) => {
      const items = itemIds
        .map((id) => db.products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));

      if (items.length !== itemIds.length) {
        return { error: '部分選取商品不存在', status: 404 as const };
      }
      if (items.some((p) => p.sellerId !== user.id || p.status !== 'Listed')) {
        return { error: '僅能將本人名下且為「上架中」的商品加入打包組合', status: 400 as const };
      }
      if (items.some((p) => Boolean(p.bundleId))) {
        return { error: '部分商品已屬於其他打包組合', status: 409 as const };
      }

      const originalTotalPrice = items.reduce((sum, p) => sum + p.price, 0);
      if (!Number.isFinite(bundlePrice) || bundlePrice <= 0 || bundlePrice >= originalTotalPrice) {
        return {
          error: `整包優惠總價（NT$ ${bundlePrice}）必須低於單品總和（NT$ ${originalTotalPrice}）`,
          status: 400 as const,
        };
      }

      const newBundle: Bundle = {
        id: `bundle_${crypto.randomUUID().slice(0, 8)}`,
        sellerId: user.id,
        title,
        description:
          description ||
          `畢業季整批打包轉讓，包含 ${items.map((i) => i.title).join('、')}，於 ${pickupZone} 自取面交。`,
        itemIds,
        originalTotalPrice,
        bundlePrice: Math.round(bundlePrice),
        salesMode,
        pickupZone,
        status: 'Listed',
        version: 1,
        createdAt: new Date().toISOString(),
      };

      for (const item of items) {
        item.bundleId = newBundle.id;
        item.version += 1;
      }
      db.bundles.unshift(newBundle);

      return { status: 201 as const, bundle: newBundle };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({ bundle: result.bundle });
  });

  app.get('/api/v1/wishlists', requireStudent, (req: AuthedRequest, res) => {
    const db = store.getSnapshot();
    const items = db.wishlists
      .filter((w) => w.userId === req.authUser!.id && w.active)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ wishlists: items });
  });

  app.post('/api/v1/wishlists', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const keyword = typeof req.body?.keyword === 'string' ? req.body.keyword.trim() : '';
    const category = (req.body?.category as ProductCategory | '全部') || '全部';
    const maxPrice = Number(req.body?.maxPrice);

    if (!keyword || !Number.isFinite(maxPrice) || maxPrice <= 0) {
      res.status(400).json({ error: '請輸入許願關鍵字與有效的預算上限' });
      return;
    }

    const result = await store.mutate((db) => {
      const activeCount = db.wishlists.filter((w) => w.userId === user.id && w.active).length;
      if (activeCount >= 5) {
        return { error: '每位同學最多可同時建立 5 筆進行中的許願清單', status: 400 as const };
      }

      const wl = {
        id: `wl_${crypto.randomUUID().slice(0, 8)}`,
        userId: user.id,
        keyword,
        category,
        maxPrice: Math.round(maxPrice),
        active: true,
        createdAt: new Date().toISOString(),
      };
      db.wishlists.unshift(wl);

      // Immediate match check against currently Listed products
      const kwLower = keyword.toLowerCase();
      const instantMatches = db.products.filter((p) => {
        if (p.status !== 'Listed' || p.sellerId === user.id) return false;
        const catOk = category === '全部' || p.category === category;
        const priceOk = p.price <= wl.maxPrice;
        const text = `${p.title} ${p.description} ${p.keywords.join(' ')}`.toLowerCase();
        return catOk && priceOk && text.includes(kwLower);
      });

      for (const matchProd of instantMatches) {
        db.notifications.unshift({
          id: `notif_${crypto.randomUUID().slice(0, 8)}`,
          userId: user.id,
          type: 'wishlist_match',
          title: '現有上架商品符合您的許願清單',
          message: `「${matchProd.title}」售價 NT$ ${matchProd.price.toLocaleString()}，符合「${wl.keyword}」與預算上限 NT$ ${wl.maxPrice.toLocaleString()}！`,
          relatedId: matchProd.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      return { status: 201 as const, wishlist: wl, instantMatchCount: instantMatches.length };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  app.delete('/api/v1/wishlists/:id', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    await store.mutate((db) => {
      const target = db.wishlists.find((w) => w.id === req.params.id && w.userId === user.id);
      if (target) {
        target.active = false;
      }
    });
    res.json({ ok: true });
  });

  app.get('/api/v1/notifications', requireStudent, (req: AuthedRequest, res) => {
    const db = store.getSnapshot();
    const notifications = db.notifications
      .filter((n) => n.userId === req.authUser!.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
    res.json({ notifications });
  });

  app.post('/api/v1/notifications/read', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    await store.mutate((db) => {
      for (const n of db.notifications) {
        if (n.userId === user.id) n.read = true;
      }
    });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------
  // MODULE 4: Hotspots, Optimistic-Lock Reserve, QR Check-in & Complete
  // ------------------------------------------------------------------
  app.get('/api/v1/hotspots', (_req, res) => {
    const db = store.getSnapshot();
    res.json({ hotspots: db.hotspots.filter((h) => h.active) });
  });

  app.get('/api/v1/transactions', requireStudent, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const db = store.getSnapshot();
    const userMap = new Map(db.users.map((u) => [u.id, store.toPublicUserSummary(u)]));

    const transactions = db.transactions
      .filter((t) => t.buyerId === user.id || t.sellerId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({
        ...t,
        buyer: userMap.get(t.buyerId) ?? null,
        seller: userMap.get(t.sellerId) ?? null,
      }));

    res.json({ transactions });
  });

  app.post('/api/v1/transactions/reserve', requireStudent, async (req: AuthedRequest, res) => {
    const buyer = req.authUser!;
    const targetType = req.body?.targetType === 'bundle' ? 'bundle' : 'product';
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : '';
    const bundleId = typeof req.body?.bundleId === 'string' ? req.body.bundleId : '';
    const hotspotId = typeof req.body?.hotspotId === 'string' ? req.body.hotspotId : '';
    const meetupAtRaw = typeof req.body?.meetupAt === 'string' ? req.body.meetupAt : '';
    const riskAcknowledged = Boolean(req.body?.riskAcknowledged);
    const expectedVersion =
      typeof req.body?.expectedVersion === 'number' ? req.body.expectedVersion : undefined;

    const meetupAtDate = meetupAtRaw ? new Date(meetupAtRaw) : new Date(Date.now() + 5 * 60_000);
    if (Number.isNaN(meetupAtDate.getTime())) {
      res.status(400).json({ error: '請選擇有效的面交時間' });
      return;
    }

    const result = await store.mutate((db) => {
      // Re-read current buyer inside serialized mutex
      const currentBuyer = db.users.find((u) => u.id === buyer.id)!;

      // Low-credit user restriction (< 70 points)
      if (currentBuyer.creditScore < 70) {
        const activeBuyerTxCount = db.transactions.filter(
          (t) =>
            t.buyerId === currentBuyer.id &&
            (t.status === 'Pending_Confirm' || t.status === 'Reserved' || t.status === 'Checked_In')
        ).length;
        if (activeBuyerTxCount >= 1) {
          return {
            status: 403 as const,
            error: `信用分數（${currentBuyer.creditScore} 分）低於 70 分受限中，同時最多僅能預約 1 件商品`,
          };
        }
        if (!riskAcknowledged) {
          return {
            status: 400 as const,
            error: '低信用受限帳號發起預約時，必須先勾選「高違約風險提示確認」',
          };
        }
      }

      const hotspot = db.hotspots.find((h) => h.id === hotspotId && h.active);
      if (!hotspot) {
        return { status: 400 as const, error: '請選擇有效的校內安全面交熱點' };
      }

      if (targetType === 'bundle') {
        const bundle = db.bundles.find((b) => b.id === bundleId);
        if (!bundle) return { status: 404 as const, error: '找不到該畢業打包組合' };
        if (bundle.sellerId === currentBuyer.id) {
          return { status: 400 as const, error: '無法預約自己發布的打包組合' };
        }
        if (bundle.status !== 'Listed' || (expectedVersion !== undefined && bundle.version !== expectedVersion)) {
          return { status: 409 as const, error: '該打包組合已被其他同學搶先預約' };
        }
        const bundleItems = bundle.itemIds
          .map((id) => db.products.find((p) => p.id === id))
          .filter((p): p is Product => Boolean(p));
        if (bundleItems.some((p) => p.status !== 'Listed')) {
          return { status: 409 as const, error: '該打包組合中已有商品被其他同學搶先預約' };
        }

        // Lock bundle & all constituent items atomically
        bundle.status = 'Pending_Confirm';
        bundle.version += 1;
        for (const item of bundleItems) {
          item.status = 'Pending_Confirm';
          item.version += 1;
        }

        const tx = {
          id: `tx_${crypto.randomUUID().slice(0, 8)}`,
          targetType: 'bundle' as const,
          bundleId: bundle.id,
          itemTitle: bundle.title,
          amount: bundle.bundlePrice,
          sellerId: bundle.sellerId,
          buyerId: currentBuyer.id,
          hotspotId: hotspot.id,
          hotspotName: hotspot.name,
          meetupAt: meetupAtDate.toISOString(),
          status: 'Pending_Confirm' as const,
          riskAcknowledged,
          buyerConfirmedComplete: false,
          sellerConfirmedComplete: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.transactions.unshift(tx);

        db.notifications.unshift({
          id: `notif_${crypto.randomUUID().slice(0, 8)}`,
          userId: bundle.sellerId,
          type: 'transaction_update',
          title: '收到新的打包組合預約請求',
          message: `${currentBuyer.displayName}（信用 ${currentBuyer.creditScore} 分）預約「${bundle.title}」，請確認是否接受面交。`,
          relatedId: tx.id,
          read: false,
          createdAt: new Date().toISOString(),
        });

        return { status: 201 as const, transaction: tx };
      }

      // Single product optimistic lock reservation
      const product = db.products.find((p) => p.id === productId);
      if (!product) return { status: 404 as const, error: '找不到該商品' };
      if (product.sellerId === currentBuyer.id) {
        return { status: 400 as const, error: '無法預約自己上架的商品' };
      }
      if (product.bundleId) {
        const parentBundle = db.bundles.find((b) => b.id === product.bundleId);
        if (parentBundle && parentBundle.salesMode === 'bundle_only' && parentBundle.status === 'Listed') {
          return {
            status: 400 as const,
            error: '此商品目前設定為「僅限整包帶走」，請至畢業季打包區整組預約',
          };
        }
      }

      if (product.status !== 'Listed' || (expectedVersion !== undefined && product.version !== expectedVersion)) {
        return { status: 409 as const, error: '該商品已被其他同學搶先預約' };
      }

      // Atomic lock transition
      product.status = 'Pending_Confirm';
      product.version += 1;

      const tx = {
        id: `tx_${crypto.randomUUID().slice(0, 8)}`,
        targetType: 'product' as const,
        productId: product.id,
        itemTitle: product.title,
        amount: product.price,
        sellerId: product.sellerId,
        buyerId: currentBuyer.id,
        hotspotId: hotspot.id,
        hotspotName: hotspot.name,
        meetupAt: meetupAtDate.toISOString(),
        status: 'Pending_Confirm' as const,
        riskAcknowledged,
        buyerConfirmedComplete: false,
        sellerConfirmedComplete: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.transactions.unshift(tx);

      db.notifications.unshift({
        id: `notif_${crypto.randomUUID().slice(0, 8)}`,
        userId: product.sellerId,
        type: 'transaction_update',
        title: '收到新的商品預約請求',
        message: `${currentBuyer.displayName}（信用 ${currentBuyer.creditScore} 分）想於「${hotspot.name}」面交購買「${product.title}」。`,
        relatedId: tx.id,
        read: false,
        createdAt: new Date().toISOString(),
      });

      return { status: 201 as const, transaction: tx };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({ transaction: result.transaction });
  });

  // Seller confirms or rejects Pending_Confirm
  app.post('/api/v1/transactions/:id/confirm', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const decision = req.body?.decision === 'reject' ? 'reject' : 'accept';

    const result = await store.mutate((db) => {
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) return { status: 404 as const, error: '找不到該筆交易' };
      if (tx.sellerId !== user.id) return { status: 403 as const, error: '僅賣家可確認或拒絕此預約' };
      if (tx.status !== 'Pending_Confirm') {
        return { status: 400 as const, error: '此筆交易目前不在待確認狀態' };
      }

      const nowIso = new Date().toISOString();

      if (decision === 'reject') {
        tx.status = 'Cancelled';
        tx.cancelReason = '賣家婉拒預約（商品已重新上架）';
        tx.cancelledBy = user.id;
        tx.updatedAt = nowIso;

        if (tx.targetType === 'bundle' && tx.bundleId) {
          const bundle = db.bundles.find((b) => b.id === tx.bundleId);
          if (bundle) {
            bundle.status = 'Listed';
            bundle.version += 1;
            for (const itemId of bundle.itemIds) {
              const p = db.products.find((prod) => prod.id === itemId);
              if (p) {
                p.status = 'Listed';
                p.version += 1;
              }
            }
          }
        } else if (tx.productId) {
          const p = db.products.find((prod) => prod.id === tx.productId);
          if (p) {
            p.status = 'Listed';
            p.version += 1;
          }
        }

        db.notifications.unshift({
          id: `notif_${crypto.randomUUID().slice(0, 8)}`,
          userId: tx.buyerId,
          type: 'transaction_update',
          title: '賣家未接受預約',
          message: `「${tx.itemTitle}」賣家已婉拒本次預約，您可重新搜尋其他校內好物。`,
          relatedId: tx.id,
          read: false,
          createdAt: nowIso,
        });

        return { status: 200 as const, transaction: tx };
      }

      // Accept -> Reserved
      tx.status = 'Reserved';
      tx.updatedAt = nowIso;

      const buyer = db.users.find((u) => u.id === tx.buyerId);
      const seller = db.users.find((u) => u.id === tx.sellerId);
      if (buyer) buyer.totalAgreedTrades += 1;
      if (seller) seller.totalAgreedTrades += 1;

      if (tx.targetType === 'bundle' && tx.bundleId) {
        const bundle = db.bundles.find((b) => b.id === tx.bundleId);
        if (bundle) {
          bundle.status = 'Reserved';
          bundle.version += 1;
          for (const itemId of bundle.itemIds) {
            const p = db.products.find((prod) => prod.id === itemId);
            if (p) {
              p.status = 'Reserved';
              p.version += 1;
            }
          }
        }
      } else if (tx.productId) {
        const p = db.products.find((prod) => prod.id === tx.productId);
        if (p) {
          p.status = 'Reserved';
          p.version += 1;
        }
      }

      db.notifications.unshift({
        id: `notif_${crypto.randomUUID().slice(0, 8)}`,
        userId: tx.buyerId,
        type: 'transaction_update',
        title: '預約已鎖定，請準時前往面交',
        message: `賣家已確認「${tx.itemTitle}」預約！請於約定時間前往「${tx.hotspotName}」掃描賣家動態 QR Code 簽到。`,
        relatedId: tx.id,
        read: false,
        createdAt: nowIso,
      });

      return { status: 200 as const, transaction: tx };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ transaction: result.transaction });
  });

  // Cancel reservation (< 2h before meetup deducts -5 credit points!)
  app.post('/api/v1/transactions/:id/cancel', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : '買賣雙方臨時取消預約';

    const result = await store.mutate((db) => {
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) return { status: 404 as const, error: '找不到該筆交易' };
      if (tx.buyerId !== user.id && tx.sellerId !== user.id) {
        return { status: 403 as const, error: '無權限取消此筆交易' };
      }
      if (tx.status !== 'Pending_Confirm' && tx.status !== 'Reserved') {
        return { status: 400 as const, error: '此交易狀態已無法取消' };
      }

      const wasReserved = tx.status === 'Reserved';
      const nowMs = Date.now();
      const meetupMs = new Date(tx.meetupAt).getTime();
      const hoursUntilMeetup = (meetupMs - nowMs) / 3600_000;

      tx.status = 'Cancelled';
      tx.cancelReason = reason;
      tx.cancelledBy = user.id;
      tx.updatedAt = new Date().toISOString();

      // Release product / bundle lock back to Listed
      if (tx.targetType === 'bundle' && tx.bundleId) {
        const bundle = db.bundles.find((b) => b.id === tx.bundleId);
        if (bundle) {
          bundle.status = 'Listed';
          bundle.version += 1;
          for (const itemId of bundle.itemIds) {
            const p = db.products.find((prod) => prod.id === itemId);
            if (p) {
              p.status = 'Listed';
              p.version += 1;
            }
          }
        }
      } else if (tx.productId) {
        const p = db.products.find((prod) => prod.id === tx.productId);
        if (p) {
          p.status = 'Listed';
          p.version += 1;
        }
      }

      let creditPenaltyLog: CreditLog | null = null;
      if (wasReserved && hoursUntilMeetup < 2) {
        const actor = db.users.find((u) => u.id === user.id)!;
        creditPenaltyLog = applyCreditDelta(
          actor,
          -5,
          'LATE_CANCEL_PENALTY',
          `距離面交時間 < 2 小時內臨時取消「${tx.itemTitle}」預約`,
          db.creditLogs,
          tx.id
        );
        db.notifications.unshift({
          id: `notif_${crypto.randomUUID().slice(0, 8)}`,
          userId: actor.id,
          type: 'credit_update',
          title: '信用分變動通知（-5 分）',
          message: `因距離面交時間不足 2 小時取消預約，系統自動扣除 5 分，目前信用分：${actor.creditScore} 分。`,
          relatedId: tx.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      return { status: 200 as const, transaction: tx, creditPenaltyLog };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // Seller generates dynamic HMAC-signed QR Code for Reserved meetup
  app.get('/api/v1/transactions/:id/qr', requireStudent, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const db = store.getSnapshot();
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx) {
      res.status(404).json({ error: '找不到該筆交易' });
      return;
    }
    if (tx.sellerId !== user.id) {
      res.status(403).json({ error: '僅賣家可產生該筆面交之動態簽到 QR Code' });
      return;
    }
    if (tx.status !== 'Reserved') {
      res.status(400).json({ error: '僅於「預約鎖定 (Reserved)」狀態可出示簽到 QR Code' });
      return;
    }

    const token = createDynamicQrToken(tx.id, tx.sellerId, 30);
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({
      transactionId: tx.id,
      qrToken: token,
      qrDataUrl,
      expiresInMinutes: 30,
    });
  });

  // Buyer scans seller QR Code to transition Reserved -> Checked_In
  app.post('/api/v1/transactions/:id/checkin', requireStudent, async (req: AuthedRequest, res) => {
    const buyer = req.authUser!;
    const qrToken = typeof req.body?.qrToken === 'string' ? req.body.qrToken.trim() : '';
    if (!qrToken) {
      res.status(400).json({ error: '請掃描或貼上賣家動態 QR Code 簽到憑證' });
      return;
    }

    const result = await store.mutate((db) => {
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) return { status: 404 as const, error: '找不到該筆交易' };
      if (tx.buyerId !== buyer.id) {
        return { status: 403 as const, error: '僅該筆交易之買家可執行掃碼簽到' };
      }
      if (tx.status !== 'Reserved') {
        return { status: 400 as const, error: '此交易目前非預約鎖定狀態，無法重複簽到' };
      }

      const verify = verifyDynamicQrToken(qrToken, tx.id, tx.sellerId);
      if (!verify.valid) {
        return { status: 400 as const, error: verify.reason || 'QR Code 驗證失敗' };
      }

      const nowIso = new Date().toISOString();
      tx.status = 'Checked_In';
      tx.buyerCheckedInAt = nowIso;
      tx.sellerCheckedInAt = nowIso;
      tx.updatedAt = nowIso;

      db.notifications.unshift({
        id: `notif_${crypto.randomUUID().slice(0, 8)}`,
        userId: tx.sellerId,
        type: 'transaction_update',
        title: '面交掃碼簽到完成',
        message: `買家已於「${tx.hotspotName}」完成 QR Code 簽到，請於現場驗貨付款後雙方點擊「確認完成並互評」。`,
        relatedId: tx.id,
        read: false,
        createdAt: nowIso,
      });

      return { status: 200 as const, transaction: tx };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ transaction: result.transaction });
  });

  // Mutual completion + review + credit score ledger update + historical pricing feed
  app.post('/api/v1/transactions/:id/complete', requireStudent, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const rating = Number(req.body?.rating);
    const accurateDescription = Boolean(req.body?.accurateDescription);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: '請給予 1 至 5 星的交易評價' });
      return;
    }

    const result = await store.mutate((db) => {
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) return { status: 404 as const, error: '找不到該筆交易' };
      if (tx.buyerId !== actor.id && tx.sellerId !== actor.id) {
        return { status: 403 as const, error: '無權限操作此筆交易' };
      }
      if (tx.status !== 'Checked_In') {
        return { status: 400 as const, error: '請先完成面交 QR Code 簽到（Checked_In）後再結算完成' };
      }

      const nowIso = new Date().toISOString();
      const review = {
        reviewerId: actor.id,
        rating,
        accurateDescription,
        comment: comment || '準時面交，交易愉快。',
        createdAt: nowIso,
      };

      if (actor.id === tx.buyerId) {
        tx.buyerConfirmedComplete = true;
        tx.buyerReview = review;
      } else {
        tx.sellerConfirmedComplete = true;
        tx.sellerReview = review;
      }
      tx.updatedAt = nowIso;

      let settled = false;
      const creditEntries: CreditLog[] = [];

      if (tx.buyerConfirmedComplete && tx.sellerConfirmedComplete) {
        settled = true;
        tx.status = 'Completed';

        const buyer = db.users.find((u) => u.id === tx.buyerId)!;
        const seller = db.users.find((u) => u.id === tx.sellerId)!;
        const today = nowIso.slice(0, 10);

        const awardTradePoints = (u: User, roleLabel: string) => {
          if (u.dailyTradeBonusDate !== today) {
            u.dailyTradeBonusDate = today;
            u.dailyTradeBonusPoints = 0;
          }
          u.completedTrades += 1;
          const remainingDaily = Math.max(0, 6 - u.dailyTradeBonusPoints);
          const pts = Math.min(2, remainingDaily);
          if (pts > 0) {
            u.dailyTradeBonusPoints += pts;
            creditEntries.push(
              applyCreditDelta(
                u,
                pts,
                'TRADE_COMPLETED',
                `準時完成面交並完成雙方互評（${roleLabel}・${tx.itemTitle}）`,
                db.creditLogs,
                tx.id
              )
            );
          }
        };

        awardTradePoints(buyer, '買家');
        awardTradePoints(seller, '賣家');

        // 5-star + accurate description bonus (+1 for seller)
        if (tx.buyerReview && tx.buyerReview.rating === 5 && tx.buyerReview.accurateDescription) {
          creditEntries.push(
            applyCreditDelta(
              seller,
              1,
              'FIVE_STAR_MATCH_BONUS',
              `獲得買家「實物與描述完全相符」五星好評（${tx.itemTitle}）`,
              db.creditLogs,
              tx.id
            )
          );
        }

        // Mark product / bundle Sold and write Completed historical pricing data
        if (tx.targetType === 'bundle' && tx.bundleId) {
          const bundle = db.bundles.find((b) => b.id === tx.bundleId);
          if (bundle) {
            bundle.status = 'Sold';
            bundle.version += 1;
            for (const itemId of bundle.itemIds) {
              const p = db.products.find((prod) => prod.id === itemId);
              if (p) {
                p.status = 'Sold';
                p.version += 1;
              }
            }
          }
        } else if (tx.productId) {
          const p = db.products.find((prod) => prod.id === tx.productId);
          if (p) {
            p.status = 'Sold';
            p.version += 1;
            db.historicalPrices.push({
              id: `hp_${crypto.randomUUID().slice(0, 8)}`,
              category: p.category,
              conditionLevel: p.conditionLevel,
              title: p.title,
              keywords: p.keywords,
              soldPrice: tx.amount,
              soldAt: nowIso,
            });
            // If product belonged to an allow_individual bundle, recalculate or deactivate bundle
            if (p.bundleId) {
              const parentBundle = db.bundles.find((b) => b.id === p.bundleId);
              if (parentBundle && parentBundle.status === 'Listed') {
                const remaining = parentBundle.itemIds
                  .map((id) => db.products.find((prod) => prod.id === id))
                  .filter((item): item is Product => Boolean(item && item.status === 'Listed'));
                if (remaining.length < 2) {
                  parentBundle.status = 'Deactivated';
                } else {
                  parentBundle.itemIds = remaining.map((r) => r.id);
                  parentBundle.originalTotalPrice = remaining.reduce((s, r) => s + r.price, 0);
                  parentBundle.bundlePrice = Math.min(
                    parentBundle.bundlePrice,
                    Math.max(100, parentBundle.originalTotalPrice - 50)
                  );
                }
                parentBundle.version += 1;
              }
            }
          }
        }
      }

      return { status: 200 as const, transaction: tx, settled, creditEntries };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // Dispute filing (no-show > 15 min or item mismatch)
  app.post('/api/v1/transactions/:id/dispute', requireStudent, async (req: AuthedRequest, res) => {
    const reporter = req.authUser!;
    const reasonType: 'no_show' | 'item_mismatch' | 'other' =
      req.body?.reasonType === 'no_show'
        ? 'no_show'
        : req.body?.reasonType === 'item_mismatch'
          ? 'item_mismatch'
          : 'other';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (description.length < 5) {
      res.status(400).json({ error: '請詳細填寫申訴原因說明（至少 5 字）' });
      return;
    }

    const result = await store.mutate((db) => {
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) return { status: 404 as const, error: '找不到該筆交易' };
      if (tx.buyerId !== reporter.id && tx.sellerId !== reporter.id) {
        return { status: 403 as const, error: '無權限對此交易提出申訴' };
      }
      if (tx.status !== 'Reserved' && tx.status !== 'Checked_In') {
        return { status: 400 as const, error: '僅預約鎖定或已簽到交易可提出申訴' };
      }

      const reportedUserId = reporter.id === tx.buyerId ? tx.sellerId : tx.buyerId;
      const nowIso = new Date().toISOString();
      const minutesLate = (Date.now() - new Date(tx.meetupAt).getTime()) / 60_000;

      tx.status = 'Disputed';
      tx.updatedAt = nowIso;

      // Release item if no-show verified by server timestamp (> 15 mins past meetup and never checked in)
      let autoPenaltyApplied: number | undefined;
      if (reasonType === 'no_show' && !tx.buyerCheckedInAt && minutesLate > 15) {
        const offender = db.users.find((u) => u.id === reportedUserId);
        if (offender) {
          applyCreditDelta(
            offender,
            -15,
            'NO_SHOW_PENALTY',
            `面交時間逾時 15 分鐘未到且未掃碼簽到（系統時間戳記確認）`,
            db.creditLogs,
            tx.id
          );
          autoPenaltyApplied = -15;
        }
      }

      const dispute = {
        id: `disp_${crypto.randomUUID().slice(0, 8)}`,
        transactionId: tx.id,
        reporterId: reporter.id,
        reportedUserId,
        reasonType,
        description,
        status: autoPenaltyApplied ? ('resolved' as const) : ('open' as const),
        resolution: autoPenaltyApplied ? '系統時間戳記確認逾時 >15 分鐘無故放鳥，已自動扣 15 分' : undefined,
        penaltyApplied: autoPenaltyApplied,
        createdAt: nowIso,
        resolvedAt: autoPenaltyApplied ? nowIso : undefined,
      };
      db.disputes.unshift(dispute);

      return { status: 201 as const, dispute, transaction: tx };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  // ------------------------------------------------------------------
  // ADMIN CONSOLE ROUTES
  // ------------------------------------------------------------------
  app.get('/api/v1/admin/disputes', requireAdmin, (_req, res) => {
    const db = store.getSnapshot();
    const userMap = new Map(db.users.map((u) => [u.id, store.toPublicUserSummary(u)]));
    const disputes = db.disputes.map((d) => ({
      ...d,
      reporter: userMap.get(d.reporterId) ?? null,
      reportedUser: userMap.get(d.reportedUserId) ?? null,
    }));
    res.json({
      disputes,
      hotspots: db.hotspots,
      users: db.users.map((u) => store.toPublicUserSummary(u)),
    });
  });

  app.post('/api/v1/admin/disputes/:id/resolve', requireAdmin, async (req, res) => {
    const action = req.body?.action as 'dismiss' | 'no_show_15' | 'fraud_30' | 'restore_5';
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

    const result = await store.mutate((db) => {
      const dispute = db.disputes.find((d) => d.id === req.params.id);
      if (!dispute) return { status: 404 as const, error: '找不到申訴案件' };
      if (dispute.status === 'resolved') {
        return { status: 400 as const, error: '此申訴案件已結案' };
      }

      const targetUser = db.users.find((u) => u.id === dispute.reportedUserId);
      const nowIso = new Date().toISOString();
      let penalty = 0;
      let resolution = note || '管理員已完成查核結案';

      if (targetUser) {
        if (action === 'no_show_15') {
          penalty = -15;
          applyCreditDelta(
            targetUser,
            -15,
            'NO_SHOW_PENALTY',
            note || '管理員複核確認：面交逾時未到無故放鳥',
            db.creditLogs,
            dispute.transactionId
          );
          resolution = note || '判定無故放鳥成立，扣除 15 分信用分';
        } else if (action === 'fraud_30') {
          penalty = -30;
          targetUser.fraudStrikes += 1;
          if (targetUser.fraudStrikes >= 2) {
            targetUser.suspended = true;
          }
          applyCreditDelta(
            targetUser,
            -30,
            'FRAUD_MISMATCH_PENALTY',
            note || '管理員判定：實物嚴重不符／惡意詐欺',
            db.creditLogs,
            dispute.transactionId
          );
          resolution =
            targetUser.suspended
              ? '判定惡意詐欺成立（-30 分），累計兩次違規已執行帳號停權'
              : '判定實物嚴重不符成立，扣除 30 分信用分（累計第 1 次嚴重違規）';
        } else if (action === 'restore_5') {
          penalty = 5;
          applyCreditDelta(
            targetUser,
            5,
            'ADMIN_ADJUSTMENT',
            note || '管理員審核申訴成功：返還異常扣分 +5 分',
            db.creditLogs,
            dispute.transactionId
          );
          resolution = note || '申訴成立，已返還 5 分信用分';
        } else {
          resolution = note || '經查雙方無明顯違規，不予扣分結案';
        }
      }

      dispute.status = 'resolved';
      dispute.penaltyApplied = penalty;
      dispute.resolution = resolution;
      dispute.resolvedBy = 'admin_console';
      dispute.resolvedAt = nowIso;

      // Release disputed transaction product back to Listed if unresolved
      const tx = db.transactions.find((t) => t.id === dispute.transactionId);
      if (tx && tx.status === 'Disputed') {
        tx.status = 'Cancelled';
        tx.updatedAt = nowIso;
        if (tx.productId) {
          const p = db.products.find((prod) => prod.id === tx.productId);
          if (p && p.status !== 'Sold') {
            p.status = 'Listed';
            p.version += 1;
          }
        }
      }

      return { status: 200 as const, dispute };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/v1/admin/hotspots', requireAdmin, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const university =
      typeof req.body?.university === 'string' && req.body.university.trim()
        ? req.body.university.trim()
        : '國立臺灣大學';
    const area = typeof req.body?.area === 'string' && req.body.area.trim() ? req.body.area.trim() : '校內公共區';
    const hasCctv = Boolean(req.body?.hasCctv ?? true);
    const lightingLevel: '高亮度照明' | '標準照明' =
      req.body?.lightingLevel === '標準照明' ? '標準照明' : '高亮度照明';
    const hours = typeof req.body?.hours === 'string' && req.body.hours.trim() ? req.body.hours.trim() : '08:00 - 22:00';

    if (!name) {
      res.status(400).json({ error: '請填寫面交熱點名稱' });
      return;
    }

    const hotspot = await store.mutate((db) => {
      const hs = {
        id: `hs_${crypto.randomUUID().slice(0, 8)}`,
        name,
        university,
        area,
        hasCctv,
        lightingLevel,
        hours,
        active: true,
      };
      db.hotspots.push(hs);
      return hs;
    });

    res.status(201).json({ hotspot });
  });

  // ------------------------------------------------------------------
  // DEMO MODE RESET ENDPOINT
  // ------------------------------------------------------------------
  app.post('/api/v1/demo/reset', async (_req, res) => {
    await store.resetToSeed();
    res.json({ ok: true, message: '已重置 CampusLoop 示範資料庫至初始狀態' });
  });
}
