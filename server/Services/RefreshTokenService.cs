using System.Data;
using System.Security.Cryptography;
using System.Text;
using Dapper;

namespace TaskManagementSystem.Services;

/// <summary>
/// Yenileme token'ının doğrulama sonucu.
/// </summary>
/// <param name="UserId">Token geçerliyse sahibinin Id'si.</param>
/// <param name="Outcome">Neden kabul/ret edildiği.</param>
public readonly record struct RefreshResult(int UserId, RefreshOutcome Outcome)
{
    public bool IsValid => Outcome == RefreshOutcome.Valid;

    public static RefreshResult Invalid(RefreshOutcome outcome) => new(0, outcome);
}

public enum RefreshOutcome
{
    Valid,

    /// <summary>Böyle bir token hiç yok (ya da elle uydurulmuş).</summary>
    NotFound,

    /// <summary>Süresi dolmuş.</summary>
    Expired,

    /// <summary>
    /// Daha önce kullanılmış/iptal edilmiş bir token tekrar sunuldu.
    /// Bu, token'ın kopyalanmış olabileceği anlamına geliyor.
    /// </summary>
    Reused,
}

public interface IRefreshTokenService
{
    /// <summary>
    /// Kullanıcı için yeni bir yenileme token'ı üretir ve özetini saklar.
    /// Dönen değer istemciye verilecek ham token - bir daha üretilemez.
    /// </summary>
    Task<string> IssueAsync(IDbConnection connection, int userId);

    /// <summary>
    /// Token'ı doğrular ve geçerliyse iptal eder (döndürme).
    /// Çağıranın ardından <see cref="IssueAsync"/> ile yenisini üretmesi gerekir.
    /// </summary>
    Task<RefreshResult> ValidateAndRevokeAsync(IDbConnection connection, string rawToken);

    /// <summary>Kullanıcının tüm geçerli token'larını iptal eder (çıkış).</summary>
    Task RevokeAllAsync(IDbConnection connection, int userId);
}

/// <summary>
/// Yenileme token'larının üretimi, doğrulanması ve döndürülmesi.
///
/// DÖNDÜRME (rotation)
/// Her yenilemede eski token iptal edilip yenisi veriliyor. Böylece bir token
/// yalnızca bir kez işe yarıyor; ağdan kopyalanmış bir token, gerçek kullanıcı
/// bir kez yenilediği anda geçersiz kalıyor.
///
/// YENİDEN KULLANIM TESPİTİ
/// İptal edilmiş bir token tekrar sunulursa iki ihtimal var: ya token
/// çalınmış ya da gerçek kullanıcı eski bir kopyayı gönderdi. İkisini
/// ayırt edemediğimiz için güvenli tarafta kalıp kullanıcının TÜM
/// token'larını iptal ediyoruz - saldırgan elindekiyle devam edemesin.
/// Kullanıcı yalnızca yeniden giriş yapmak zorunda kalıyor.
/// </summary>
public class RefreshTokenService : IRefreshTokenService
{
    /// <summary>
    /// Token'ın bayt uzunluğu. 32 bayt = 256 bit; tahmin edilmesi
    /// pratikte imkânsız.
    /// </summary>
    private const int TokenBytes = 32;

    private readonly IConfiguration _configuration;
    private readonly ILogger<RefreshTokenService> _logger;

    public RefreshTokenService(
        IConfiguration configuration,
        ILogger<RefreshTokenService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Yenileme token'ının ömrü (gün). Erişim token'ından çok daha uzun:
    /// kullanıcının ne sıklıkla yeniden giriş yapacağını bu belirliyor.
    /// </summary>
    private int LifetimeDays =>
        int.TryParse(_configuration["Jwt:RefreshTokenDays"], out var days) && days > 0
            ? days
            : 14;

    public async Task<string> IssueAsync(IDbConnection connection, int userId)
    {
        // Random değil RandomNumberGenerator: tahmin edilebilir bir üreteç
        // burada doğrudan oturum ele geçirmeye dönüşürdü.
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(TokenBytes));

        const string sql = """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
            VALUES (@UserId, @TokenHash, @ExpiresAt, @CreatedAt)
            """;

        var now = DateTime.UtcNow;

        await connection.ExecuteAsync(sql, new
        {
            UserId = userId,
            TokenHash = Hash(raw),
            ExpiresAt = now.AddDays(LifetimeDays),
            CreatedAt = now,
        });

        return raw;
    }

    public async Task<RefreshResult> ValidateAndRevokeAsync(
        IDbConnection connection,
        string rawToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
            return RefreshResult.Invalid(RefreshOutcome.NotFound);

        var hash = Hash(rawToken);

        const string selectSql = """
            SELECT user_id AS UserId, expires_at AS ExpiresAt, revoked_at AS RevokedAt
            FROM refresh_tokens
            WHERE token_hash = @Hash
            """;

        var row = await connection.QuerySingleOrDefaultAsync<TokenRow>(
            selectSql, new { Hash = hash });

        if (row is null)
            return RefreshResult.Invalid(RefreshOutcome.NotFound);

        if (row.RevokedAt is not null)
        {
            // Bu token zaten kullanılmıştı. Kopyalanmış olabilir - kullanıcının
            // elindeki her şeyi iptal ediyoruz.
            _logger.LogWarning(
                "İptal edilmiş yenileme token'ı tekrar sunuldu (kullanıcı {UserId}). "
                + "Kullanıcının tüm oturumları kapatıldı.",
                row.UserId);

            await RevokeAllAsync(connection, row.UserId);

            return RefreshResult.Invalid(RefreshOutcome.Reused);
        }

        if (row.ExpiresAt <= DateTime.UtcNow)
            return RefreshResult.Invalid(RefreshOutcome.Expired);

        // Döndürme: token tek kullanımlık.
        const string revokeSql = """
            UPDATE refresh_tokens
            SET revoked_at = @Now
            WHERE token_hash = @Hash AND revoked_at IS NULL
            """;

        var affected = await connection.ExecuteAsync(
            revokeSql, new { Hash = hash, Now = DateTime.UtcNow });

        // Aynı token'la iki istek aynı anda geldiyse yalnızca biri satırı
        // güncelleyebilir; diğeri buraya düşüyor ve reddediliyor.
        if (affected == 0)
            return RefreshResult.Invalid(RefreshOutcome.Reused);

        return new RefreshResult(row.UserId, RefreshOutcome.Valid);
    }

    public async Task RevokeAllAsync(IDbConnection connection, int userId)
    {
        const string sql = """
            UPDATE refresh_tokens
            SET revoked_at = @Now
            WHERE user_id = @UserId AND revoked_at IS NULL
            """;

        await connection.ExecuteAsync(sql, new { UserId = userId, Now = DateTime.UtcNow });
    }

    /// <summary>
    /// Token'ın veritabanına yazılan hali. SHA-256 yeterli: değer yüksek
    /// entropili rastgele veri, kaba kuvvetle geri çevrilemiyor.
    /// </summary>
    private static string Hash(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));

        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private sealed class TokenRow
    {
        public int UserId { get; set; }
        public DateTime ExpiresAt { get; set; }
        public DateTime? RevokedAt { get; set; }
    }
}
