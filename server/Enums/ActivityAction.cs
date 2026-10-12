namespace TaskManagementSystem.Entities;

/// <summary>
/// İşlem geçmişinde saklanan hareket tipi.
///
/// Sayısal değerler veritabanına yazıldığı için ASLA değiştirilmemeli;
/// yeni tip her zaman sona eklenir.
/// </summary>
public enum ActivityAction
{
    /// <summary>Yeni iş açıldı.</summary>
    TaskCreated = 0,

    /// <summary>Başlık, açıklama, öncelik ya da teslim tarihi değişti.</summary>
    TaskUpdated = 1,

    /// <summary>İş silindi.</summary>
    TaskDeleted = 2,

    /// <summary>Boştaki işi kullanıcı kendi üstlendi.</summary>
    TaskClaimed = 3,

    /// <summary>Atama kaldırıldı, iş havuza geri döndü.</summary>
    TaskReleased = 4,

    /// <summary>İş başka bir kullanıcıya atandı / devredildi.</summary>
    TaskAssigned = 5,

    /// <summary>İş tamamlandı.</summary>
    TaskCompleted = 6,

    /// <summary>Tamamlanmış iş yeniden açıldı.</summary>
    TaskReopened = 7,
}
