using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Controllers;

[ApiController]
[Route("api/teams")]
public class TeamsController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;

    public TeamsController(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    // GET api/teams/validate-code/ABCD2345
    /// <summary>
    /// Kayıt formundaki "ekip kodu" alanının anlık kontrolü.
    ///
    /// [AllowAnonymous]: kayıt olmadan önce çağrılıyor, token yok. Dönen tek
    /// bilgi ekibin adı ve üye sayısı - kodu zaten bilen biri için bunlar
    /// sır değil, "doğru yere katılıyor muyum" sorusunun cevabı.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("validate-code/{code}")]
    public async Task<ActionResult<TeamCodeCheckResponse>> ValidateCode(string code)
    {
        var normalized = TeamCodeGenerator.Normalize(code);

        // Çok kısa girdiyi veritabanına hiç sormuyoruz: kullanıcı yazmayı
        // sürdürüyor demektir, her tuşta sorgu atmanın anlamı yok.
        if (normalized.Length < 6)
            return Ok(new TeamCodeCheckResponse { Valid = false });

        using var connection = _connectionFactory.CreateConnection();

        const string sql = """
            SELECT
                t.name AS TeamName,
                (SELECT COUNT(1) FROM users u WHERE u.team_id = t.id) AS MemberCount
            FROM teams t
            WHERE t.team_code = @Code
            """;

        var row = await connection.QuerySingleOrDefaultAsync<TeamRow>(
            sql, new { Code = normalized });

        // Kod yanlışsa 404 değil "valid: false" dönüyoruz - bu uç nokta form
        // yazılırken sürekli çağrılıyor, konsolu 404'lerle doldurmayalım.
        if (row is null)
            return Ok(new TeamCodeCheckResponse { Valid = false });

        return Ok(new TeamCodeCheckResponse
        {
            Valid = true,
            TeamName = row.TeamName,
            MemberCount = row.MemberCount,
        });
    }

    // GET api/teams/me
    /// <summary>Ekip yönetimi ekranının verisi: ekip bilgisi ve üye listesi.</summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<TeamDetail>> GetMyTeam()
    {
        var teamId = User.GetTeamId();
        if (teamId == 0)
            return NotFound();

        using var connection = _connectionFactory.CreateConnection();

        var team = await LoadTeamAsync(connection, teamId, User.GetUserId());

        if (team is null)
            return NotFound();

        return Ok(team);
    }

    // PUT api/teams/me
    /// <summary>Ekibin adını değiştirir.</summary>
    [Authorize]
    [HttpPut("me")]
    public async Task<ActionResult<TeamDetail>> Rename(UpdateTeamRequest request)
    {
        var teamId = User.GetTeamId();
        var userId = User.GetUserId();

        if (teamId == 0)
            return NotFound();

        using var connection = _connectionFactory.CreateConnection();

        if (!await IsOwnerAsync(connection, userId, teamId))
            return OwnerOnly();

        const string sql = "UPDATE teams SET name = @Name WHERE id = @TeamId";

        var affectedRows = await connection.ExecuteAsync(
            sql, new { Name = request.Name.Trim(), TeamId = teamId });

        if (affectedRows == 0)
            return NotFound();

        return Ok(await LoadTeamAsync(connection, teamId, userId));
    }

    // POST api/teams/me/code
    /// <summary>
    /// Davet kodunu yeniler.
    ///
    /// Kod istenmeyen birine ulaştığında ekibe katılmasını engellemenin tek
    /// yolu bu: eski kod anında geçersiz oluyor.
    /// </summary>
    [Authorize]
    [HttpPost("me/code")]
    public async Task<ActionResult<TeamDetail>> RegenerateCode()
    {
        var teamId = User.GetTeamId();
        var userId = User.GetUserId();

        if (teamId == 0)
            return NotFound();

        using var connection = _connectionFactory.CreateConnection();

        if (!await IsOwnerAsync(connection, userId, teamId))
            return OwnerOnly();

        var newCode = await TeamCodeGenerator.CreateUniqueAsync(connection);

        const string sql = "UPDATE teams SET team_code = @Code WHERE id = @TeamId";

        var affectedRows = await connection.ExecuteAsync(
            sql, new { Code = newCode, TeamId = teamId });

        if (affectedRows == 0)
            return NotFound();

        return Ok(await LoadTeamAsync(connection, teamId, userId));
    }

    // PUT api/teams/me/owner/3
    /// <summary>
    /// Sahipliği başka bir üyeye devreder; devreden kişi Member olur.
    ///
    /// Ekip her zaman tam bir sahibe sahip olmalı, bu yüzden iki güncelleme
    /// tek işlemde yapılıyor.
    /// </summary>
    [Authorize]
    [HttpPut("me/owner/{userId:int}")]
    public async Task<ActionResult<TeamDetail>> TransferOwnership(int userId)
    {
        var teamId = User.GetTeamId();
        var currentUserId = User.GetUserId();

        if (teamId == 0)
            return NotFound();

        if (userId == currentUserId)
            return BadRequest("Sahiplik zaten sende.");

        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        if (!await IsOwnerAsync(connection, currentUserId, teamId))
            return OwnerOnly();

        if (!await IsTeamMemberAsync(connection, userId, teamId))
            return BadRequest("Bu kullanıcı ekipte değil.");

        using var transaction = connection.BeginTransaction();

        const string sql = """
            UPDATE users SET role = @Role
            WHERE id = @UserId AND team_id = @TeamId
            """;

        await connection.ExecuteAsync(sql, new
        {
            Role = (short)UserRole.Owner,
            UserId = userId,
            TeamId = teamId,
        }, transaction);

        await connection.ExecuteAsync(sql, new
        {
            Role = (short)UserRole.Member,
            UserId = currentUserId,
            TeamId = teamId,
        }, transaction);

        transaction.Commit();

        return Ok(await LoadTeamAsync(connection, teamId, currentUserId));
    }

    // DELETE api/teams/me/members/3
    /// <summary>
    /// Üyeyi ekipten çıkarır.
    ///
    /// Üzerindeki işler silinmiyor, havuza dönüyor: ekipten ayrılan kişinin
    /// yaptığı iş kaybolmamalı, sadece sahipsiz kalmalı.
    /// </summary>
    [Authorize]
    [HttpDelete("me/members/{userId:int}")]
    public async Task<ActionResult<TeamDetail>> RemoveMember(int userId)
    {
        var teamId = User.GetTeamId();
        var currentUserId = User.GetUserId();

        if (teamId == 0)
            return NotFound();

        // Sahip kendini çıkaramaz: ekip sahipsiz kalırdı. Önce devretmeli.
        if (userId == currentUserId)
            return BadRequest("Kendini ekipten çıkaramazsın. Önce sahipliği devret.");

        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        if (!await IsOwnerAsync(connection, currentUserId, teamId))
            return OwnerOnly();

        if (!await IsTeamMemberAsync(connection, userId, teamId))
            return NotFound();

        using var transaction = connection.BeginTransaction();

        // Üstlendiği işler havuza dönüyor; başlangıç sayacı bir sonraki
        // üstlenen için sıfırlanıyor. Tamamlanmış işlere dokunulmuyor -
        // onlar bitmiş iş, geçmişte kim yaptıysa öyle kalmalı.
        const string releaseSql = """
            UPDATE tasks
            SET assigned_user_id = NULL,
                status = @OpenStatus,
                started_at = NULL
            WHERE assigned_user_id = @UserId
              AND team_id = @TeamId
              AND status <> @CompletedStatus
            """;

        await connection.ExecuteAsync(releaseSql, new
        {
            UserId = userId,
            TeamId = teamId,
            OpenStatus = (short)TaskItemStatus.Open,
            CompletedStatus = (short)TaskItemStatus.Completed,
        }, transaction);

        const string detachSql = """
            UPDATE users SET team_id = NULL
            WHERE id = @UserId AND team_id = @TeamId
            """;

        await connection.ExecuteAsync(
            detachSql, new { UserId = userId, TeamId = teamId }, transaction);

        transaction.Commit();

        return Ok(await LoadTeamAsync(connection, teamId, currentUserId));
    }

    // --- Yardımcılar --------------------------------------------------------

    /// <summary>
    /// Ekip sahibi mi?
    ///
    /// Token'daki role değil veritabanına bakıyoruz: sahiplik devredildiğinde
    /// eski sahibin token'ı süresi dolana kadar hâlâ "Owner" diyor. Buradaki
    /// işlemler yıkıcı olduğu için anlık doğruluk gerekiyor; ekstra sorgunun
    /// maliyeti bu uçlar nadir çağrıldığı için önemsiz.
    /// </summary>
    private static async Task<bool> IsOwnerAsync(
        IDbConnection connection,
        int userId,
        int teamId)
    {
        const string sql = """
            SELECT COUNT(1) FROM users
            WHERE id = @UserId AND team_id = @TeamId AND role = @Owner
            """;

        var count = await connection.QuerySingleAsync<int>(sql, new
        {
            UserId = userId,
            TeamId = teamId,
            Owner = (short)UserRole.Owner,
        });

        return count > 0;
    }

    private static async Task<bool> IsTeamMemberAsync(
        IDbConnection connection,
        int userId,
        int teamId)
    {
        const string sql =
            "SELECT COUNT(1) FROM users WHERE id = @UserId AND team_id = @TeamId";

        return await connection.QuerySingleAsync<int>(
            sql, new { UserId = userId, TeamId = teamId }) > 0;
    }

    private ObjectResult OwnerOnly() =>
        StatusCode(
            StatusCodes.Status403Forbidden,
            "Bu işlemi yalnızca ekip sahibi yapabilir.");

    private static async Task<TeamDetail?> LoadTeamAsync(
        IDbConnection connection,
        int teamId,
        int currentUserId)
    {
        const string sql = """
            SELECT id AS Id, name AS Name, team_code AS TeamCode, created_at AS CreatedAt
            FROM teams
            WHERE id = @TeamId;

            SELECT
                id                 AS Id,
                full_name          AS FullName,
                email              AS Email,
                role               AS Role,
                is_email_confirmed AS IsEmailConfirmed,
                created_at         AS CreatedAt
            FROM users
            WHERE team_id = @TeamId
            ORDER BY role, full_name;
            """;

        using var results = await connection.QueryMultipleAsync(sql, new { TeamId = teamId });

        var team = await results.ReadSingleOrDefaultAsync<TeamDetail>();
        if (team is null) return null;

        var members = (await results.ReadAsync<MemberRow>()).ToList();

        team.Members = members
            .Select(row => new TeamMember
            {
                Id = row.Id,
                FullName = row.FullName,
                Email = row.Email,
                // Rol veritabanında sayı; arayüz metin bekliyor.
                Role = row.Role.ToString(),
                IsEmailConfirmed = row.IsEmailConfirmed,
                CreatedAt = row.CreatedAt,
            })
            .ToList();

        team.IsOwner = members.Any(
            row => row.Id == currentUserId && row.Role == UserRole.Owner);

        return team;
    }

    private sealed class TeamRow
    {
        public string TeamName { get; set; } = string.Empty;
        public int MemberCount { get; set; }
    }

    /// <summary>Rol sayı olarak geldiği için satır ara tipe bağlanıyor.</summary>
    private sealed class MemberRow
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public UserRole Role { get; set; }
        public bool IsEmailConfirmed { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
