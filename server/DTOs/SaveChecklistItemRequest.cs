using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

/// <summary>Adım ekleme ve güncellemede ortak gövde.</summary>
public class SaveChecklistItemRequest
{
    [Required(ErrorMessage = "Adım başlığı boş olamaz.")]
    [StringLength(300, MinimumLength = 1,
        ErrorMessage = "Adım başlığı en fazla 300 karakter olabilir.")]
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Yalnızca güncellemede kullanılıyor. Ekleme sırasında gönderilse bile
    /// yeni adım her zaman "yapılmadı" olarak başlıyor.
    /// </summary>
    public bool IsDone { get; set; }
}
