import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ActivityEntry, ActivityPage } from '../models/activity.model';
import { parseActivityList, parseActivityPage } from '../util/activity-mapper';

/**
 * /api/activity uç noktası.
 *
 * Geçmiş yalnızca okunur; yazma işlemleri iş uç noktalarının yan etkisi
 * olarak backend'de gerçekleşiyor.
 */
@Injectable({ providedIn: 'root' })
export class ActivityApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/activity`;

  /**
   * Geçmişin bir sayfası.
   *
   * @param skip Kaç kaydın atlanacağı - dizinin uzunluğu değil, sunucudan
   * o ana kadar çekilmiş satır sayısı verilmeli. SignalR ile başa eklenen
   * kayıtlar sayılırsa sayfa sınırı kayar.
   */
  getPage(skip = 0, take = 50): Observable<ActivityPage> {
    const params = new HttpParams().set('skip', skip).set('take', take);

    return this.http
      .get<unknown>(this.baseUrl, { params })
      .pipe(map((response) => parseActivityPage(response)));
  }

  /** Tek bir işin geçmişi. */
  getForTask(taskId: number): Observable<ActivityEntry[]> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/tasks/${taskId}/activity`)
      .pipe(map((response) => parseActivityList(response)));
  }
}
