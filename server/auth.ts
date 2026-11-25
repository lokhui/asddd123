import crypto from 'node:crypto';
import type { User } from './types.ts';

function resolveSigningSecret(envValue: string | undefined, purpose: string): string {
  if (envValue && envValue.trim().length >= 16) {
    return envValue.trim();
  }
  const deploymentSeed =
    process.env.VERCEL_PROJECT_ID ||
    process.env.VERCEL_GIT_REPO_ID ||
    process.env.VERCEL_URL ||
    process.env.GEMINI_API_KEY ||
    process.env.APP_URL;
  if (deploymentSeed && deploymentSeed !== 'MY_GEMINI_API_KEY' && deploymentSeed !== 'MY_APP_URL') {
    return crypto.createHash('sha256').update(`campusloop:${purpose}:${deploymentSeed}`).digest('hex');
  }
  return crypto.randomBytes(32).toString('hex');
}

const JWT_SECRET = resolveSigningSecret(process.env.JWT_SECRET, 'jwt');
const QR_HMAC_SECRET = resolveSigningSecret(process.env.QR_HMAC_SECRET, 'qr-hmac');

const UNIVERSITY_DOMAIN_MAP: Record<string, string> = {
  'ntu.edu.tw': '國立臺灣大學',
  'nthu.edu.tw': '國立清華大學',
  'nycu.edu.tw': '國立陽明交通大學',
  'ncku.edu.tw': '國立成功大學',
  'nccu.edu.tw': '國立政治大學',
  'ntnu.edu.tw': '國立臺灣師範大學',
  'ntust.edu.tw': '國立臺灣科技大學',
  'ntut.edu.tw': '國立臺北科技大學',
  'ncu.edu.tw': '國立中央大學',
  'nsysu.edu.tw': '國立中山大學',
  'nchu.edu.tw': '國立中興大學',
  'fju.edu.tw': '輔仁大學',
  'tku.edu.tw': '淡江大學',
  'scu.edu.tw': '東吳大學',
};

export function validateEduTwEmail(rawEmail: string): {
  valid: boolean;
  normalizedEmail: string;
  domain: string;
  university: string;
} {
  const normalizedEmail = rawEmail.trim().toLowerCase();
  const match = normalizedEmail.match(/^[^\s@]+@([a-z0-9.-]+\.edu\.tw)$/i);
  if (!match) {
    return { valid: false, normalizedEmail, domain: '', university: '' };
  }
  const fullDomain = match[1].toLowerCase();
  // Match root *.edu.tw domain (e.g., g.ntu.edu.tw -> ntu.edu.tw or direct ntu.edu.tw)
  const parts = fullDomain.split('.');
  const rootEduDomain = parts.length >= 3 ? parts.slice(-3).join('.') : fullDomain;
  const university =
    UNIVERSITY_DOMAIN_MAP[fullDomain] ||
    UNIVERSITY_DOMAIN_MAP[rootEduDomain] ||
    `${rootEduDomain.split('.')[0].toUpperCase()} 校園`;

  return {
    valid: true,
    normalizedEmail,
    domain: rootEduDomain,
    university,
  };
}

export function sha256Hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface JwtPayload {
  sub: string;
  role: 'student' | 'admin';
  university: string;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replaceAll('-', '+').replaceAll('_', '/') + pad, 'base64').toString('utf8');
}

export function signJwt(user: Pick<User, 'id' | 'role' | 'university'>, ttlSeconds = 60 * 60 * 24): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadObj: JwtPayload = {
    sub: user.id,
    role: user.role,
    university: user.university,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const data = `${header}.${payload}`;
  const sig = base64UrlEncode(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const data = `${header}.${payload}`;
    const expectedSig = base64UrlEncode(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const parsed = JSON.parse(base64UrlDecode(payload)) as JwtPayload;
    if (!parsed.sub || typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface QrCheckinTokenPayload {
  transactionId: string;
  sellerId: string;
  exp: number;
  nonce: string;
  sig: string;
}

export function createDynamicQrToken(transactionId: string, sellerId: string, validMinutes = 30): string {
  const exp = Math.floor(Date.now() / 1000) + validMinutes * 60;
  const nonce = crypto.randomBytes(6).toString('hex');
  const message = `${transactionId}:${sellerId}:${exp}:${nonce}`;
  const sig = crypto.createHmac('sha256', QR_HMAC_SECRET).update(message).digest('hex');
  const payload: QrCheckinTokenPayload = { transactionId, sellerId, exp, nonce, sig };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function verifyDynamicQrToken(
  tokenString: string,
  expectedTransactionId: string,
  expectedSellerId: string
): { valid: boolean; reason?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(tokenString.trim(), 'base64url').toString('utf8')) as QrCheckinTokenPayload;
    if (
      !decoded ||
      decoded.transactionId !== expectedTransactionId ||
      decoded.sellerId !== expectedSellerId ||
      typeof decoded.exp !== 'number' ||
      !decoded.nonce ||
      !decoded.sig
    ) {
      return { valid: false, reason: 'QR Code 權杖與此筆交易不相符' };
    }
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: '此動態 QR Code 已過期，請賣家重新產生' };
    }
    const message = `${decoded.transactionId}:${decoded.sellerId}:${decoded.exp}:${decoded.nonce}`;
    const expectedSig = crypto.createHmac('sha256', QR_HMAC_SECRET).update(message).digest('hex');
    const actualBuf = Buffer.from(decoded.sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      return { valid: false, reason: 'QR Code HMAC 簽章驗證失敗' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: '無效的 QR Code 格式' };
  }
}
