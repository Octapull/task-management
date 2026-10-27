using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// Şifre değiştirme gövdesi (PUT /api/users/me/password).
///
/// Mevcut şifre de isteniyor: token'ı çalınmış bir oturumun şifreyi değiştirip
/// hesabı ele geçirmesini zorlaştırıyor.
/// </summary>
public class ChangePasswordRequest
{
    [Required(ErrorMessage = "Mevcut şifre gerekli.")]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Yeni şifre gerekli.")]
    [StringLength(100, MinimumLength = 6,
        ErrorMessage = "Yeni şifre en az 6 karakter olmalı.")]
    public string NewPassword { get; set; } = string.Empty;
}
