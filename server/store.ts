import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256Hash } from './auth.ts';
import type { DatabaseState, Product, PublicUserSummary, Transaction, User } from './types.ts';

const BUNDLED_DATA_DIR = path.resolve(process.cwd(), 'data');
const BUNDLED_DB_PATH = path.join(BUNDLED_DATA_DIR, 'campusloop-db.json');
const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
);
const DATA_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), 'campusloop-data') : BUNDLED_DATA_DIR;
const DB_PATH = path.join(DATA_DIR, 'campusloop-db.json');

function createInitialSeed(): DatabaseState {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();

  const users: User[] = [
    {
      id: 'stu_lin',
      emailHash: sha256Hash('b10902042@ntu.edu.tw'),
      displayName: '林同學',
      university: '國立臺灣大學',
      domain: 'ntu.edu.tw',
      role: 'student',
      creditScore: 108,
      completedTrades: 6,
      totalAgreedTrades: 6,
      fraudStrikes: 0,
      suspended: false,
      dailyTradeBonusDate: now.toISOString().slice(0, 10),
      dailyTradeBonusPoints: 0,
      createdAt: daysAgo(90),
    },
    {
      id: 'stu_chen',
      emailHash: sha256Hash('r11921088@ntu.edu.tw'),
      displayName: '陳學長',
      university: '國立臺灣大學',
      domain: 'ntu.edu.tw',
      role: 'student',
      creditScore: 124,
      completedTrades: 14,
      totalAgreedTrades: 14,
      fraudStrikes: 0,
      suspended: false,
      dailyTradeBonusDate: now.toISOString().slice(0, 10),
      dailyTradeBonusPoints: 0,
      createdAt: daysAgo(180),
    },
    {
      id: 'stu_chang_low',
      emailHash: sha256Hash('b11501019@ntu.edu.tw'),
      displayName: '張同學',
      university: '國立臺灣大學',
      domain: 'ntu.edu.tw',
      role: 'student',
      creditScore: 65,
      completedTrades: 2,
      totalAgreedTrades: 5,
      fraudStrikes: 0,
      suspended: false,
      dailyTradeBonusDate: now.toISOString().slice(0, 10),
      dailyTradeBonusPoints: 0,
      createdAt: daysAgo(60),
    },
    {
      id: 'stu_wu_nthu',
      emailHash: sha256Hash('110062211@nthu.edu.tw'),
      displayName: '吳同學',
      university: '國立清華大學',
      domain: 'nthu.edu.tw',
      role: 'student',
      creditScore: 112,
      completedTrades: 8,
      totalAgreedTrades: 8,
      fraudStrikes: 0,
      suspended: false,
      dailyTradeBonusDate: now.toISOString().slice(0, 10),
      dailyTradeBonusPoints: 0,
      createdAt: daysAgo(120),
    },
  ];

  const creditLogs = [
    {
      id: 'cl_1',
      userId: 'stu_lin',
      delta: 100,
      balanceAfter: 100,
      eventType: 'INITIAL_VERIFICATION' as const,
      reason: '完成 國立臺灣大學 .edu.tw 信箱驗證',
      createdAt: daysAgo(90),
    },
    {
      id: 'cl_2',
      userId: 'stu_lin',
      delta: 2,
      balanceAfter: 102,
      eventType: 'TRADE_COMPLETED' as const,
      reason: '準時完成面交並完成雙方互評（線性代數原文書）',
      createdAt: daysAgo(24),
    },
    {
      id: 'cl_3',
      userId: 'stu_lin',
      delta: 2,
      balanceAfter: 104,
      eventType: 'TRADE_COMPLETED' as const,
      reason: '準時完成面交並完成雙方互評（羅技無線滑鼠）',
      createdAt: daysAgo(12),
    },
    {
      id: 'cl_4',
      userId: 'stu_lin',
      delta: 1,
      balanceAfter: 105,
      eventType: 'FIVE_STAR_MATCH_BONUS' as const,
      reason: '獲得買家「實物與描述完全相符」五星好評',
      createdAt: daysAgo(12),
    },
    {
      id: 'cl_5',
      userId: 'stu_lin',
      delta: 3,
      balanceAfter: 108,
      eventType: 'TRADE_COMPLETED' as const,
      reason: '完成面交與五星好評累積加分',
      createdAt: daysAgo(4),
    },
    {
      id: 'cl_6',
      userId: 'stu_chen',
      delta: 100,
      balanceAfter: 100,
      eventType: 'INITIAL_VERIFICATION' as const,
      reason: '完成 國立臺灣大學 .edu.tw 信箱驗證',
      createdAt: daysAgo(180),
    },
    {
      id: 'cl_7',
      userId: 'stu_chen',
      delta: 24,
      balanceAfter: 124,
      eventType: 'TRADE_COMPLETED' as const,
      reason: '累計 12 筆準時面交與賣家實物相符五星好評',
      createdAt: daysAgo(5),
    },
    {
      id: 'cl_8',
      userId: 'stu_chang_low',
      delta: 100,
      balanceAfter: 100,
      eventType: 'INITIAL_VERIFICATION' as const,
      reason: '完成 國立臺灣大學 .edu.tw 信箱驗證',
      createdAt: daysAgo(60),
    },
    {
      id: 'cl_9',
      userId: 'stu_chang_low',
      delta: -5,
      balanceAfter: 95,
      eventType: 'LATE_CANCEL_PENALTY' as const,
      reason: '距離面交時間 < 2 小時內臨時取消預約',
      createdAt: daysAgo(18),
    },
    {
      id: 'cl_10',
      userId: 'stu_chang_low',
      delta: -15,
      balanceAfter: 80,
      eventType: 'NO_SHOW_PENALTY' as const,
      reason: '面交逾時 15 分鐘未到且未掃描簽到（經確認無故放鳥）',
      createdAt: daysAgo(10),
    },
    {
      id: 'cl_11',
      userId: 'stu_chang_low',
      delta: -15,
      balanceAfter: 65,
      eventType: 'NO_SHOW_PENALTY' as const,
      reason: '面交逾時 15 分鐘未到且未掃描簽到（系統時間戳記確認）',
      createdAt: daysAgo(3),
    },
  ];

  const hotspots = [
    {
      id: 'hs_ntu_lib',
      name: '總圖書館一樓大廳服務台旁',
      university: '國立臺灣大學',
      area: '校內核心區',
      hasCctv: true,
      lightingLevel: '高亮度照明' as const,
      hours: '08:00 - 22:00',
      active: true,
    },
    {
      id: 'hs_ntu_huoda',
      name: '第一學生活動中心 7-11 超商前',
      university: '國立臺灣大學',
      area: '活大商圈',
      hasCctv: true,
      lightingLevel: '高亮度照明' as const,
      hours: '07:00 - 23:00',
      active: true,
    },
    {
      id: 'hs_ntu_gate',
      name: '校門口警衛室旁廣場',
      university: '國立臺灣大學',
      area: '公館校門',
      hasCctv: true,
      lightingLevel: '高亮度照明' as const,
      hours: '24 小時保全駐守',
      active: true,
    },
    {
      id: 'hs_ntu_dorm',
      name: '男一／女九宿舍區管理室大廳',
      university: '國立臺灣大學',
      area: '長興／校總區宿舍',
      hasCctv: true,
      lightingLevel: '標準照明' as const,
      hours: '09:00 - 22:30',
      active: true,
    },
  ];

  const products: Product[] = [
    {
      id: 'prod_calc_01',
      sellerId: 'stu_chen',
      title: 'Casio fx-991EX 工程科學計算機（含原廠滑蓋）',
      description:
        '大二修工數與電路學期間使用，按鍵回饋清脆、太陽能與電池供電皆正常，螢幕無刮傷且附原廠保護滑蓋，考場可用型號，畢業前釋出給學弟妹。',
      category: '3C 配件' as const,
      conditionLevel: '95% 新' as const,
      price: 450,
      estimatedMinPrice: 400,
      estimatedMaxPrice: 520,
      images: ['/src/assets/images/product_calculator_scientific_1795605809857.jpg'],
      keywords: ['計算機', 'Casio', '工程計算機', 'fx-991'],
      pickupZone: '校門口警衛室／公館捷運站',
      status: 'Listed' as const,
      bundleId: null,
      version: 1,
      createdAt: daysAgo(2),
    },
    {
      id: 'prod_lamp_01',
      sellerId: 'stu_chen',
      title: '米家 LED 智慧護眼檯燈 1S（無頻閃鋁合金款）',
      description:
        '租屋處自用 1 年半，支援色溫與亮度無段旋鈕調節，鋁合金燈臂轉軸緊實不垂頭，夜間趕論文讀書光線均勻不刺眼，外觀幾乎無使用痕跡。',
      category: '小家電' as const,
      conditionLevel: '95% 新' as const,
      price: 580,
      estimatedMinPrice: 500,
      estimatedMaxPrice: 650,
      images: ['/src/assets/images/product_desk_lamp_1795605810227.jpg'],
      keywords: ['檯燈', 'LED檯燈', '護眼檯燈', '米家'],
      pickupZone: '男生／女生宿舍區',
      status: 'Listed' as const,
      bundleId: 'bundle_grad_01',
      version: 1,
      createdAt: daysAgo(3),
    },
    {
      id: 'prod_fan_01',
      sellerId: 'stu_chen',
      title: '無印風極簡靜音 DC 直流循環扇（白）',
      description:
        '宿舍及小套房冷氣好搭檔，三段風速可調且低速運轉幾乎無聲，扇葉已拆洗清潔乾淨，底座穩固輕巧好搬運，畢業退租含燈具可一起帶走。',
      category: '小家電' as const,
      conditionLevel: '85% 新' as const,
      price: 620,
      estimatedMinPrice: 550,
      estimatedMaxPrice: 700,
      images: ['/src/assets/images/product_dorm_fan_1795605810275.jpg'],
      keywords: ['電風扇', '循環扇', 'DC扇', '靜音扇'],
      pickupZone: '男生／女生宿舍區',
      status: 'Listed' as const,
      bundleId: 'bundle_grad_01',
      version: 1,
      createdAt: daysAgo(3),
    },
    {
      id: 'prod_book_01',
      sellerId: 'stu_wu_nthu',
      title: '微積分與演算法精裝原文教科書組合（Calculus + CLRS）',
      description:
        '大一大二必修經典原文書兩冊合售，內頁僅有極少量鉛筆重點與便條標籤，書脊完整無破損泡水，字跡清晰易讀，適合資工與理工學院新生準備學期課程。',
      category: '教科書' as const,
      conditionLevel: '85% 新' as const,
      price: 880,
      estimatedMinPrice: 780,
      estimatedMaxPrice: 980,
      images: ['/src/assets/images/product_textbook_stack_1795605810825.jpg'],
      keywords: ['微積分', '演算法', '原文書', '教科書', 'Calculus'],
      pickupZone: '總圖書館一樓大廳',
      status: 'Listed' as const,
      bundleId: null,
      version: 1,
      createdAt: daysAgo(1),
    },
    {
      id: 'prod_hub_01',
      sellerId: 'stu_lin',
      title: '鋁合金 7 合 1 USB-C 多埠集線器（支援 4K HDMI / PD 快充）',
      description:
        'MacBook Air 外接螢幕與讀卡機使用，陽極氧化太空灰鋁殼散熱良好，編織線材無折損，SD 讀卡槽、USB-A 3.0 與 HDMI 接孔全數正常運作。',
      category: '3C 配件' as const,
      conditionLevel: '95% 新' as const,
      price: 520,
      estimatedMinPrice: 450,
      estimatedMaxPrice: 600,
      images: ['/src/assets/images/product_usbc_hub_1795605810784.jpg'],
      keywords: ['USB-C', '集線器', 'Hub', '轉接器', 'MacBook'],
      pickupZone: '學生活動中心超商前',
      status: 'Listed' as const,
      bundleId: null,
      version: 1,
      createdAt: daysAgo(1),
    },
  ];

  const bundles = [
    {
      id: 'bundle_grad_01',
      sellerId: 'stu_chen',
      title: '畢業退租・書桌雙寶整包帶走（LED 護眼檯燈 + 靜音 DC 循環扇）',
      description:
        '即將畢業退租搬離水源校區，將租屋處書桌必備的護眼檯燈與靜音循環扇打包優惠轉讓。兩件單買原價 NT$ 1,200，整組現省 NT$ 220，宿舍區面交一次帶走最方便。',
      itemIds: ['prod_lamp_01', 'prod_fan_01'],
      originalTotalPrice: 1200,
      bundlePrice: 980,
      salesMode: 'allow_individual' as const,
      pickupZone: '男生／女生宿舍區',
      status: 'Listed' as const,
      version: 1,
      createdAt: daysAgo(2),
    },
  ];

  const transactions: Transaction[] = [
    {
      id: 'tx_demo_reserved',
      targetType: 'product' as const,
      productId: 'prod_hub_01',
      itemTitle: '鋁合金 7 合 1 USB-C 多埠集線器（支援 4K HDMI / PD 快充）',
      amount: 520,
      sellerId: 'stu_lin',
      buyerId: 'stu_chen',
      hotspotId: 'hs_ntu_huoda',
      hotspotName: '第一學生活動中心 7-11 超商前',
      meetupAt: hoursFromNow(0.2), // within ±15 min window so AC-04 can be tested immediately!
      status: 'Reserved' as const,
      riskAcknowledged: false,
      buyerConfirmedComplete: false,
      sellerConfirmedComplete: false,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0),
    },
  ];
  // Keep prod_hub_01 Listed in catalog OR Reserved? Let's make a dedicated transaction product so catalog has 5 listed items AND tx_demo_reserved shows live QR flow cleanly!
  // Let's add a 6th product for tx_demo_reserved or keep prod_hub_01 as Listed and create a separate reserved item so catalog still shines.
  const reservedBookProduct = {
    id: 'prod_reserved_demo',
    sellerId: 'stu_chen',
    title: '線性代數導論（Gilbert Strang 5th Ed.）校內面交中',
    description:
      '保存良好九成新線性代數原文課本，已與買家約定今日於總圖一樓大廳面交簽到驗貨。',
    category: '教科書' as const,
    conditionLevel: '95% 新' as const,
    price: 480,
    estimatedMinPrice: 420,
    estimatedMaxPrice: 550,
    images: ['/src/assets/images/product_textbook_stack_1795605810825.jpg'],
    keywords: ['線性代數', '原文書', '教科書'],
    pickupZone: '總圖書館一樓大廳',
    status: 'Reserved' as const,
    bundleId: null,
    version: 2,
    createdAt: daysAgo(4),
  };
  products.push(reservedBookProduct);
  transactions[0] = {
    id: 'tx_demo_reserved',
    targetType: 'product',
    productId: 'prod_reserved_demo',
    itemTitle: reservedBookProduct.title,
    amount: 480,
    sellerId: 'stu_chen',
    buyerId: 'stu_lin',
    hotspotId: 'hs_ntu_lib',
    hotspotName: '總圖書館一樓大廳服務台旁',
    meetupAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    status: 'Reserved',
    riskAcknowledged: false,
    buyerConfirmedComplete: false,
    sellerConfirmedComplete: false,
    createdAt: daysAgo(1),
    updatedAt: now.toISOString(),
  };

  const wishlists = [
    {
      id: 'wl_1',
      userId: 'stu_lin',
      keyword: '計算機',
      category: '3C 配件' as const,
      maxPrice: 500,
      active: true,
      createdAt: daysAgo(2),
    },
    {
      id: 'wl_2',
      userId: 'stu_lin',
      keyword: '電風扇',
      category: '小家電' as const,
      maxPrice: 700,
      active: true,
      createdAt: daysAgo(1),
    },
  ];

  const notifications = [
    {
      id: 'notif_1',
      userId: 'stu_lin',
      type: 'wishlist_match' as const,
      title: '許願清單成功配對',
      message: '有同學新上架「Casio fx-991EX 工程科學計算機」，售價 NT$ 450 符合您的預算上限 NT$ 500！',
      relatedId: 'prod_calc_01',
      read: false,
      createdAt: daysAgo(1),
    },
  ];

  const disputes = [
    {
      id: 'disp_seed_1',
      transactionId: 'tx_past_dispute_sample',
      reporterId: 'stu_chen',
      reportedUserId: 'stu_chang_low',
      reasonType: 'no_show' as const,
      description: '約定 14:00 於校門口警衛室旁面交，等待至 14:25 對方仍未現身亦無訊息通知，申請管理員查核。',
      status: 'open' as const,
      createdAt: daysAgo(1),
    },
  ];

  const historicalPrices = [
    // 教科書 - 85% 新
    { id: 'hp_1', category: '教科書' as const, conditionLevel: '85% 新' as const, title: '微積分原文書 Calculus 9th', keywords: ['微積分', '教科書', 'Calculus'], soldPrice: 720, soldAt: daysAgo(45) },
    { id: 'hp_2', category: '教科書' as const, conditionLevel: '85% 新' as const, title: '資料結構與演算法教科書', keywords: ['演算法', '教科書', '原文書'], soldPrice: 820, soldAt: daysAgo(32) },
    { id: 'hp_3', category: '教科書' as const, conditionLevel: '85% 新' as const, title: '工程數學與微積分合集', keywords: ['微積分', '教科書'], soldPrice: 950, soldAt: daysAgo(20) },
    { id: 'hp_4', category: '教科書' as const, conditionLevel: '85% 新' as const, title: '線性代數原文教科書', keywords: ['線性代數', '教科書', '原文書'], soldPrice: 680, soldAt: daysAgo(15) },
    // 3C 配件 - 95% 新 (Calculators & Hubs)
    { id: 'hp_5', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'Casio fx-991ES PLUS 計算機', keywords: ['計算機', 'Casio', '工程計算機'], soldPrice: 380, soldAt: daysAgo(50) },
    { id: 'hp_6', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'Casio fx-991EX 工程計算機', keywords: ['計算機', 'Casio', 'fx-991'], soldPrice: 440, soldAt: daysAgo(28) },
    { id: 'hp_7', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'TI-36X Pro 科學計算機', keywords: ['計算機', '科學計算機'], soldPrice: 490, soldAt: daysAgo(19) },
    { id: 'hp_8', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'Casio 科學工程計算機', keywords: ['計算機', 'Casio'], soldPrice: 520, soldAt: daysAgo(9) },
    { id: 'hp_9', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'Anker USB-C 多合一轉接器', keywords: ['USB-C', '集線器', 'Hub'], soldPrice: 480, soldAt: daysAgo(22) },
    { id: 'hp_10', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'Type-C 7合1 筆電集線器', keywords: ['USB-C', '集線器', 'Hub'], soldPrice: 560, soldAt: daysAgo(14) },
    { id: 'hp_11', category: '3C 配件' as const, conditionLevel: '95% 新' as const, title: 'Baseus USB-C Hub 擴充座', keywords: ['USB-C', '集線器', 'Hub'], soldPrice: 610, soldAt: daysAgo(7) },
    // 小家電 - 95% 新 & 85% 新
    { id: 'hp_12', category: '小家電' as const, conditionLevel: '95% 新' as const, title: 'LED 護眼閱讀檯燈', keywords: ['檯燈', 'LED檯燈', '護眼'], soldPrice: 480, soldAt: daysAgo(40) },
    { id: 'hp_13', category: '小家電' as const, conditionLevel: '95% 新' as const, title: '米家檯燈 1S', keywords: ['檯燈', '米家', 'LED檯燈'], soldPrice: 560, soldAt: daysAgo(21) },
    { id: 'hp_14', category: '小家電' as const, conditionLevel: '95% 新' as const, title: 'BenQ WiT 學生檯燈', keywords: ['檯燈', '護眼檯燈'], soldPrice: 660, soldAt: daysAgo(11) },
    { id: 'hp_15', category: '小家電' as const, conditionLevel: '85% 新' as const, title: '宿舍小型循環電風扇', keywords: ['電風扇', '循環扇'], soldPrice: 520, soldAt: daysAgo(35) },
    { id: 'hp_16', category: '小家電' as const, conditionLevel: '85% 新' as const, title: 'DC 靜音桌上型電風扇', keywords: ['電風扇', 'DC扇', '循環扇'], soldPrice: 600, soldAt: daysAgo(17) },
    { id: 'hp_17', category: '小家電' as const, conditionLevel: '85% 新' as const, title: '無葉靜音空氣循環扇', keywords: ['電風扇', '循環扇'], soldPrice: 690, soldAt: daysAgo(8) },
  ];

  return {
    users,
    creditLogs,
    products,
    bundles,
    hotspots,
    transactions,
    wishlists,
    notifications,
    disputes,
    historicalPrices,
  };
}

class CampusStore {
  private state: DatabaseState;
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    this.state = this.loadOrSeed();
  }

  private loadOrSeed(): DatabaseState {
    try {
      const candidatePaths = IS_SERVERLESS ? [DB_PATH, BUNDLED_DB_PATH] : [DB_PATH];
      for (const filePath of candidatePaths) {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(raw) as DatabaseState;
          if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.products)) {
            if (filePath !== DB_PATH) {
              this.persistSync(parsed);
            }
            return parsed;
          }
        }
      }
    } catch (err) {
      console.error('Failed to read persisted database, falling back to clean seed:', err);
    }
    const seed = createInitialSeed();
    this.persistSync(seed);
    return seed;
  }

  private persistSync(snapshot: DatabaseState) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
      fs.renameSync(tmpPath, DB_PATH);
    } catch (err) {
      console.warn('Database persistence skipped (read-only or ephemeral environment):', err);
    }
  }

  public getSnapshot(): DatabaseState {
    return this.state;
  }

  /**
   * Serializes state mutations inside an async mutex so concurrent requests
   * (such as two buyers attempting to reserve the same item simultaneously)
   * execute strictly atomically and respect optimistic lock versions.
   */
  public async mutate<T>(fn: (draft: DatabaseState) => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const prevLock = this.lockPromise;
    this.lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prevLock;
    try {
      const result = await fn(this.state);
      this.persistSync(this.state);
      return result;
    } finally {
      release();
    }
  }

  public async resetToSeed(): Promise<DatabaseState> {
    return this.mutate(() => {
      const existingAdminHash = this.state.adminCredentialHash;
      const fresh = createInitialSeed();
      if (existingAdminHash) {
        fresh.adminCredentialHash = existingAdminHash;
      }
      this.state = fresh;
      return this.state;
    });
  }

  public toPublicUserSummary(user: User): PublicUserSummary {
    const fulfillmentRate =
      user.totalAgreedTrades > 0
        ? Math.min(100, Math.round((user.completedTrades / user.totalAgreedTrades) * 100))
        : 100;
    return {
      id: user.id,
      displayName: user.displayName,
      university: user.university,
      verifiedBadge: `已通過 ${user.university}認證`,
      creditScore: user.creditScore,
      fulfillmentRate,
      completedTrades: user.completedTrades,
      isRestricted: user.creditScore < 70,
      suspended: user.suspended,
    };
  }
}

export const store = new CampusStore();
