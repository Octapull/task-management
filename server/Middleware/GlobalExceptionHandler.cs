using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace TaskManagementSystem.Middleware;

/// <summary>
/// Yakalanmamış istisnaların son durağı.
///
/// Buraya düşen bir hata ya programlama hatası ya da altyapı arızasıdır;
/// beklenen iş kuralı ihlalleri (çakışma, bulunamadı, yetkisiz) zaten
/// controller'larda açıkça dönülüyor.
///
/// Yanıt her zaman aynı biçimde (ProblemDetails) veriliyor - istemcideki
/// `extractErrorMessage` bu gövdeyi zaten tanıyor. İstisnanın kendi metni
/// yalnızca Development'ta gösteriliyor: production'da tablo adları,
/// bağlantı bilgileri gibi ayrıntıları sızdırabilir.
/// </summary>
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IHostEnvironment _environment;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(
        IHostEnvironment environment,
        ILogger<GlobalExceptionHandler> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // İstemci bağlantıyı kapatmış (sekme kapandı, istek iptal edildi):
        // yazılacak bir yanıt yok, hata olarak da loglamıyoruz.
        if (httpContext.RequestAborted.IsCancellationRequested)
            return true;

        var traceId = httpContext.TraceIdentifier;

        _logger.LogError(
            exception,
            "İşlenmeyen hata [{TraceId}] {Method} {Path}",
            traceId,
            httpContext.Request.Method,
            httpContext.Request.Path);

        // Veritabanına ulaşılamaması "sunucu hatası" değil "şu an hizmet
        // veremiyoruz" demek; ayrıca bu projede en sık karşılaşılan arıza
        // (PostgreSQL kapalı), ayırt edilebilir olması işe yarıyor.
        var (status, title) = exception switch
        {
            NpgsqlException => (
                StatusCodes.Status503ServiceUnavailable,
                "Veritabanına ulaşılamıyor."),
            _ => (
                StatusCodes.Status500InternalServerError,
                "Sunucuda beklenmeyen bir hata oluştu."),
        };

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            // Development'ta yalnızca istisnanın mesajı: yığın izi ekrandaki
            // bildirime sığmaz, o zaten loga yazıldı.
            Detail = _environment.IsDevelopment()
                ? exception.Message
                : $"Hata kaydedildi. İşlem numarası: {traceId}",
            Instance = httpContext.Request.Path,
        };

        problem.Extensions["traceId"] = traceId;

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);

        return true;
    }
}
