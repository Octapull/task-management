using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// Profil güncelleme gövdesi (PUT /api/users/me).
///
/// Rol bilerek yok: kullanıcı kendi rolünü değiştiremez.
/// </summary>
public class UpdateProfileRequest
{
    [Required(ErrorMessage = "Ad soyad gerekli.")]
    [StringLength(150, MinimumLength = 2,
        ErrorMessage = "Ad soyad 2-150 karakter arasında olmalı.")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "E-posta gerekli.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi gir.")]
    [StringLength(150, ErrorMessage = "E-posta en fazla 150 karakter olabilir.")]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Atama bildirimi tercihi. Zorunlu değil ama gönderilmezse false
    /// sayılacağı için istemci her zaman mevcut değeri yolluyor.
    /// </summary>
    public bool NotifyOnAssignment { get; set; }

    /// <summary>Teslim tarihi hatırlatması tercihi.</summary>
    public bool NotifyOnDueDate { get; set; }
}
