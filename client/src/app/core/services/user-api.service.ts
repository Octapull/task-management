import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ChangePasswordRequest,
  UpdateProfileRequest,
  UserProfile,
  UserSummary,
} from '../models/user.model';
import { isRecord, readNumber, readProp, readString } from '../util/json';

/** /api/users uç noktası. */
@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  getAll(): Observable<UserSummary[]> {
    return this.http.get<unknown>(this.baseUrl).pipe(map((response) => parseUsers(response)));
  }

  /** Giriş yapmış kullanıcının kendi profili. */
  getMe(): Observable<UserProfile | null> {
    return this.http
      .get<unknown>(`${this.baseUrl}/me`)
      .pipe(map((response) => parseProfile(response)));
  }

  updateMe(request: UpdateProfileRequest): Observable<UserProfile | null> {
    return this.http
      .put<unknown>(`${this.baseUrl}/me`, request)
      .pipe(map((response) => parseProfile(response)));
  }

  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/me/password`, request);
  }
}

function parseProfile(raw: unknown): UserProfile | null {
  const id = readNumber(raw, 'id');
  if (id === null) return null;

  return {
    id,
    fullName: readString(raw, 'fullName') ?? '',
    email: readString(raw, 'email') ?? '',
    role: readString(raw, 'role') ?? '',
    // Alan gelmezse açık sayıyoruz: sunucudaki varsayılan da bu, kapalı
    // varsaymak kullanıcıyı sessizce bildirimsiz bırakırdı.
    notifyOnAssignment: readProp(raw, 'notifyOnAssignment') !== false,
    notifyOnDueDate: readProp(raw, 'notifyOnDueDate') !== false,
    createdAt: readString(raw, 'createdAt') ?? '',
  };
}

function parseUsers(raw: unknown): UserSummary[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): UserSummary | null => {
      const id = readNumber(item, 'id');
      if (id === null || !isRecord(item)) return null;

      return {
        id,
        fullName: readString(item, 'fullName') ?? `Kullanıcı #${id}`,
        role: readString(item, 'role') ?? '',
      };
    })
    .filter((user): user is UserSummary => user !== null);
}
