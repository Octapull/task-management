namespace TaskManagementSystem.DTOs;

/// <summary>
/// Ekin arayüze dönen hali.
///
/// Diskteki ad (stored_name) bilerek dışarı verilmiyor: istemcinin ona
/// ihtiyacı yok ve dosya düzeni hakkında bilgi sızdırmanın anlamı yok.
/// İndirme her zaman id üzerinden yapılıyor.
/// </summary>
public class AttachmentDto
{
    public int Id { get; set; }
    public int TaskId { get; set; }

    /// <summary>Kullanıcının yüklediği özgün dosya adı.</summary>
    public string FileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }

    public int? UploadedByUserId { get; set; }
    public string? UploadedByName { get; set; }

    public DateTime CreatedAt { get; set; }
}
