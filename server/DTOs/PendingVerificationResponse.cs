namespace TaskManagementSystem.DTOs;

/// <summary>
/// "Kod gönderildi, doğrulamanı bekliyoruz" yanıtı.
///
/// Kayıt sonrası 200 ile, doğrulanmamış hesapla giriş denendiğinde ise 403
/// ile aynı gövde dönüyor: istemci her iki durumda da aynı ekrana geçiyor.
/// </summary>
public class PendingVerificationResponse
{
    /// <summary>İstemcinin durumu ayırt etmesi için sabit işaret.</summary>
    public string Status { get; init; } = "PendingVerification";

    public string Email { get; set; } = string.Empty;

    /// <summary>Kodun geçerlilik bitişi - ekrandaki geri sayımı besliyor.</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// "Yeniden gönder" butonunun aktifleşeceği an. Hız sınırı sunucuda
    /// uygulanıyor, bu alan yalnızca butonu ne zaman açacağını söylüyor.
    /// </summary>
    public DateTime ResendAvailableAt { get; set; }

    /// <summary>
    /// Posta gerçekten gönderilebildi mi?
    ///
    /// Kod her durumda veritabanına yazılıyor, yani false olması akışın
    /// bozulduğu anlamına gelmiyor - ama kullanıcı gelmeyecek bir postayı
    /// beklemesin diye arayüz bunu söylemek zorunda. Hız sınırına takılan
    /// istekte true: yeni posta gönderilmedi ama kullanıcının elinde hâlâ
    /// geçerli bir kod var.
    /// </summary>
    public bool EmailSent { get; set; } = true;

    /// <summary>Kullanıcıya "X ekibine katılıyorsun" diyebilmek için.</summary>
    public string? TeamName { get; set; }

    /// <summary>
    /// Yalnızca Development ortamında ve mock e-posta servisi kullanılırken
    /// dolu: gerçek posta kutusu olmadan akışı denemek için. Production'da
    /// her zaman null.
    /// </summary>
    public string? DevCode { get; set; }
}
