namespace TaskManagementSystem.Entities;

/// <summary>
/// İşlem geçmişine yazılan tek bir kayıt.
///
/// İşin başlığı burada kopya olarak duruyor: iş silindikten sonra da
/// "Ahmet 'API dokümantasyonu' işini sildi" diyebilmek için.
/// </summary>
public class ActivityEntry
{
    public int Id { get; set; }

    /// <summary>İlgili işin Id'si. İş silinmiş olabilir, foreign key yok.</summary>
    public int? TaskId { get; set; }

    /// <summary>İşlem anındaki iş başlığı.</summary>
    public string TaskTitle { get; set; } = string.Empty;

    public ActivityAction Action { get; set; }

    /// <summary>İşlemi yapan kullanıcı.</summary>
    public int? ActorUserId { get; set; }

    /// <summary>Yalnızca devir işleminde dolu: işin atandığı kişi.</summary>
    public int? TargetUserId { get; set; }

    /// <summary>
    /// Kaydın ait olduğu ekip. Geçmiş ekranı yalnızca kendi ekibinin
    /// hareketlerini gösteriyor.
    /// </summary>
    public int? TeamId { get; set; }

    /// <summary>Serbest metin ayrıntı, ör. "Öncelik: Orta -> Yüksek".</summary>
    public string? Details { get; set; }

    public DateTime CreatedAt { get; set; }
}
