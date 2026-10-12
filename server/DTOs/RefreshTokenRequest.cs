using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// POST /api/auth/refresh ve /api/auth/logout gövdesi.
///
/// Token gövdede taşınıyor, Authorization başlığında değil: başlıktaki
/// erişim token'ının süresi zaten dolmuş oluyor ve yenileme token'ı ondan
/// bağımsız bir kimlik bilgisi.
/// </summary>
public class RefreshTokenRequest
{
    [Required(ErrorMessage = "Yenileme token'ı gerekli.")]
    public string RefreshToken { get; set; } = string.Empty;
}
