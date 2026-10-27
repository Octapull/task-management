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
/// Bir işin yorumları.
///
/// TasksController'a eklenmedi çünkü orası zaten iş yaşam döngüsüyle dolu;
/// yorumlar ayrı bir kaynak ve kendi yetki kuralları var.
///
/// Bütün uçlar önce işin çağıranın ekibine ait olduğunu doğruluyor: ekip
/// izolasyonu yorum tarafında da geçerli.
/// </summary>
[ApiController]
[Route("api/tasks/{taskId:int}/comments")]
[Authorize]
public class TaskCommentsController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IHubContext<TaskHub> _hubContext;

    public TaskCommentsController(
        IDbConnectionFactory connectionFactory,
        IHubContext<TaskHub> hubContext)
    {
        _connectionFactory = connectionFactory;
        _hubContext = hubContext;
    }

    // Yazar adı join ile geliyor; LEFT JOIN çünkü kullanıcı silinmiş olabilir.
    private const string SelectSql = """
        SELECT
            c.id             AS Id,
            c.task_id        AS TaskId,
            c.author_user_id AS AuthorUserId,
            author.full_name AS AuthorName,
            c.body           AS Body,
            c.created_at     AS CreatedAt,
            c.edited_at      AS EditedAt
        FROM task_comments c
        LEFT JOIN users author ON author.id = c.author_user_id
        """;

    // GET api/tasks/5/comments
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TaskCommentDto>>> GetAll(int taskId)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        // Konuşma sırası: eskiden yeniye. Geçmiş ekranının tersi, çünkü orada
        // "en son ne oldu" önemli, burada konuşmanın akışı önemli.
        var sql = $"""
            {SelectSql}
            WHERE c.task_id = @TaskId AND c.team_id = @TeamId
            ORDER BY c.created_at, c.id
            """;

        var comments = await connection.QueryAsync<TaskCommentDto>(
            sql, new { TaskId = taskId, TeamId = CurrentTeamId });

        return Ok(comments);
    }

    // POST api/tasks/5/comments
    [HttpPost]
    public async Task<ActionResult<TaskCommentDto>> Create(
        int taskId,
        SaveCommentRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        const string insertSql = """
            INSERT INTO task_comments
                (task_id, team_id, author_user_id, body, created_at)
            VALUES
                (@TaskId, @TeamId, @AuthorUserId, @Body, @CreatedAt)
            RETURNING id
            """;

        var newId = await connection.QuerySingleAsync<int>(insertSql, new
        {
            TaskId = taskId,
            TeamId = CurrentTeamId,
            // Yazar istekten değil token'dan okunuyor - kimse başkasının
            // adına yorum yazamasın.
            AuthorUserId = ActorUserId,
            Body = request.Body.Trim(),
            CreatedAt = DateTime.UtcNow,
        });

        var created = await LoadAsync(connection, newId);

        await BroadcastAsync("CommentAdded", created);

        return CreatedAtAction(nameof(GetAll), new { taskId }, created);
    }

    // PUT api/tasks/5/comments/12
    /// <summary>Yorumu düzenler. Yalnızca yazarı düzenleyebilir.</summary>
    [HttpPut("{commentId:int}")]
    public async Task<ActionResult<TaskCommentDto>> Update(
        int taskId,
        int commentId,
        SaveCommentRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        var existing = await LoadAsync(connection, commentId);

        if (existing is null || existing.TaskId != taskId)
            return NotFound();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        // Başkasının sözünü değiştirmek, silmekten daha kötü: silinen belli
        // olur, değiştirilen olmaz. Bu yüzden ekip sahibine bile izin yok.
        if (existing.AuthorUserId != CurrentUserId)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                "Yalnızca kendi yorumunu düzenleyebilirsin.");
        }

        const string sql = """
            UPDATE task_comments
            SET body = @Body, edited_at = @EditedAt
            WHERE id = @Id AND team_id = @TeamId
            """;

        await connection.ExecuteAsync(sql, new
        {
            Id = commentId,
            TeamId = CurrentTeamId,
            Body = request.Body.Trim(),
            EditedAt = DateTime.UtcNow,
        });

        var updated = await LoadAsync(connection, commentId);

        await BroadcastAsync("CommentUpdated", updated);

        return Ok(updated);
    }

    // DELETE api/tasks/5/comments/12
    /// <summary>Yorumu siler. Yazarı ya da ekip sahibi silebilir.</summary>
    [HttpDelete("{commentId:int}")]
    public async Task<IActionResult> Delete(int taskId, int commentId)
    {
        using var connection = _connectionFactory.CreateConnection();

        var existing = await LoadAsync(connection, commentId);

        if (existing is null || existing.TaskId != taskId)
            return NotFound();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        // Silme yetkisi düzenlemeden geniş: uygunsuz bir yorumu ekip sahibi
        // de kaldırabilmeli.
        if (existing.AuthorUserId != CurrentUserId && !User.IsOwner())
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                "Bu yorumu yalnızca yazarı ya da ekip sahibi silebilir.");
        }

        const string sql =
            "DELETE FROM task_comments WHERE id = @Id AND team_id = @TeamId";

        var affectedRows = await connection.ExecuteAsync(
            sql, new { Id = commentId, TeamId = CurrentTeamId });

        if (affectedRows == 0)
            return NotFound();

        await _hubContext.Clients
            .Group(TaskHub.TeamGroup(CurrentTeamId))
            .SendAsync("CommentDeleted", new { taskId, commentId });

        return NoContent();
    }

    // --- Yardımcılar --------------------------------------------------------

    private int CurrentUserId => User.GetUserId();

    private int CurrentTeamId => User.GetTeamId();

    /// <summary>
    /// Geçmiş kaydındaki mantığın aynısı: token'da geçerli kimlik yoksa null
    /// yazılır, 0 foreign key'i ihlal ederdi.
    /// </summary>
    private int? ActorUserId => CurrentUserId > 0 ? CurrentUserId : null;

    /// <summary>
    /// İş çağıranın ekibine mi ait? Değilse (ya da hiç yoksa) 404 dönüyoruz -
    /// "var ama senin değil" demek başka ekiplerin iş id'lerini sızdırırdı.
    /// </summary>
    private async Task<bool> TaskBelongsToTeamAsync(IDbConnection connection, int taskId)
    {
        const string sql =
            "SELECT COUNT(1) FROM tasks WHERE id = @TaskId AND team_id = @TeamId";

        return await connection.QuerySingleAsync<int>(
            sql, new { TaskId = taskId, TeamId = CurrentTeamId }) > 0;
    }

    private static async Task<TaskCommentDto?> LoadAsync(IDbConnection connection, int id)
    {
        var sql = $"{SelectSql} WHERE c.id = @Id";

        return await connection.QuerySingleOrDefaultAsync<TaskCommentDto>(sql, new { Id = id });
    }

    private async Task BroadcastAsync(string eventName, TaskCommentDto? comment)
    {
        if (comment is null) return;

        await _hubContext.Clients
            .Group(TaskHub.TeamGroup(CurrentTeamId))
            .SendAsync(eventName, comment);
    }
}
