using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// İşlem geçmişi: kim hangi işte ne yaptı.
///
/// Kayıtlar yalnızca okunabilir - geçmişi düzenleyecek ya da silecek bir uç
/// nokta bilerek yok, aksi halde denetim kaydı olarak bir değeri kalmazdı.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ActivityController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IActivityLogService _activityLog;

    /// <summary>Tek istekte dönülebilecek en fazla kayıt.</summary>
    private const int MaxTake = 200;

    /// <summary>Sayfa boyutu verilmediğinde kullanılan değer.</summary>
    private const int DefaultTake = 50;

    public ActivityController(
        IDbConnectionFactory connectionFactory,
        IActivityLogService activityLog)
    {
        _connectionFactory = connectionFactory;
        _activityLog = activityLog;
    }

    // GET api/activity
    // GET api/activity?take=50&skip=100
    [HttpGet]
    public async Task<ActionResult<PagedResult<ActivityEntryDto>>> GetRecent(
        [FromQuery] int take = DefaultTake,
        [FromQuery] int skip = 0)
    {
        // İstemciden gelen sayıları olduğu gibi LIMIT/OFFSET'e vermiyoruz:
        // negatif bir OFFSET sorguyu hataya düşürür, çok büyük bir LIMIT ise
        // tabloyu tek istekte boşaltmanın yolu olurdu.
        var limit = Math.Clamp(take, 1, MaxTake);
        var offset = Math.Max(skip, 0);

        using var connection = _connectionFactory.CreateConnection();

        // Ekip token'dan okunuyor; geçmiş yalnızca kendi ekibinin hareketleri.
        var page = await _activityLog.GetPagedAsync(
            connection, User.GetTeamId(), offset, limit);

        return Ok(page);
    }
}
