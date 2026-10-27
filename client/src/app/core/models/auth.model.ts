/** POST /api/auth/* sözleşmeleri. */

/** Kayıt sırasında seçilen ekip yolu - backend'deki TeamJoinMode ile aynı sıra. */
export const TeamMode = {
  Create: 0,
  Join: 1,
} as const;

export type TeamMode = (typeof TeamMode)[keyof typeof TeamMode];

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  mode: TeamMode;
  /** Yalnızca mode === Create iken dolu. */
  teamName?: string;
  /** Yalnızca mode === Join iken dolu. */
  teamCode?: string;
}

export interface VerifyCodeRequest {
  email: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

/** Backend'in AuthResponse DTO'su. */
export interface AuthResponse {
  token: string;
  /**
   * Uzun ömürlü yenileme token'ı. Erişim token'ının süresi dolunca bununla
   * sessizce yenisi alınıyor. Her yenilemede değişiyor (döndürme), bu yüzden
   * dönen yeni değer saklanmak zorunda.
   */
  refreshToken: string;
  /** ISO 8601 - token'ın geçerlilik bitişi. */
  expiresAt: string;
  userId: number;
  fullName: string;
  role: string;
  teamId: number;
  teamName: string;
  teamCode: string;
}

/**
 * "Kod gönderildi, doğrulamanı bekliyoruz" yanıtı.
 *
 * Kayıt 200 ile, doğrulanmamış hesapla giriş denemesi 403 ile aynı gövdeyi
 * döndürüyor; iki durumda da aynı ekrana geçiyoruz.
 */
export interface PendingVerification {
  status: 'PendingVerification';
  email: string;
  /** ISO 8601 - kodun geçerlilik bitişi, geri sayımı besliyor. */
  expiresAt: string;
  /** ISO 8601 - "yeniden gönder" butonunun açılacağı an. */
  resendAvailableAt: string;
  teamName?: string | null;
  /**
   * Posta gerçekten gönderilebildi mi? Kod her durumda üretiliyor, false
   * yalnızca gönderimin başarısız olduğunu söylüyor - kullanıcı gelmeyecek
   * bir postayı beklemesin diye doğrulama ekranı uyarı gösteriyor.
   */
  emailSent?: boolean;
  /**
   * Yalnızca backend mock e-posta servisiyle çalışırken dolu. Gerçek
   * gönderimde null döner; arayüz bu alanı yalnızca ipucu göstermek için
   * kullanıyor, akışın hiçbir yeri buna bağlı değil.
   */
  devCode?: string | null;
}

/** GET /api/teams/validate-code/{code} */
export interface TeamCodeCheck {
  valid: boolean;
  teamName?: string | null;
  memberCount?: number | null;
}

/** localStorage'da saklanan oturum bilgisi. */
export interface Session {
  token: string;
  /** Erişim token'ı ölünce yenisini almak için kullanılan token. */
  refreshToken: string;
  expiresAt: string;
  userId: number;
  fullName: string;
  role: string;
  teamId: number;
  teamName: string;
  teamCode: string;
}
