namespace TaskManagementSystem.Entities;

/// <summary>
/// Doğrulama kodunun ne için üretildiği.
///
/// İki akış aynı tabloyu paylaşıyor; bu ayrım olmadan bir akış için gönderilen
/// kod diğerinde kabul edilirdi. Sayılar veritabanına yazıldığı için
/// değiştirilemez.
/// </summary>
public enum VerificationPurpose
{
    /// <summary>Kayıt sonrası hesabın e-postasını doğrulama.</summary>
    EmailConfirmation = 0,

    /// <summary>Şifresini unutan kullanıcının kimliğini kanıtlaması.</summary>
    PasswordReset = 1
}
