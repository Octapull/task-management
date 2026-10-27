using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

/// <summary>Yorum ekleme ve düzenlemede ortak gövde.</summary>
public class SaveCommentRequest
{
    [Required(ErrorMessage = "Yorum boş olamaz.")]
    [StringLength(2000, MinimumLength = 1,
        ErrorMessage = "Yorum en fazla 2000 karakter olabilir.")]
    public string Body { get; set; } = string.Empty;
}
