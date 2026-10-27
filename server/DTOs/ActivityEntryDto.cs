using TaskManagementSystem.Entities;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// İşlem geçmişi ekranının okuduğu kayıt.
///
/// Kullanıcı adları burada hazır geliyor (SQL'de join ile): arayüzün kullanıcı
/// listesini beklemesi gerekmiyor ve sonradan silinmiş bir kullanıcının adı da
/// doğru görünüyor.
/// </summary>
public class ActivityEntryDto
{
    public int Id { get; set; }
    public int? TaskId { get; set; }
    public string TaskTitle { get; set; } = string.Empty;

    /// <summary>Sayısal <see cref="ActivityAction"/> değeri.</summary>
    public ActivityAction Action { get; set; }

    public int? ActorUserId { get; set; }
    public string? ActorName { get; set; }

    public int? TargetUserId { get; set; }
    public string? TargetName { get; set; }

    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; }
}
