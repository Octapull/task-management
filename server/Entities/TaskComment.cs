namespace TaskManagementSystem.Entities;

/// <summary>
/// Bir iş üzerine yazılan yorum.
///
/// <see cref="ActivityEntry"/> ile karıştırılmamalı: geçmiş kaydı sistemin
/// otomatik tuttuğu denetim izi, yorum ise kullanıcının bilerek yazdığı metin.
/// İş silindiğinde geçmiş kaydı kalır, yorumlar silinir.
/// </summary>
public class TaskComment
{
    public int Id { get; set; }
    public int TaskId { get; set; }
    public int? TeamId { get; set; }
    public int? AuthorUserId { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    /// <summary>Düzenlenmemiş yorumlarda null.</summary>
    public DateTime? EditedAt { get; set; }
}
