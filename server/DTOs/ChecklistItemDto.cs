namespace TaskManagementSystem.DTOs;

/// <summary>Bir işin kontrol listesindeki tek adım.</summary>
public class ChecklistItemDto
{
    public int Id { get; set; }
    public int TaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsDone { get; set; }

    /// <summary>Listedeki sırası; kullanıcı sürükleyerek değiştirebiliyor.</summary>
    public int Position { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
