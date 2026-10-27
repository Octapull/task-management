namespace TaskManagementSystem.DTOs;

/// <summary>
/// Yorumun arayüze dönen hali. Yazarın adı join ile geliyor ki istemci her
/// yorum için ayrı kullanıcı sorgusu yapmasın.
/// </summary>
public class TaskCommentDto
{
    public int Id { get; set; }
    public int TaskId { get; set; }
    public int? AuthorUserId { get; set; }

    /// <summary>Yazarın adı; kullanıcı silinmişse null.</summary>
    public string? AuthorName { get; set; }

    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? EditedAt { get; set; }
}
