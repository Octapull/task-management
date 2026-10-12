using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

public class LoginRequest
{
    [Required(ErrorMessage = "E-posta gerekli.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi gir.")]
    public string Email { get; set; } = string.Empty;

    // Giriş tarafında uzunluk kuralı yok: kural değişse bile eski şifresiyle
    // giren kullanıcı kilitlenmesin.
    [Required(ErrorMessage = "Şifre gerekli.")]
    public string Password { get; set; } = string.Empty;
}
