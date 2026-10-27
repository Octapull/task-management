using System.Data;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// Kayıt, e-posta doğrulama ve giriş.
///
/// Akışın özeti: kayıt isteği kullanıcıyı <b>doğrulanmamış</b> olarak yazar ve
/// e-postaya 6 haneli kod gönderir. Token ancak kod doğrulandıktan sonra
/// üretiliyor - yani kayıt formunu doldurmak tek başına sisteme girmeye
/// yetmiyor.
/// </summary>
[ApiController]
[Route("api/auth")]
// Şifre ve doğrulama kodu denemeleri bu uçlardan yapılıyor; otomatik
// deneme saldırılarını yavaşlatmak için hız sınırı burada.
[EnableRateLimiting(ServiceCollectionExtensions.AuthRateLimitPolicy)]
public class AuthController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITokenService _tokenService;
    private readonly IRefreshTokenService _refreshTokens;
    private readonly IVerificationCodeService _verificationCodes;
    private readonly IConfiguration _configuration;

    public AuthController(
        IDbConnectionFactory connectionFactory,
        ITokenService tokenService,
        IRefreshTokenService refreshTokens,
        IVerificationCodeService verificationCodes,
        IConfiguration configuration)
    {
        _connectionFactory = connectionFactory;
        _tokenService = tokenService;
        _refreshTokens = refreshTokens;
        _verificationCodes = verificationCodes;
        _configuration = configuration;
    }

    // POST api/auth/register
    /// <summary>
    /// Hesabı ve ekip bağını oluşturur, doğrulama kodunu gönderir.
    /// Token dönmez - kullanıcı henüz giriş yapmış sayılmıyor.
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<PendingVerificationResponse>> Register(RegisterRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var email = request.Email.Trim().ToLowerInvariant();

        var existing = await FindUserByEmailAsync(connection, email);

        // Doğrulanmış hesap varsa kayıt tekrarlanamaz. Doğrulanmamış hesap
        // varsa kaydı tazeleyip yeni kod gönderiyoruz: kullanıcı formu yarıda
        // bıraktıysa "bu e-posta zaten kayıtlı" duvarına toslamasın.
        if (existing is not null && existing.IsEmailConfirmed)
            return Conflict("Bu e-posta adresiyle zaten bir kullanıcı kayıtlı.");

        Team team;

        try
        {
            team = request.Mode == TeamJoinMode.CreateTeam
                ? await CreateTeamAsync(connection, request.TeamName!)
                : await ResolveTeamByCodeAsync(connection, request.TeamCode!);
        }
        catch (TeamCodeNotFoundException)
        {
            return BadRequest("Ekip kodu bulunamadı, kodu tekrar kontrol et.");
        }

        // Ekibi kuran sahip, koda katılan üye olur.
        var role = request.Mode == TeamJoinMode.CreateTeam
            ? UserRole.Owner
            : UserRole.Member;

        var user = new User
        {
            Id = existing?.Id ?? 0,
            FullName = request.FullName.Trim(),
            Email = email,
            // Şifre asla düz metin olarak saklanmaz, önce hash'leniyor.
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = role,
            TeamId = team.Id,
            IsEmailConfirmed = false,
            CreatedAt = existing?.CreatedAt ?? DateTime.UtcNow,
        };

        user.Id = existing is null
            ? await InsertUserAsync(connection, user)
            : await RefreshPendingUserAsync(connection, user);

        var issued = await _verificationCodes.IssueAsync(connection, user);

        return Ok(new PendingVerificationResponse
        {
            Email = user.Email,
            ExpiresAt = issued.ExpiresAt,
            ResendAvailableAt = issued.ResendAvailableAt,
            TeamName = team.Name,
            EmailSent = issued.Sent || issued.Throttled,
            DevCode = issued.DevCode,
        });
    }

    // POST api/auth/verify-code
    /// <summary>
    /// Kodu doğrular, hesabı aktifleştirir ve oturumu başlatır.
    /// Sistemde token üretilen iki yerden biri (diğeri giriş).
    /// </summary>
    [HttpPost("verify-code")]
    public async Task<ActionResult<AuthResponse>> VerifyCode(VerifyCodeRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await FindUserByEmailAsync(connection, email);

        if (user is null)
            return BadRequest("Bu e-posta için bekleyen bir doğrulama yok.");

        // Zaten doğrulanmış hesap için kod istemek bir hata değil; kullanıcıyı
        // "kod geçersiz" diye şaşırtmak yerine girişe yönlendiriyoruz.
        if (user.IsEmailConfirmed)
            return Conflict("Bu hesap zaten doğrulanmış, giriş yapabilirsin.");

        var outcome = await _verificationCodes.VerifyAsync(connection, user.Id, request.Code);

        if (outcome != VerifyCodeOutcome.Success)
        {
            return BadRequest(outcome switch
            {
                VerifyCodeOutcome.Expired =>
                    "Kodun süresi doldu, yeni kod iste.",
                VerifyCodeOutcome.NotFound =>
                    "Bekleyen bir kod yok, yeni kod iste.",
                VerifyCodeOutcome.TooManyAttempts =>
                    "Çok fazla yanlış deneme yapıldı. Bu kod iptal edildi, yeni kod iste.",
                _ => "Kod hatalı, tekrar dene.",
            });
        }

        const string confirmSql =
            "UPDATE users SET is_email_confirmed = TRUE WHERE id = @UserId";

        await connection.ExecuteAsync(confirmSql, new { UserId = user.Id });
        user.IsEmailConfirmed = true;

        var team = await LoadTeamAsync(connection, user.TeamId);

        return Ok(await BuildAuthResponseAsync(connection, user, team));
    }

    // POST api/auth/resend-code
    /// <summary>
    /// Yeni kod üretip gönderir. Sık istenirse 429 döner - hız sınırı
    /// sunucuda, istemcinin geri sayımına güvenilmiyor.
    /// </summary>
    [HttpPost("resend-code")]
    public async Task<ActionResult<PendingVerificationResponse>> ResendCode(ResendCodeRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await FindUserByEmailAsync(connection, email);

        if (user is null)
            return BadRequest("Bu e-posta için bekleyen bir doğrulama yok.");

        if (user.IsEmailConfirmed)
            return Conflict("Bu hesap zaten doğrulanmış, giriş yapabilirsin.");

        var issued = await _verificationCodes.IssueAsync(connection, user);
        var team = await LoadTeamAsync(connection, user.TeamId);

        var response = new PendingVerificationResponse
        {
            Email = user.Email,
            ExpiresAt = issued.ExpiresAt,
            ResendAvailableAt = issued.ResendAvailableAt,
            TeamName = team?.Name,
            EmailSent = issued.Sent || issued.Throttled,
            DevCode = issued.DevCode,
        };

        // Hız sınırına takıldıysa gövde yine dolu dönüyor: istemci geri
        // sayımı ResendAvailableAt'e göre yeniden kurabilsin.
        if (issued.Throttled)
            return StatusCode(StatusCodes.Status429TooManyRequests, response);

        return Ok(response);
    }

    // POST api/auth/forgot-password
    /// <summary>
    /// Şifre sıfırlama kodu gönderir.
    ///
    /// E-posta kayıtlı olmasa bile 200 dönüyor: aksi halde bu uç nokta
    /// "hangi adresler sistemde kayıtlı" sorusunu yanıtlayan bir araca
    /// dönüşürdü. Kullanıcıya her durumda aynı şey söyleniyor.
    /// </summary>
    [HttpPost("forgot-password")]
    public async Task<ActionResult<PendingVerificationResponse>> ForgotPassword(
        ForgotPasswordRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await FindUserByEmailAsync(connection, email);

        var lifetime = _verificationCodes.CodeLifetimeMinutes;

        // Kayıt yoksa kod da üretilmiyor; yanıt yalnızca istemcinin ekranı
        // kurabilmesi için makul değerlerle dolduruluyor.
        if (user is null)
        {
            return Ok(new PendingVerificationResponse
            {
                Email = email,
                ExpiresAt = DateTime.UtcNow.AddMinutes(lifetime),
                ResendAvailableAt = DateTime.UtcNow.AddSeconds(60),
            });
        }

        var issued = await _verificationCodes.IssueAsync(
            connection, user, VerificationPurpose.PasswordReset);

        var response = new PendingVerificationResponse
        {
            Email = user.Email,
            ExpiresAt = issued.ExpiresAt,
            ResendAvailableAt = issued.ResendAvailableAt,
            EmailSent = issued.Sent || issued.Throttled,
            DevCode = issued.DevCode,
        };

        if (issued.Throttled)
            return StatusCode(StatusCodes.Status429TooManyRequests, response);

        return Ok(response);
    }

    // POST api/auth/reset-password
    /// <summary>
    /// Kodu doğrulayıp yeni şifreyi yazar ve kullanıcıyı oturuma alır.
    ///
    /// Doğru kodu girmek e-posta kutusuna erişimi kanıtlıyor; bu yüzden
    /// hesap doğrulanmamışsa aynı anda doğrulanmış da sayılıyor - kullanıcıyı
    /// ikinci bir kod turuna sokmanın güvenlik açısından kazandırdığı bir şey
    /// yok.
    /// </summary>
    [HttpPost("reset-password")]
    public async Task<ActionResult<AuthResponse>> ResetPassword(ResetPasswordRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await FindUserByEmailAsync(connection, email);

        // Kullanıcı yoksa da "kod hatalı" diyoruz: adresin kayıtlı olup
        // olmadığı buradan da anlaşılmasın.
        if (user is null)
            return BadRequest("Kod hatalı ya da süresi dolmuş.");

        var outcome = await _verificationCodes.VerifyAsync(
            connection, user.Id, request.Code, VerificationPurpose.PasswordReset);

        if (outcome != VerifyCodeOutcome.Success)
        {
            return BadRequest(outcome switch
            {
                VerifyCodeOutcome.Expired =>
                    "Kodun süresi doldu, yeni kod iste.",
                VerifyCodeOutcome.NotFound =>
                    "Bekleyen bir sıfırlama kodu yok, yeni kod iste.",
                VerifyCodeOutcome.TooManyAttempts =>
                    "Çok fazla yanlış deneme yapıldı. Bu kod iptal edildi, yeni kod iste.",
                _ => "Kod hatalı, tekrar dene.",
            });
        }

        const string updateSql = """
            UPDATE users
            SET password_hash = @PasswordHash, is_email_confirmed = TRUE
            WHERE id = @UserId
            """;

        await connection.ExecuteAsync(updateSql, new
        {
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword),
            UserId = user.Id,
        });

        user.IsEmailConfirmed = true;

        var team = await LoadTeamAsync(connection, user.TeamId);

        return Ok(await BuildAuthResponseAsync(connection, user, team));
    }

    // POST api/auth/login
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await FindUserByEmailAsync(connection, email);

        // Kullanıcı bulunamadı VEYA şifre yanlış - ikisinde de aynı hatayı
        // döndürüyoruz, yoksa "email var ama şifre yanlış" bilgisini
        // kötü niyetli birine vermiş oluruz.
        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized("E-posta veya şifre hatalı.");

        var team = await LoadTeamAsync(connection, user.TeamId);

        // Şifre doğru ama hesap doğrulanmamış: hata vermek yerine kodu
        // tazeleyip istemciyi doğrulama ekranına yönlendiriyoruz.
        if (!user.IsEmailConfirmed)
        {
            var issued = await _verificationCodes.IssueAsync(connection, user);

            return StatusCode(StatusCodes.Status403Forbidden, new PendingVerificationResponse
            {
                Email = user.Email,
                ExpiresAt = issued.ExpiresAt,
                ResendAvailableAt = issued.ResendAvailableAt,
                TeamName = team?.Name,
                EmailSent = issued.Sent || issued.Throttled,
                DevCode = issued.DevCode,
            });
        }

        return Ok(await BuildAuthResponseAsync(connection, user, team));
    }

    // POST api/auth/refresh
    /// <summary>
    /// Süresi dolmuş erişim token'ının yerine yenisini verir.
    ///
    /// Kullanıcıdan hiçbir şey istenmiyor: istemci elindeki yenileme
    /// token'ını gönderiyor, karşılığında yeni bir erişim + yenileme çifti
    /// alıyor. Eski yenileme token'ı bu işlemde iptal ediliyor (döndürme),
    /// yani istemcinin dönen yeni değeri saklaması gerekiyor.
    ///
    /// Ekip bilgisi de yeniden okunuyor: token'ın içindeki ekip claim'i
    /// tazelensin diye.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshTokenRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var result = await _refreshTokens.ValidateAndRevokeAsync(
            connection, request.RefreshToken);

        // Neden reddedildiğini istemciye ayrıntılı söylemiyoruz: geçersiz bir
        // token'ın "yok mu, süresi mi dolmuş, iptal mi edilmiş" olduğu bilgisi
        // saldırgana yarar, kullanıcıya yaramaz. Her durumda yapılacak şey
        // aynı: yeniden giriş.
        if (!result.IsValid)
            return Unauthorized("Oturumun süresi doldu, tekrar giriş yap.");

        var user = await FindUserByIdAsync(connection, result.UserId);

        // Kullanıcı silinmiş ya da doğrulaması geri alınmış olabilir.
        if (user is null || !user.IsEmailConfirmed)
            return Unauthorized("Oturumun süresi doldu, tekrar giriş yap.");

        var team = await LoadTeamAsync(connection, user.TeamId);

        return Ok(await BuildAuthResponseAsync(connection, user, team));
    }

    // POST api/auth/logout
    /// <summary>
    /// Yenileme token'ını iptal eder.
    ///
    /// Erişim token'ı (JWT) sunucuda saklanmadığı için iptal edilemiyor;
    /// süresi dolana kadar (en fazla Jwt:ExpiryMinutes) geçerli kalıyor.
    /// İptal edilen yenileme token'ı sayesinde o süre dolduğunda oturum
    /// gerçekten bitiyor.
    ///
    /// Token zaten geçersizse de 204 dönüyor: çıkış yapmak isteyen birine
    /// hata göstermenin anlamı yok.
    /// </summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshTokenRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        await _refreshTokens.ValidateAndRevokeAsync(connection, request.RefreshToken);

        return NoContent();
    }

    // --- Ekip yardımcıları ---------------------------------------------------

    private static async Task<Team> CreateTeamAsync(IDbConnection connection, string teamName)
    {
        var code = await TeamCodeGenerator.CreateUniqueAsync(connection);

        const string sql = """
            INSERT INTO teams (name, team_code, created_at)
            VALUES (@Name, @TeamCode, @CreatedAt)
            RETURNING id
            """;

        var team = new Team
        {
            Name = teamName.Trim(),
            TeamCode = code,
            CreatedAt = DateTime.UtcNow,
        };

        team.Id = await connection.QuerySingleAsync<int>(sql, team);

        return team;
    }

    private static async Task<Team> ResolveTeamByCodeAsync(IDbConnection connection, string teamCode)
    {
        const string sql = """
            SELECT id AS Id, name AS Name, team_code AS TeamCode, created_at AS CreatedAt
            FROM teams
            WHERE team_code = @TeamCode
            """;

        var team = await connection.QuerySingleOrDefaultAsync<Team>(
            sql, new { TeamCode = TeamCodeGenerator.Normalize(teamCode) });

        return team ?? throw new TeamCodeNotFoundException();
    }

    private static async Task<Team?> LoadTeamAsync(IDbConnection connection, int? teamId)
    {
        if (teamId is not > 0) return null;

        const string sql = """
            SELECT id AS Id, name AS Name, team_code AS TeamCode, created_at AS CreatedAt
            FROM teams
            WHERE id = @TeamId
            """;

        return await connection.QuerySingleOrDefaultAsync<Team>(sql, new { TeamId = teamId });
    }

    // --- Kullanıcı yardımcıları ----------------------------------------------

    /// <summary>
    /// Yenileme akışında kullanılıyor: elimizde e-posta değil, token'ın
    /// işaret ettiği kullanıcı Id'si var.
    /// </summary>
    private static async Task<User?> FindUserByIdAsync(IDbConnection connection, int id)
    {
        const string sql = """
            SELECT
                id AS Id, full_name AS FullName, email AS Email,
                password_hash AS PasswordHash, role AS Role, team_id AS TeamId,
                is_email_confirmed AS IsEmailConfirmed, created_at AS CreatedAt
            FROM users
            WHERE id = @Id
            """;

        return await connection.QuerySingleOrDefaultAsync<User>(sql, new { Id = id });
    }

    private static async Task<User?> FindUserByEmailAsync(IDbConnection connection, string email)
    {
        const string sql = """
            SELECT
                id AS Id, full_name AS FullName, email AS Email,
                password_hash AS PasswordHash, role AS Role, team_id AS TeamId,
                is_email_confirmed AS IsEmailConfirmed, created_at AS CreatedAt
            FROM users
            WHERE LOWER(email) = @Email
            """;

        return await connection.QuerySingleOrDefaultAsync<User>(sql, new { Email = email });
    }

    private static async Task<int> InsertUserAsync(IDbConnection connection, User user)
    {
        const string sql = """
            INSERT INTO users
                (full_name, email, password_hash, role, team_id, is_email_confirmed, created_at)
            VALUES
                (@FullName, @Email, @PasswordHash, @Role, @TeamId, FALSE, @CreatedAt)
            RETURNING id
            """;

        return await connection.QuerySingleAsync<int>(sql, user);
    }

    /// <summary>
    /// Doğrulamayı yarıda bırakmış kaydın üzerine yazar.
    ///
    /// Güvenli, çünkü hesap henüz doğrulanmadı: adresin sahibi olduğunu
    /// kanıtlayan kimse yok, dolayısıyla kimsenin hesabı ele geçirilmiyor.
    /// </summary>
    private static async Task<int> RefreshPendingUserAsync(IDbConnection connection, User user)
    {
        const string sql = """
            UPDATE users
            SET full_name = @FullName,
                password_hash = @PasswordHash,
                role = @Role,
                team_id = @TeamId
            WHERE id = @Id AND is_email_confirmed = FALSE
            """;

        await connection.ExecuteAsync(sql, user);

        return user.Id;
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(
        IDbConnection connection,
        User user,
        Team? team)
    {
        var expiryMinutes = double.Parse(_configuration["Jwt:ExpiryMinutes"] ?? "60");

        return new AuthResponse
        {
            Token = _tokenService.GenerateToken(user, team),
            RefreshToken = await _refreshTokens.IssueAsync(connection, user.Id),
            ExpiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes),
            UserId = user.Id,
            FullName = user.FullName,
            Role = user.Role.ToString(),
            TeamId = team?.Id ?? 0,
            TeamName = team?.Name ?? string.Empty,
            TeamCode = team?.TeamCode ?? string.Empty,
        };
    }

    /// <summary>Girilen ekip kodu hiçbir ekiple eşleşmedi.</summary>
    private sealed class TeamCodeNotFoundException : Exception;
}
