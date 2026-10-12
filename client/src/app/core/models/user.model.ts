/** GET /api/users cevabı. */
export interface UserSummary {
  id: number;
  fullName: string;
  role: string;
}

/**
 * GET /api/users/me cevabı.
 *
 * UserSummary'den farkı e-posta ve kayıt tarihini de taşıması; bunlar
 * yalnızca kişinin kendi profil ekranında gösteriliyor.
 */
export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  role: string;
  /** Kendisine iş atandığında e-posta gitsin mi? */
  notifyOnAssignment: boolean;
  /** Teslim tarihi yaklaşan/geçen işler için hatırlatma gitsin mi? */
  notifyOnDueDate: boolean;
  createdAt: string;
}

/** PUT /api/users/me gövdesi. */
export interface UpdateProfileRequest {
  fullName: string;
  email: string;
  notifyOnAssignment: boolean;
  notifyOnDueDate: boolean;
}

/** PUT /api/users/me/password gövdesi. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** GET /api/teams/me - ekip yönetimi ekranının verisi. */
export interface TeamDetail {
  id: number;
  name: string;
  /** Ekibe katılmak için paylaşılan kod. */
  teamCode: string;
  createdAt: string;
  members: TeamMember[];
  /** İsteği yapan kişi ekibin sahibi mi? Yönetim butonları buna bakıyor. */
  isOwner: boolean;
}

export interface TeamMember {
  id: number;
  fullName: string;
  email: string;
  /** "Owner" ya da "Member". */
  role: string;
  isEmailConfirmed: boolean;
  createdAt: string;
}
