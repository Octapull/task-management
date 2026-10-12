using System.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

public interface IActivityLogService
{
    /// <summary>
    /// Geçmişe bir kayıt yazar ve yazılan kaydı (isimleriyle birlikte) döner.
    /// </summary>
    /// <param name="connection">
    /// Çağıranın açtığı bağlantı yeniden kullanılıyor; her kayıt için ayrı
    /// bağlantı açmanın anlamı yok.
    /// </param>
    Task<ActivityEntryDto?> RecordAsync(IDbConnection connection, ActivityEntry entry);

    /// <summary>
    /// Sayfalanmış işlem geçmişi (ekranın ana listesi).
    ///
    /// activity_log her işlemde bir satır daha büyüyor ve hiç küçülmüyor;
    /// sabit sayıda kayıt çekmek bir süre sonra eski geçmişi tamamen
    /// erişilemez kılıyordu.
    /// </summary>
    Task<PagedResult<ActivityEntryDto>> GetPagedAsync(
        IDbConnection connection,
        int teamId,
        int skip,
        int take);

    /// <summary>
    /// En yeniden eskiye doğru işlem geçmişi. Tek bir işin geçmişi için
    /// kullanılıyor; orada kayıt sayısı doğal olarak sınırlı.
    /// </summary>
    /// <param name="teamId">
    /// Zorunlu: geçmiş her zaman tek bir ekiple sınırlı okunuyor. Varsayılan
    /// değeri bilerek yok - unutulduğunda bütün ekiplerin hareketleri
    /// sessizce görünür hale gelirdi.
    /// </param>
    Task<IEnumerable<ActivityEntryDto>> GetRecentAsync(
        IDbConnection connection,
        int teamId,
        int take,
        int? taskId = null);
}
