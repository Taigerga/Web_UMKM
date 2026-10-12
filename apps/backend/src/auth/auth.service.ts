import { Injectable } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { AppError } from '../common/errors/app-error.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { RefreshTokenService, hashRefreshToken } from './refresh-token.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import { PrismaService } from '../database/prisma.service.js';
import { normalizeEmail } from './email.util.js';
import { Role } from '../common/types/prisma-enums.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/audit-actions.js';
import type {
  Role as RoleType,
  StoreMemberRole,
  StoreStatus,
} from '../common/types/prisma-enums.js';

/**
 * Bentuk user yang BOLEH keluar ke client.
 *
 * Dipisah dari baris `users` Prisma supaya `passwordHash` tidak pernah punya
 * kesempatan ikut ke payload: field yang dikirim ditulis satu per satu, bukan
 * "sebutkan semua kecuali satu". Menambah field baru berarti edits disengaja,
 * bukan consequences tak terlihat.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: RoleType;
}

/** Satu toko yang boleh diakses user. */
export interface UserStoreAccess {
  id: string;
  name: string;
  role: StoreMemberRole;
  status: StoreStatus;
}

/** Hasil register/login/refresh: user + kedua token. */
export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Profil lengkap termasuk toko yang boleh diakses. */
export interface AuthProfile extends PublicUser {
  stores: UserStoreAccess[];
}

/**
 * Jumlah kegagalan login berturut-turut yang memicu lockout.
 * Spec 6.3: 10 gagal berturut-turut, lalu lock 15 menit lewat `lockedUntil`.
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 10;

/** Lama lockout dalam milidetik. */
export const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Pesan kegagalan login yang sama untuk email tidak dikenal, password salah,
 * dan akun terkunci.
 *
 * Kalau ketiganya punya pesan berbeda, endpoint ini jadi alat enumerasi akun:
 * penyerang bisa menebak email mana yang terdaftar. Rincian sebenarnya
 * (email tidak ada vs password salah) ditulis ke log server, bukan ke response.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Email atau password salah.';

/**
 * Autentikasi: daftar, masuk, rotasi refresh, keluar, dan profil diri.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Catat peristiwa autentikasi.
   *
   * `meta` sengaja KOSONG untuk seluruh peristiwa auth. Email akun adalah data
   * pribadi dan sudah ada di baris `users`; `entityId` sudah menunjuk user yang
   * sama. Yang tidak boleh masuk ke sini - dan tidak punya tempat lain yang
   * aman - adalah password dan refresh token.
   */
  private async auditAuth(
    action: string,
    userId: string | undefined,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actorId: userId,
      action,
      entity: 'user',
      entityId: userId,
      ...(meta ? { meta } : {}),
    });
  }

  /**
   * Buat akun baru.
   *
   * Role selalu `OWNER` dan tidak pernah diambil dari input: `RegisterDto`
   * memang tidak punya field `role`, dan `ValidationPipe` global memakai
   * `forbidNonWhitelisted` sehingga percobaan mengirim `role` ditolak dengan
   * `VALIDATION_ERROR`. Nilai di sini ditulis literal, jadi ada dua lapis
   * penolakan yang independen.
   *
   * Pendaftaran juga tidak membuat membership toko apa pun: user OWNER belum
   * punya toko sama sekali (membuat toko adalah task berikutnya).
   */
  async register(dto: RegisterDto): Promise<AuthSession> {
    const email = normalizeEmail(dto.email);
    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.users.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
        role: Role.OWNER,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    await this.auditAuth(AUDIT_ACTIONS.AUTH_REGISTER, user.id);

    return this.startSession(user);
  }

  /**
   * Verifikasi kredensial lalu terbitkan sesi baru.
   *
   * Password salah menaikkan `failedLoginCount`; setelah
   * `MAX_FAILED_LOGIN_ATTEMPTS` kali, akun dikunci lewat `lockedUntil`.
   * Login berhasil mereset keduanya.
   */
  async login(dto: LoginDto): Promise<AuthSession> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.users.findUnique({ where: { email } });

    // Password tetap diverifikasi terhadap hash (dummy kalau email tidak
    // terdaftar) supaya waktu respons tidak membocorkan email mana yang ada.
    const passwordOk = await this.passwordService.verify(
      user?.passwordHash ?? (await dummyHash()),
      dto.password,
    );

    if (!user || !passwordOk) {
      if (user) await this.registerFailedAttempt(user);
      // Dicatat SEBELUM dilempar: percobaan login gagal adalah aktivitas yang
      // justru paling perlu terlihat, dan tidak ada kode di bawah yang akan
      // berjalan setelah `throw`.
      await this.auditAuth(AUDIT_ACTIONS.AUTH_LOGIN, user?.id, {
        outcome: 'failure',
        reason: 'INVALID_CREDENTIALS',
      });
      throw AppError.unauthorized(
        INVALID_CREDENTIALS_MESSAGE,
        'INVALID_CREDENTIALS',
      );
    }

    if (!user.isActive) {
      await this.auditAuth(AUDIT_ACTIONS.AUTH_LOGIN, user.id, {
        outcome: 'failure',
        reason: 'ACCOUNT_DISABLED',
      });
      throw AppError.forbidden(
        'Akun ini dinonaktifkan. Hubungi administrator.',
        'ACCOUNT_DISABLED',
      );
    }

    // Lock dicek setelah password benar supaya akun terkunci tidak bisa dipakai
    // untuk membedakannya dari akun yang tidak ada.
    if (user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now()) {
      await this.auditAuth(AUDIT_ACTIONS.AUTH_LOGIN, user.id, {
        outcome: 'failure',
        reason: 'ACCOUNT_LOCKED',
      });
      throw AppError.forbidden(
        'Akun terkunci sementara karena terlalu banyak percobaan login gagal.',
        'ACCOUNT_LOCKED',
      );
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    await this.auditAuth(AUDIT_ACTIONS.AUTH_LOGIN, user.id, { outcome: 'success' });

    return this.startSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }

  /**
   * Tukar refresh token dengan access + refresh token baru.
   *
   * Refresh HARUS memeriksa ulang status akun, tidak bisa hanya memercayai
   * token. Tanpa pemeriksaan ini, endpoint admin yang akan datang di Task 6
   * (`PATCH /admin/users/:userId/status`) tidak akan berarti apa-apa untuk
   * sesi yang sudah ada: akun yang dinonaktifkan masih bisa menukar refresh
   * tokennya berulang kali dan mencetak access token baru tanpa henti,
   * selama token-nya belum kedaluwarsa (7 hari).
   *
   * `JwtStrategy.validate` sengaja tidak cek database - itu wajar, access token
   * berumur 15 menit sehingga batasnya sudah mengikat. Yang tidak punya batas
   * adalah refresh, jadi di sinilah pemeriksaan tempatnya. Query user sudah
   * dilakukan di sini untuk membaca email/name/role, jadi menambah dua kolom
   * tidak menambah query.
   */
  async refresh(presented: string): Promise<AuthSession> {
    const rotated = await this.refreshTokenService.rotate(presented);

    const user = await this.prisma.users.findUnique({
      where: { id: rotated.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lockedUntil: true,
      },
    });

    // Baris token masih ada tapi pemiliknya sudah tidak bisa masuk lagi. Cabut
    // semua token miliknya supaya tidak tertinggal akses yang masih dianggap
    // sah - termasuk token BARU yang baru saja dibuat rotasi di atas.
    if (!user || !user.isActive) {
      await this.refreshTokenService.revokeAllForUser(rotated.userId);
      await this.auditAuth(AUDIT_ACTIONS.AUTH_REFRESH, rotated.userId);
      throw AppError.unauthorized(
        'Sesi tidak valid. Silakan masuk kembali.',
        'SESSION_INVALID',
      );
    }

    // Akun terkunci karena gagal login berulang: sesi yang sudah ada ikut
    // ditutup. Kalau dibiarkan, lockout hanya menahan login baru sementara
    // penyerang yang sudah memegang refresh token tetap bisa masuk.
    if (user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now()) {
      await this.refreshTokenService.revokeAllForUser(rotated.userId);
      await this.auditAuth(AUDIT_ACTIONS.AUTH_REFRESH, rotated.userId);
      throw AppError.forbidden(
        'Akun terkunci sementara karena terlalu banyak percobaan login gagal.',
        'ACCOUNT_LOCKED',
      );
    }

    await this.auditAuth(AUDIT_ACTIONS.AUTH_REFRESH, user.id);

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      accessToken: this.tokenService.signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  /**
 * Cabut refresh token milik user. Idempoten.
 *
 * `actorId` untuk audit dibaca dari baris token SEBELUM dicabut, karena
 * setelah `revokeToken` barisnya masih ada tapi tidak ada lagi yang menunjuk
 * sesi itu. `revokeToken` sengaja tidak diubah untuk mengembalikan baris itu:
 * itu mengubah kontrak pemanggilnya, sementara satu pembacaan di sini tidak.
 *
 * Yang dicatat adalah `userId`, bukan token. presented di sini adalah
 * kredensial setara-bearer; masuk ke `audit_logs` akan memindahkannya dari
 * "hanya ada di cookie dan di memori" jadi "tersimpan 7 hari".
 *
 * Logout dengan token yang tidak dikenal tetap tercatat, dengan `actorId` null.
 * Itu masih aktivitas: ada yang mencoba mencabut sesi yang tidak ada.
 */
  async logout(presented: string): Promise<void> {
    const owner = await this.prisma.refreshTokens.findUnique({
      where: { tokenHash: hashRefreshToken(presented) },
      select: { userId: true },
    });

    await this.refreshTokenService.revokeToken(presented);

    await this.auditAuth(AUDIT_ACTIONS.AUTH_LOGOUT, owner?.userId);
  }

  /** Profil user beserta toko yang boleh diakses. Lihat `loadProfile`. */
  async me(userId: string): Promise<AuthProfile> {
    return this.loadProfile(userId);
  }

  /**
   * Profil user + daftar toko yang boleh diakses.
   *
   * ## R-2: kenapa `tenantModel` dipakai di sini
   *
   * Satu-satunya query di task ini yang menyentuh kolom `storeId` adalah
   * pembacaan keanggotaan di `store_members`. `prisma.tenantModel()` adalah
   * jalan resmi untuk model tenant, jadi setiap pembacaan keanggotaan di sini
   * lewat
   * `tenantModel('storeMembers', storeId)` dan bukan `prisma.storeMembers`
   * mentah.
   *
   * Bentuknya membership-per-toko: untuk setiap `storeId` milik user, baris
   * keanggotaan dibaca ulang di delegate yang terkunci ke `storeId` itu,
   * memakai compound key `{ storeId, userId }`. Delegate itu menolak pemanggilan
   * yang `where.storeId`-nya tidak disebut atau tidak sama dengan scope
   * (lihat `tenant-scope.extension.ts`), sehingga membership milik toko lain
   * tidak bisa ikut terbawa. `stores` tidak punya kolom `storeId`, jadi
   * tetap dibaca lewat `prisma.stores` biasa sesuai aturan di sana.
   *
   * Query penemuan kandidat `storeId` memang lewat `prisma.storeMembers` mentah
   * dengan `select: { storeId: true }`: pada titik itu belum ada `storeId`
   * yang diketahui, jadi belum ada tenant aktif untuk di-scope, dan tidak ada
   * delegate yang bisa dibuat. Yang belum dipercaya adalah daftar kandidat itu
   * - masing-masing kandidat diverifikasi ulang lewat delegate ter-scope
   * sebelum boleh masuk response.
   */
  async loadProfile(userId: string): Promise<AuthProfile> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      throw AppError.notFound('Pengguna tidak ditemukan.', 'USER_NOT_FOUND');
    }

    const candidates = await this.prisma.storeMembers.findMany({
      where: { userId },
      select: { storeId: true },
      orderBy: { joinedAt: 'asc' },
    });

    const stores: UserStoreAccess[] = [];
    for (const { storeId } of candidates) {
      // R-2: keanggotaan diverifikasi lewat delegate yang ter-scope ke storeId
      // ini, bukan lewat query mentah. Delegate menolak kalau `where.storeId`
      // tidak disebut atau berbeda dari scope.
      const membership = await this.prisma
        .tenantModel('storeMembers', storeId)
        .findUnique({ where: { storeId_userId: { storeId, userId } } });

      if (!membership) continue;

      const store = await this.prisma.stores.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, status: true },
      });

      if (!store) continue;

      stores.push({
        id: store.id,
        name: store.name,
        role: membership.role,
        status: store.status,
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      stores,
    };
  }

  /** Terbitkan access + refresh token untuk user yang sudah terautentikasi. */
  private async startSession(user: PublicUser): Promise<AuthSession> {
    const refresh = await this.refreshTokenService.issue(user.id);
    return {
      user,
      accessToken: this.tokenService.signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  /**
   * Naikkan penghitung kegagalan login, lalu kunci akun kalau sudah melewati
   * batas.
   *
   * `failedLoginCount` di-reset ke 0 saat akun dikunci, bukan dibiarkan di 10.
   * Kalau dibiarkan, begitu `lockedUntil` berakhir satu kegagalan lagi sudah
   * langsung mengunci ulang, jadi user tidak pernah bisa masuk.
   */
  private async registerFailedAttempt(user: {
    id: string;
    failedLoginCount: number;
  }): Promise<void> {
    const attempts = user.failedLoginCount + 1;

    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS),
        },
      });
      return;
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { failedLoginCount: attempts },
    });
  }
}

/** Email dinormalisasi lewat util bersama; lihat `email.util.ts`. */

/**
 * Hash argon2id dari password acak, hanya supaya `verify` tetap berjalan dengan
 * biaya yang sama ketika email tidak terdaftar.
 *
 * Dibuat sekali lalu di-cache: argon2 sengaja lambat, jadi menghitungnya per
 * request akan menjadi vektor DoS lewat endpoint login. Promise-nya disimpan
 * supaya dua request bersamaan tidak menghitung dua kali.
 */
let dummyHashPromise: Promise<string> | undefined;

function dummyHash(): Promise<string> {
  dummyHashPromise ??= hash('bisnis-insight-dummy-password', {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return dummyHashPromise;
}