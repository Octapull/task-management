import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { TeamCodeCheck } from '../models/auth.model';
import { TeamDetail } from '../models/user.model';

/** Ekip uçları. Kod doğrulama kayıt sırasında, token olmadan çağrılıyor. */
@Injectable({ providedIn: 'root' })
export class TeamApiService {
  private readonly http = inject(HttpClient);
  private readonly teamUrl = `${environment.apiUrl}/teams/me`;

  /**
   * Ekip kodunun geçerliliğini sorar.
   *
   * Hata durumunda fırlatmıyor, "geçersiz" dönüyor: bu çağrı kullanıcı
   * yazarken tetikleniyor ve geçici bir ağ hatasının forma kırmızı bir
   * hata olarak yansıması yanıltıcı olurdu.
   */
  validateCode(code: string): Observable<TeamCodeCheck> {
    return this.http
      .get<TeamCodeCheck>(`${environment.apiUrl}/teams/validate-code/${encodeURIComponent(code)}`)
      .pipe(catchError(() => of({ valid: false } satisfies TeamCodeCheck)));
  }

  /** Ekip bilgisi ve üye listesi. */
  getMyTeam(): Observable<TeamDetail> {
    return this.http.get<TeamDetail>(`${this.teamUrl}`);
  }

  rename(name: string): Observable<TeamDetail> {
    return this.http.put<TeamDetail>(`${this.teamUrl}`, { name });
  }

  /** Davet kodunu yeniler; eski kod anında geçersiz olur. */
  regenerateCode(): Observable<TeamDetail> {
    return this.http.post<TeamDetail>(`${this.teamUrl}/code`, null);
  }

  /** Sahipliği devreder; devreden kişi Member olur. */
  transferOwnership(userId: number): Observable<TeamDetail> {
    return this.http.put<TeamDetail>(`${this.teamUrl}/owner/${userId}`, null);
  }

  /** Üyeyi ekipten çıkarır; üzerindeki işler havuza döner. */
  removeMember(userId: number): Observable<TeamDetail> {
    return this.http.delete<TeamDetail>(`${this.teamUrl}/members/${userId}`);
  }
}
