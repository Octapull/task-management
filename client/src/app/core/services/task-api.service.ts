import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ChecklistItem,
  TaskAttachment,
  TaskComment,
  TaskContentRequest,
  TaskItem,
  TaskItemStatus,
} from '../models/task.model';
import {
  parseAttachment,
  parseAttachmentList,
  parseChecklist,
  parseComment,
  parseCommentList,
  parseTask,
  parseTaskList,
} from '../util/task-mapper';

/**
 * /api/tasks uç noktalarının birebir karşılığı.
 *
 * Bu sınıf durum (state) tutmaz, sadece HTTP çağırır ve gelen JSON'u
 * tiplenmiş modele çevirir. Uygulama durumu TaskStore'da yönetiliyor.
 */
@Injectable({ providedIn: 'root' })
export class TaskApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tasks`;

  getAll(): Observable<TaskItem[]> {
    return this.http.get<unknown>(this.baseUrl).pipe(map((response) => parseTaskList(response)));
  }

  getById(id: number): Observable<TaskItem | null> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => parseTask(response)));
  }

  create(request: TaskContentRequest): Observable<TaskItem | null> {
    return this.http
      .post<unknown>(this.baseUrl, request)
      .pipe(map((response) => parseTask(response)));
  }

  /** Başlık, açıklama, öncelik ve teslim tarihini günceller. */
  update(id: number, request: TaskContentRequest): Observable<TaskItem | null> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, request)
      .pipe(map((response) => parseTask(response)));
  }

  /**
   * Boştaki bir işi üstlenir (durum: Boşta -> Alınmış).
   *
   * Backend yalnızca durumu "Boşta" olan işlerde bu isteği kabul ediyor;
   * aksi halde 409 dönüyor (aynı işi iki kişinin aynı anda alma yarışı).
   */
  claim(id: number, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);

    return this.http.put<void>(`${this.baseUrl}/${id}/assign`, null, {
      params,
    });
  }

  /**
   * İşi birine atar / devreder. `claim`'den farkı işin durumuna bakmaması -
   * devam eden bir iş başkasına devredilebiliyor.
   */
  setAssignee(id: number, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);

    return this.http.put<void>(`${this.baseUrl}/${id}/assignee`, null, {
      params,
    });
  }

  /** Atamayı kaldırır; iş "Boşta" durumuna döner. */
  removeAssignee(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/assignee`);
  }

  updateStatus(id: number, status: TaskItemStatus): Observable<void> {
    const params = new HttpParams().set('status', status);

    return this.http.put<void>(`${this.baseUrl}/${id}/status`, null, {
      params,
    });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // --- Yorumlar ------------------------------------------------------------

  getComments(taskId: number): Observable<TaskComment[]> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${taskId}/comments`)
      .pipe(map((response) => parseCommentList(response)));
  }

  addComment(taskId: number, body: string): Observable<TaskComment | null> {
    return this.http
      .post<unknown>(`${this.baseUrl}/${taskId}/comments`, { body })
      .pipe(map((response) => parseComment(response)));
  }

  editComment(taskId: number, commentId: number, body: string): Observable<TaskComment | null> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${taskId}/comments/${commentId}`, { body })
      .pipe(map((response) => parseComment(response)));
  }

  deleteComment(taskId: number, commentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${taskId}/comments/${commentId}`);
  }

  /** İşin etiketlerini verilen listeyle değiştirir. */
  setLabels(taskId: number, labelIds: number[]): Observable<TaskItem | null> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${taskId}/labels`, { labelIds })
      .pipe(map((response) => parseTask(response)));
  }

  // --- Dosya ekleri --------------------------------------------------------

  getAttachments(taskId: number): Observable<TaskAttachment[]> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${taskId}/attachments`)
      .pipe(map((response) => parseAttachmentList(response)));
  }

  uploadAttachment(taskId: number, file: File): Observable<TaskAttachment | null> {
    // multipart/form-data: Content-Type başlığını elle KOYMUYORUZ, çünkü
    // tarayıcının eklediği "boundary" olmadan sunucu gövdeyi ayrıştıramaz.
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http
      .post<unknown>(`${this.baseUrl}/${taskId}/attachments`, form)
      .pipe(map((response) => parseAttachment(response)));
  }

  /**
   * Dosyayı indirir.
   *
   * Düz bir bağlantı işe yaramaz: uç nokta token istiyor ve `<a href>` ile
   * Authorization başlığı gönderilemiyor. Bu yüzden içerik blob olarak
   * çekilip tarayıcıya öyle veriliyor.
   */
  downloadAttachment(taskId: number, attachmentId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${taskId}/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
  }

  deleteAttachment(taskId: number, attachmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${taskId}/attachments/${attachmentId}`);
  }

  // --- Kontrol listesi -----------------------------------------------------

  getChecklist(taskId: number): Observable<ChecklistItem[]> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${taskId}/checklist`)
      .pipe(map((response) => parseChecklist(response)));
  }

  addChecklistItem(taskId: number, title: string): Observable<ChecklistItem[]> {
    return this.http
      .post<unknown>(`${this.baseUrl}/${taskId}/checklist`, { title, isDone: false })
      .pipe(switchMap(() => this.getChecklist(taskId)));
  }

  /** Başlık ve tamamlanma durumu birlikte gönderiliyor (backend ikisini de yazıyor). */
  updateChecklistItem(
    taskId: number,
    itemId: number,
    title: string,
    isDone: boolean,
  ): Observable<ChecklistItem[]> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${taskId}/checklist/${itemId}`, { title, isDone })
      .pipe(switchMap(() => this.getChecklist(taskId)));
  }

  /** Arayüzdeki sırayı olduğu gibi kaydeder. */
  reorderChecklist(taskId: number, itemIds: number[]): Observable<ChecklistItem[]> {
    return this.http
      .put<unknown>(`${this.baseUrl}/${taskId}/checklist/order`, { itemIds })
      .pipe(map((response) => parseChecklist(response)));
  }

  deleteChecklistItem(taskId: number, itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${taskId}/checklist/${itemId}`);
  }
}
