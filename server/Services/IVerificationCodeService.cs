using System.Data;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

/// <summary>
/// 6 haneli doğrulama kodunun üretimi, gönderimi ve kontrolü.
/// </summary>
public interface IVerificationCodeService
{
    /// <summary>
    /// Kullanıcı için yeni bir kod üretir, kaydeder ve e-postayı tetikler.
    ///
    /// Yalnızca aynı amaçla üretilmiş önceki kodlar geçersiz kılınır; hesap
    /// doğrulama ve şifre sıfırlama akışları birbirini iptal etmez.
    /// </summary>
    Task<IssueCodeResult> IssueAsync(
        IDbConnection connection,
        User user,
        VerificationPurpose purpose = VerificationPurpose.EmailConfirmation);

    /// <summary>Girilen kodu kontrol eder; doğruysa kodu kullanılmış işaretler.</summary>
    Task<VerifyCodeOutcome> VerifyAsync(
        IDbConnection connection,
        int userId,
        string code,
        VerificationPurpose purpose = VerificationPurpose.EmailConfirmation);

    /// <summary>Kodun geçerlilik süresi (dakika) - istemciye bildiriliyor.</summary>
    int CodeLifetimeMinutes { get; }
}

/// <summary>Kod üretiminin sonucu.</summary>
public class IssueCodeResult
{
    public bool Sent { get; init; }

    /// <summary>Hız sınırına takıldıysa true; yeni kod üretilmedi.</summary>
    public bool Throttled { get; init; }

    public DateTime ExpiresAt { get; init; }

    /// <summary>Yeni "yeniden gönder" isteğinin kabul edileceği an.</summary>
    public DateTime ResendAvailableAt { get; init; }

    /// <summary>
    /// Yalnızca mock e-posta servisi VE Development ortamı bir aradayken
    /// dolu; diğer her durumda null (bkz. VerificationCodeService).
    /// </summary>
    public string? DevCode { get; init; }
}

/// <summary>Kod kontrolünün sonucu.</summary>
public enum VerifyCodeOutcome
{
    Success = 0,

    /// <summary>Kullanıcının bekleyen bir kodu yok.</summary>
    NotFound = 1,

    /// <summary>Kod doğru ama süresi dolmuş.</summary>
    Expired = 2,

    /// <summary>Kod yanlış.</summary>
    Invalid = 3,

    /// <summary>
    /// Çok fazla yanlış deneme yapıldı; kod iptal edildi, yenisi istenmeli.
    /// </summary>
    TooManyAttempts = 4
}
