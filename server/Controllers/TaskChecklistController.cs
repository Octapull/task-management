using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Hubs;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// Bir işin kontrol listesi (alt görevler).
///
/// Yorumlarla aynı kalıp: ayrı kaynak, ayrı controller, her uçta önce işin
/// çağıranın ekibine ait olduğu doğrulanıyor.
///
/// Yetki kuralı yorumlardan farklı ve bilerek gevşek: adımlar işin ortak
/// yapılacaklar listesi, ekipten herkes işaretleyebilmeli.
/// </summary>
[ApiController]
[Route("api/tasks/{taskId:int}/checklist")]
[Authorize]
public class TaskChecklistController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IHubContext<TaskHub> _hubContext;

    public TaskChecklistController(
        IDbConnectionFactory connectionFactory,
        IHubContext<TaskHub> hubContext)
    {
        _connectionFactory = connectionFactory;
        _hubContext = hubContext;
    }

    private const string SelectSql = """
        SELECT
            id           AS Id,
            task_id      AS TaskId,
            title        AS Title,
            is_done      AS IsDone,
            position     AS Position,
            created_at   AS CreatedAt,
            completed_at AS CompletedAt
        FROM task_checklist_items
        """;

    // GET api/tasks/5/checklist
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ChecklistItemDto>>> GetAll(int taskId)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        return Ok(await LoadListAsync(connection, taskId, CurrentTeamId));
    }

    // POST api/tasks/5/checklist
    [HttpPost]
    public async Task<ActionResult<ChecklistItemDto>> Create(
        int taskId,
        SaveChecklistItemRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        // Yeni adım listenin sonuna ekleniyor. COALESCE gerekli: ilk adımda
        // MAX(position) NULL döner.
        const string insertSql = """
            INSERT INTO task_checklist_items (task_id, team_id, title, position, created_at)
            VALUES (
                @TaskId,
                @TeamId,
                @Title,
                COALESCE((SELECT MAX(position) + 1 FROM task_checklist_items WHERE task_id = @TaskId), 0),
                @CreatedAt
            )
            RETURNING id
            """;

        var newId = await connection.QuerySingleAsync<int>(insertSql, new
        {
            TaskId = taskId,
            TeamId = CurrentTeamId,
            Title = request.Title.Trim(),
            CreatedAt = DateTime.UtcNow,
        });

        var created = await LoadAsync(connection, newId);

        await BroadcastAsync(connection, taskId);

        return CreatedAtAction(nameof(GetAll), new { taskId }, created);
    }

    // PUT api/tasks/5/checklist/12
    /// <summary>Adımın başlığını ve/veya tamamlanma durumunu günceller.</summary>
    [HttpPut("{itemId:int}")]
    public async Task<ActionResult<ChecklistItemDto>> Update(
        int taskId,
        int itemId,
        SaveChecklistItemRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        // completed_at yalnızca "yapıldı" halinde dolu kalıyor; işaret geri
        // alındığında temizleniyor ki eski tarih yanıltmasın.
        const string sql = """
            UPDATE task_checklist_items
            SET title = @Title,
                is_done = @IsDone,
                completed_at = CASE WHEN @IsDone THEN COALESCE(completed_at, @Now) ELSE NULL END
            WHERE id = @Id AND task_id = @TaskId AND team_id = @TeamId
            """;

        var affectedRows = await connection.ExecuteAsync(sql, new
        {
            Id = itemId,
            TaskId = taskId,
            TeamId = CurrentTeamId,
            Title = request.Title.Trim(),
            request.IsDone,
            Now = DateTime.UtcNow,
        });

        if (affectedRows == 0)
            return NotFound();

        var updated = await LoadAsync(connection, itemId);

        await BroadcastAsync(connection, taskId);

        return Ok(updated);
    }

    // PUT api/tasks/5/checklist/order
    /// <summary>Adımların sırasını arayüzdeki hâliyle kaydeder.</summary>
    [HttpPut("order")]
    public async Task<ActionResult<IEnumerable<ChecklistItemDto>>> Reorder(
        int taskId,
        ReorderChecklistRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        using var transaction = connection.BeginTransaction();

        const string sql = """
            UPDATE task_checklist_items
            SET position = @Position
            WHERE id = @Id AND task_id = @TaskId AND team_id = @TeamId
            """;

        // Gelen dizideki sıra doğrudan position oluyor. Listede olmayan bir
        // id gönderilirse hiçbir satır etkilenmiyor - sessizce yok sayılıyor.
        for (var index = 0; index < request.ItemIds.Length; index++)
        {
            await connection.ExecuteAsync(sql, new
            {
                Id = request.ItemIds[index],
                Position = index,
                TaskId = taskId,
                TeamId = CurrentTeamId,
            }, transaction);
        }

        transaction.Commit();

        await BroadcastAsync(connection, taskId);

        return Ok(await LoadListAsync(connection, taskId, CurrentTeamId));
    }

    // DELETE api/tasks/5/checklist/12
    [HttpDelete("{itemId:int}")]
    public async Task<IActionResult> Delete(int taskId, int itemId)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        const string sql = """
            DELETE FROM task_checklist_items
            WHERE id = @Id AND task_id = @TaskId AND team_id = @TeamId
            """;

        var affectedRows = await connection.ExecuteAsync(
            sql, new { Id = itemId, TaskId = taskId, TeamId = CurrentTeamId });

        if (affectedRows == 0)
            return NotFound();

        await BroadcastAsync(connection, taskId);

        return NoContent();
    }

    // --- Yardımcılar --------------------------------------------------------

    private int CurrentTeamId => User.GetTeamId();

    private async Task<bool> TaskBelongsToTeamAsync(IDbConnection connection, int taskId)
    {
        const string sql =
            "SELECT COUNT(1) FROM tasks WHERE id = @TaskId AND team_id = @TeamId";

        return await connection.QuerySingleAsync<int>(
            sql, new { TaskId = taskId, TeamId = CurrentTeamId }) > 0;
    }

    private static async Task<ChecklistItemDto?> LoadAsync(IDbConnection connection, int id)
    {
        var sql = $"{SelectSql} WHERE id = @Id";

        return await connection.QuerySingleOrDefaultAsync<ChecklistItemDto>(sql, new { Id = id });
    }

    private static async Task<IEnumerable<ChecklistItemDto>> LoadListAsync(
        IDbConnection connection,
        int taskId,
        int teamId)
    {
        // id'ye göre ikincil sıralama: aynı position'a düşen adımların sırası
        // da kararlı olsun.
        var sql = $"""
            {SelectSql}
            WHERE task_id = @TaskId AND team_id = @TeamId
            ORDER BY position, id
            """;

        return await connection.QueryAsync<ChecklistItemDto>(
            sql, new { TaskId = taskId, TeamId = teamId });
    }

    /// <summary>
    /// Listenin tamamını yayınlar.
    ///
    /// Tek tek "eklendi/silindi" olayları yerine bütün liste gönderiliyor:
    /// sıralama değiştiğinde zaten hepsi etkileniyor ve istemcinin parça
    /// birleştirmesi gereksiz karmaşıklık olurdu.
    /// </summary>
    private async Task BroadcastAsync(IDbConnection connection, int taskId)
    {
        var items = await LoadListAsync(connection, taskId, CurrentTeamId);

        await _hubContext.Clients
            .Group(TaskHub.TeamGroup(CurrentTeamId))
            .SendAsync("ChecklistChanged", new { taskId, items });
    }
}
