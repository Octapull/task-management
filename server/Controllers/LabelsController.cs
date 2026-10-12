using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Extensions;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// Ekibin etiket tanımları.
///
/// Etiketler işten bağımsız yaşıyor: bir kere tanımlanıp onlarca işe
/// takılabiliyor. İşe takma/çıkarma ise <see cref="TasksController"/>
/// altındaki uçtan yapılıyor, çünkü orada değişen şey işin kendisi.
/// </summary>
[ApiController]
[Route("api/labels")]
[Authorize]
public class LabelsController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;

    public LabelsController(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    private const string SelectSql = """
        SELECT
            l.id    AS Id,
            l.name  AS Name,
            l.color AS Color,
            (SELECT COUNT(*)::int FROM task_labels tl WHERE tl.label_id = l.id) AS UsageCount
        FROM labels l
        """;

    // GET api/labels
    [HttpGet]
    public async Task<ActionResult<IEnumerable<LabelDto>>> GetAll()
    {
        using var connection = _connectionFactory.CreateConnection();

        var sql = $"{SelectSql} WHERE l.team_id = @TeamId ORDER BY lower(l.name)";

        return Ok(await connection.QueryAsync<LabelDto>(sql, new { TeamId = CurrentTeamId }));
    }

    // POST api/labels
    [HttpPost]
    public async Task<ActionResult<LabelDto>> Create(SaveLabelRequest request)
    {
        if (CurrentTeamId == 0)
            return NotFound();

        using var connection = _connectionFactory.CreateConnection();

        const string insertSql = """
            INSERT INTO labels (team_id, name, color, created_at)
            VALUES (@TeamId, @Name, @Color, @CreatedAt)
            RETURNING id
            """;

        try
        {
            var newId = await connection.QuerySingleAsync<int>(insertSql, new
            {
                TeamId = CurrentTeamId,
                Name = request.Name.Trim(),
                Color = LabelColors.Normalize(request.Color),
                CreatedAt = DateTime.UtcNow,
            });

            return Ok(await LoadAsync(connection, newId));
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Benzersizlik kısıtı ekip + küçük harfli ad üzerinde.
            return Conflict("Bu isimde bir etiket zaten var.");
        }
    }

    // PUT api/labels/5
    [HttpPut("{id:int}")]
    public async Task<ActionResult<LabelDto>> Update(int id, SaveLabelRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = """
            UPDATE labels
            SET name = @Name, color = @Color
            WHERE id = @Id AND team_id = @TeamId
            """;

        try
        {
            var affectedRows = await connection.ExecuteAsync(sql, new
            {
                Id = id,
                TeamId = CurrentTeamId,
                Name = request.Name.Trim(),
                Color = LabelColors.Normalize(request.Color),
            });

            if (affectedRows == 0)
                return NotFound();

            return Ok(await LoadAsync(connection, id));
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Conflict("Bu isimde bir etiket zaten var.");
        }
    }

    // DELETE api/labels/5
    /// <summary>
    /// Etiketi siler. task_labels'taki bağlar ON DELETE CASCADE ile birlikte
    /// gidiyor - işler etkilenmiyor, yalnızca etiketleri düşüyor.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "DELETE FROM labels WHERE id = @Id AND team_id = @TeamId";

        var affectedRows = await connection.ExecuteAsync(
            sql, new { Id = id, TeamId = CurrentTeamId });

        return affectedRows == 0 ? NotFound() : NoContent();
    }

    // --- Yardımcılar --------------------------------------------------------

    private int CurrentTeamId => User.GetTeamId();

    private async Task<LabelDto?> LoadAsync(IDbConnection connection, int id)
    {
        var sql = $"{SelectSql} WHERE l.id = @Id AND l.team_id = @TeamId";

        return await connection.QuerySingleOrDefaultAsync<LabelDto>(
            sql, new { Id = id, TeamId = CurrentTeamId });
    }
}
