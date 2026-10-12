using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;
using TaskManagementSystem.Extensions;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// Ekip üyelerinin listesi ve kullanıcının kendi profil ayarları.
///
/// "/me" uçları her zaman token'daki kimliği kullanır; istemci hangi
/// kullanıcıyı düzenlediğini seçemez. Üye listesi de token'daki ekiple
/// sınırlı - başka ekiplerin çalışanları hiçbir yerde görünmüyor.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;

    public UsersController(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    // GET api/users
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserSummary>>> GetAll()
    {
        using var connection = _connectionFactory.CreateConnection();

        // Şifre hash'i ve e-posta bilerek seçilmiyor - listede işi yok.
        //
        // Doğrulamasını tamamlamamış kayıtlar da listelenmiyor: henüz gerçek
        // bir üye değiller, atama listesinde görünmeleri kafa karıştırırdı.
        const string sql = """
            SELECT id AS Id, full_name AS FullName, role AS Role
            FROM users
            WHERE team_id = @TeamId AND is_email_confirmed = TRUE
            ORDER BY full_name
            """;

        var rows = await connection.QueryAsync<UserRow>(sql, new { TeamId = User.GetTeamId() });

        var users = rows.Select(row => new UserSummary
        {
            Id = row.Id,
            FullName = row.FullName,
            // Rol veritabanında sayı; arayüz metin bekliyor (AuthResponse ile aynı biçim).
            Role = row.Role.ToString(),
        });

        return Ok(users);
    }

    // GET api/users/me
    [HttpGet("me")]
    public async Task<ActionResult<UserProfile>> GetMe()
    {
        using var connection = _connectionFactory.CreateConnection();

        var profile = await LoadProfileAsync(connection, CurrentUserId);

        if (profile is null)
            return NotFound();

        return Ok(profile);
    }

    // PUT api/users/me
    [HttpPut("me")]
    public async Task<ActionResult<UserProfile>> UpdateMe(UpdateProfileRequest request)
    {
        var userId = CurrentUserId;
        if (userId == 0)
            return Unauthorized();

        using var connection = _connectionFactory.CreateConnection();

        // Küçük harfe çeviriyoruz: kayıt akışı da böyle yazıyor ve giriş
        // LOWER(email) ile arıyor. Burada olduğu gibi bırakılırsa "ali@x.com"
        // ile "ALI@X.com" iki ayrı satır olarak var olabiliyor, giriş sorgusu
        // iki kayıt birden buluyor ve İKİ kullanıcı da giriş yapamıyordu.
        var email = request.Email.Trim().ToLowerInvariant();

        // E-posta benzersiz olmalı, ama kişinin kendi adresi çakışma sayılmaz.
        // Karşılaştırma da harf durumundan bağımsız - veritabanındaki
        // ux_users_email_lower indeksi ile aynı kural.
        const string duplicateSql =
            "SELECT COUNT(1) FROM users WHERE LOWER(email) = @Email AND id <> @UserId";

        var duplicates = await connection.QuerySingleAsync<int>(
            duplicateSql, new { Email = email, UserId = userId });

        if (duplicates > 0)
            return Conflict("Bu e-posta adresi başka bir kullanıcıya ait.");

        const string sql = """
            UPDATE users
            SET full_name = @FullName,
                email = @Email,
                notify_on_assignment = @NotifyOnAssignment,
                notify_on_due_date = @NotifyOnDueDate
            WHERE id = @UserId
            """;

        int affectedRows;

        try
        {
            affectedRows = await connection.ExecuteAsync(sql, new
            {
                FullName = request.FullName.Trim(),
                Email = email,
                request.NotifyOnAssignment,
                request.NotifyOnDueDate,
                UserId = userId,
            });
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Yukarıdaki kontrolle bu satır arasında aynı adresi alan başka
            // bir istek geçmiş olabilir. Son sözü veritabanı söylüyor; kullanıcı
            // 500 yerine anlaşılır bir yanıt görsün.
            return Conflict("Bu e-posta adresi başka bir kullanıcıya ait.");
        }

        if (affectedRows == 0)
            return NotFound();

        return Ok(await LoadProfileAsync(connection, userId));
    }

    // PUT api/users/me/password
    [HttpPut("me/password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var userId = CurrentUserId;
        if (userId == 0)
            return Unauthorized();

        using var connection = _connectionFactory.CreateConnection();

        const string selectSql = "SELECT password_hash FROM users WHERE id = @UserId";
        var currentHash = await connection.QuerySingleOrDefaultAsync<string>(
            selectSql, new { UserId = userId });

        if (currentHash is null)
            return NotFound();

        // Mevcut şifre doğrulanmadan yenisi yazılmaz.
        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, currentHash))
            return BadRequest("Mevcut şifre hatalı.");

        if (BCrypt.Net.BCrypt.Verify(request.NewPassword, currentHash))
            return BadRequest("Yeni şifre eskisiyle aynı olamaz.");

        const string updateSql =
            "UPDATE users SET password_hash = @PasswordHash WHERE id = @UserId";

        await connection.ExecuteAsync(updateSql, new
        {
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword),
            UserId = userId,
        });

        return NoContent();
    }

    // --- Yardımcılar --------------------------------------------------------

    /// <summary>Token içindeki kullanıcı Id'si.</summary>
    private int CurrentUserId => User.GetUserId();

    private static async Task<UserProfile?> LoadProfileAsync(
        System.Data.IDbConnection connection,
        int userId)
    {
        // Ekip adı ve davet kodu profil ekranında gösteriliyor; LEFT JOIN
        // çünkü ekip bağı olmayan (taşınmamış) eski bir kayıt olabilir.
        const string sql = """
            SELECT u.id AS Id, u.full_name AS FullName, u.email AS Email,
                   u.role AS Role, u.team_id AS TeamId,
                   t.name AS TeamName, t.team_code AS TeamCode,
                   u.notify_on_assignment AS NotifyOnAssignment,
                   u.notify_on_due_date AS NotifyOnDueDate,
                   u.created_at AS CreatedAt
            FROM users u
            LEFT JOIN teams t ON t.id = u.team_id
            WHERE u.id = @UserId
            """;

        var row = await connection.QuerySingleOrDefaultAsync<ProfileRow>(sql, new { UserId = userId });
        if (row is null) return null;

        return new UserProfile
        {
            Id = row.Id,
            FullName = row.FullName,
            Email = row.Email,
            Role = row.Role.ToString(),
            TeamId = row.TeamId,
            TeamName = row.TeamName,
            TeamCode = row.TeamCode,
            NotifyOnAssignment = row.NotifyOnAssignment,
            NotifyOnDueDate = row.NotifyOnDueDate,
            CreatedAt = row.CreatedAt,
        };
    }

    /// <summary>Dapper'ın satırı bağladığı ara tip.</summary>
    private sealed class UserRow
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public UserRole Role { get; set; }
    }

    /// <summary>Rol sayı olarak geldiği için profil satırı da ara tipe bağlanıyor.</summary>
    private sealed class ProfileRow
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public UserRole Role { get; set; }
        public int? TeamId { get; set; }
        public string? TeamName { get; set; }
        public string? TeamCode { get; set; }
        public bool NotifyOnAssignment { get; set; }
        public bool NotifyOnDueDate { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
