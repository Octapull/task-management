/** Etiket tanımları (GET /api/labels). */

/**
 * İzin verilen renk adları - backend'deki `LabelColors` ile birebir aynı
 * olmak zorunda.
 *
 * Serbest renk kodu bilerek yok: kullanıcı koyu temada okunmayan bir renk
 * seçebilirdi. Bu adlar SCSS'te tema değişkenlerine çözülüyor.
 */
export const LABEL_COLORS = [
  'gray',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'teal',
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export const DEFAULT_LABEL_COLOR: LabelColor = 'gray';

export interface Label {
  id: number;
  name: string;
  color: LabelColor;
  /** Kaç işte kullanıldığı; silmeden önce uyarmak için. */
  usageCount: number;
}

/** POST/PUT /api/labels gövdesi. */
export interface SaveLabelRequest {
  name: string;
  color: LabelColor;
}

/** Gelen değer izin verilen renklerden biri değilse varsayılana düşer. */
export function toLabelColor(value: unknown): LabelColor {
  return LABEL_COLORS.includes(value as LabelColor) ? (value as LabelColor) : DEFAULT_LABEL_COLOR;
}
