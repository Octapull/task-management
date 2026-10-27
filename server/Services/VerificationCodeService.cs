using System.Data;
using System.Security.Cryptography;
using Dapper;
using Microsoft.Extensions.Options;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

/// <inheritdoc />
public class VerificationCodeService : IVerificationCodeService
{
    private readonly IEmailService _emailService;
    private readonly EmailOptions _options;
    private readonly IHostEnvironment _environment;

    public VerificationCodeService(
        IEmailService emailService,
        IOptions<EmailOptions> options,
        IHostEnvironment environment)
    {
        _emailService = emailService;
        _options = options.Value;
        _environment = environment;
    }

    /// <summary>
    /// Doğrulama kodu API yanıtına konabilir mi?
    ///
    /// İKİ koşul birden gerekiyor: posta servisi mock olmalı VE uygulama
    /// Development'ta çalışıyor olmalı. Ortam koşulu bilerek fazladan:
    /// Email:Provider yapılandırması yanlışlıkla "Mock" kalırsa (ör. yayına
    /// alırken ortam değişkeni eklenmezse) kod yanıtta dönerdi ve kayıt,
    /// hatta şifre sıfırlama akışı herkese açık hale gelirdi - adresin
    /// sahibi olmayan biri kodu okuyup hesabı ele geçirebilirdi.
    ///
    /// Bu haliyle en kötü ihtimalle posta gitmez; kod asla sızmaz.
    /// </summary>
    private bool CanExposeCode =>
        _emailService.ExposesCodeForDevelopment && _environment.IsDevelopment();

    public int CodeLifetimeMinutes => _options.CodeLifetimeMinutes;

    public async Task<IssueCodeResult> IssueAsync(
        IDbConnection connection,
        User user,
        VerificationPurpose purpose = VerificationPurpose.EmailConfirmation)
    {
        var now = DateTime.UtcNow;
        var cooldown = TimeSpan.FromSeconds(_options.ResendCooldownSeconds);

        // Arka arkaya kod istenmesini engelliyoruz: hem posta kutusu dolmasın
        // hem de bu uç nokta e-posta bombardımanı için kullanılamasın.
        // Takma adlar zorunlu: Dapper varsayılan olarak created_at sütununu
        // CreatedAt özelliğine bağlamıyor, alanlar sessizce default(DateTime)
        // kalır ve "son kod ne zaman gönderildi" hesabı hep çok eski çıkardı -
        // yani hız sınırı hiç devreye girmezdi.
        const string lastIssuedSql = """
            SELECT created_at AS CreatedAt, expires_at AS ExpiresAt
            FROM email_verifications
            WHERE user_id = @UserId AND purpose = @Purpose
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """;

        var last = await connection.QuerySingleOrDefaultAsync<LastCodeRow>(
            lastIssuedSql, new { UserId = user.Id, Purpose = (short)purpose });

        if (last is not null)
        {
            // Sütunlar timestamptz: Dapper damgayı UTC işaretli döndürüyor,
            // aşağıdaki çıkarma işlemi doğrudan yapılabiliyor.
            var lastCreatedAt = last.CreatedAt;

            if (now - lastCreatedAt < cooldown)
            {
                return new IssueCodeResult
                {
                    Sent = false,
                    Throttled = true,
                    ExpiresAt = last.ExpiresAt,
                    ResendAvailableAt = lastCreatedAt + cooldown,
                };
            }
        }

        var code = CreateCode();
        var expiresAt = now.AddMinutes(_options.CodeLifetimeMinutes);

        // Yeni kod üretildiğinde eskiler kullanılamaz olmalı - aksi halde
        // kullanıcı üç kez "yeniden gönder" deyip hangisini girse geçerdi.
        const string invalidateSql = """
            UPDATE email_verifications
            SET is_used = TRUE
            WHERE user_id = @UserId AND purpose = @Purpose AND is_used = FALSE
            """;

        await connection.ExecuteAsync(
            invalidateSql, new { UserId = user.Id, Purpose = (short)purpose });

        const string insertSql = """
            INSERT INTO email_verifications
                (user_id, email, code, expires_at, is_used, created_at, purpose)
            VALUES
                (@UserId, @Email, @Code, @ExpiresAt, FALSE, @CreatedAt, @Purpose)
            """;

        await connection.ExecuteAsync(insertSql, new
        {
            UserId = user.Id,
            user.Email,
            Code = code,
            ExpiresAt = expiresAt,
            CreatedAt = now,
            Purpose = (short)purpose,
        });

        var message = VerificationEmailTemplate.Build(
            user.Email, user.FullName, code, _options.CodeLifetimeMinutes, purpose);

        var sent = await _emailService.SendAsync(message);

        return new IssueCodeResult
        {
            Sent = sent,
            Throttled = false,
            ExpiresAt = expiresAt,
            ResendAvailableAt = now + cooldown,
            DevCode = CanExposeCode ? code : null,
        };
    }

    public async Task<VerifyCodeOutcome> VerifyAsync(
        IDbConnection connection,
        int userId,
        string code,
        VerificationPurpose purpose = VerificationPurpose.EmailConfirmation)
    {
        // Yalnızca en son üretilen kod geçerli (öncekiler IssueAsync'te
        // kullanılmış işaretleniyor).
        const string selectSql = """
            SELECT id AS Id, code AS Code, expires_at AS ExpiresAt, attempts AS Attempts
            FROM email_verifications
            WHERE user_id = @UserId AND purpose = @Purpose AND is_used = FALSE
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """;

        var pending = await connection.QuerySingleOrDefaultAsync<PendingCodeRow>(
            selectSql, new { UserId = userId, Purpose = (short)purpose });

        if (pending is null)
            return VerifyCodeOutcome.NotFound;

        if (pending.ExpiresAt <= DateTime.UtcNow)
            return VerifyCodeOutcome.Expired;

        // Sabit süreli karşılaştırma: kodun kaçıncı hanesinin yanlış olduğu
        // sürenin ölçülmesiyle anlaşılamasın.
        var matches = CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(pending.Code),
            System.Text.Encoding.UTF8.GetBytes(code.Trim()));

        if (!matches)
        {
            var attempts = pending.Attempts + 1;
            var exhausted = attempts >= _options.MaxVerificationAttempts;

            // Sayaç dolduğunda kod tamamen iptal ediliyor. Kalan hakla
            // uğraşmak yerine kullanıcı yeni kod istiyor; böylece bir milyon
            // olasılığı deneme yolu kapanıyor.
            const string failSql = """
                UPDATE email_verifications
                SET attempts = @Attempts, is_used = @Exhausted
                WHERE id = @Id
                """;

            await connection.ExecuteAsync(failSql, new
            {
                pending.Id,
                Attempts = (short)attempts,
                Exhausted = exhausted,
            });

            return exhausted
                ? VerifyCodeOutcome.TooManyAttempts
                : VerifyCodeOutcome.Invalid;
        }

        const string consumeSql =
            "UPDATE email_verifications SET is_used = TRUE WHERE id = @Id";

        await connection.ExecuteAsync(consumeSql, new { pending.Id });

        return VerifyCodeOutcome.Success;
    }

    /// <summary>
    /// 000000-999999 arası, baştaki sıfırlar korunarak. Random yerine
    /// RandomNumberGenerator: kod bir hesabın anahtarı, tahmin edilebilir
    /// olmamalı.
    /// </summary>
    private static string CreateCode() =>
        RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    private sealed class LastCodeRow
    {
        public DateTime CreatedAt { get; set; }
        public DateTime ExpiresAt { get; set; }
    }

    private sealed class PendingCodeRow
    {
        public int Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; }
        public int Attempts { get; set; }
    }
}
