import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, switchMap, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Label, SaveLabelRequest, toLabelColor } from '../models/label.model';
import { isRecord, readNumber, readString } from '../util/json';

/**
 * Ekibin etiket tanımları.
 *
 * `UserDirectoryService` ile aynı kalıp: liste bir kez çekiliyor, kartlar ve
 * detay sayfası id üzerinden buradan okuyor. İşlerin üzerinde yalnızca etiket
 * id'leri taşınıyor, ad ve renk her işte tekrar tekrar gönderilmiyor.
 */
@Injectable({ providedIn: 'root' })
export class LabelStore {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/labels`;

  private readonly items = signal<Label[]>([]);
  private loaded = false;

  readonly labels = this.items.asReadonly();

  private readonly byId = computed(() => {
    const map = new Map<number, Label>();
    for (const label of this.items()) map.set(label.id, label);
    return map;
  });

  /** Pano kabuğu açılırken bir kez çağrılıyor. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.fetch().subscribe({
      // Etiketler çekilemezse arayüz çalışmaya devam etmeli; sonraki
      // denemeye izin vermek için bayrağı geri alıyoruz.
      error: () => {
        this.loaded = false;
      },
    });
  }

  reset(): void {
    this.items.set([]);
    this.loaded = false;
  }

  /** Verilen id'lerin etiket karşılıkları; tanınmayan id'ler atlanıyor. */
  resolve(ids: readonly number[]): Label[] {
    const map = this.byId();

    return ids.map((id) => map.get(id)).filter((label): label is Label => label !== undefined);
  }

  // Üçü de yazma isteğinden sonra listeyi tazeliyor: kullanım sayısı ve
  // sıralama sunucuda hesaplanıyor, elde güncellemek ikisini de bozardı.

  create(request: SaveLabelRequest): Observable<Label[]> {
    return this.http.post<unknown>(this.baseUrl, request).pipe(switchMap(() => this.fetch()));
  }

  update(id: number, request: SaveLabelRequest): Observable<Label[]> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, request)
      .pipe(switchMap(() => this.fetch()));
  }

  remove(id: number): Observable<Label[]> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(switchMap(() => this.fetch()));
  }

  /** Listeyi sunucudan tazeler ve saklar. */
  private fetch(): Observable<Label[]> {
    return this.http.get<unknown>(this.baseUrl).pipe(
      map((response) => parseLabels(response)),
      tap((labels) => this.items.set(labels)),
    );
  }
}

function parseLabel(raw: unknown): Label | null {
  const id = readNumber(raw, 'id');
  if (id === null) return null;

  return {
    id,
    name: readString(raw, 'name') ?? '',
    color: toLabelColor(isRecord(raw) ? raw['color'] : null),
    usageCount: readNumber(raw, 'usageCount') ?? 0,
  };
}

function parseLabels(raw: unknown): Label[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(parseLabel).filter((label): label is Label => label !== null);
}
