using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// Kontrol listesinin yeni sırası.
///
/// Tek tek "yukarı/aşağı" yerine tam sıra gönderiliyor: sürükle-bırakta
/// birden fazla adımın konumu aynı anda değişiyor ve arayüzdeki sırayı
/// olduğu gibi kaydetmek en az sürprizli yol.
/// </summary>
public class ReorderChecklistRequest
{
    [Required(ErrorMessage = "Sıra bilgisi gerekli.")]
    [MinLength(1, ErrorMessage = "Sıra listesi boş olamaz.")]
    public int[] ItemIds { get; set; } = [];
}
