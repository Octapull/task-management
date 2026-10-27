using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

public class ResetPasswordRequest
{
    [Required(ErrorMessage = "E-posta gerekli.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi gir.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Doğrulama kodu gerekli.")]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Kod 6 haneli olmalı.")]
    public string Code { get; set; } = string.Empty;

    [Required(ErrorMessage = "Yeni şifre gerekli.")]
    [StringLength(100, MinimumLength = 6,
        ErrorMessage = "Şifre en az 6 karakter olmalı.")]
    public string NewPassword { get; set; } = string.Empty;
}
