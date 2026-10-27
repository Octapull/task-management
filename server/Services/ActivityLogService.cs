using System.Data;
using Dapper;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

/// <inheritdoc />
public class ActivityLogService : IActivityLogService
{
    // Okuma tarafında kullanıcı adları join ile geliyor. LEFT JOIN kullanılıyor
    // çünkü actor_user_id NULL olabilir (eski kayıtlar) ve target yalnızca
    // devir işlemlerinde dolu.
    private const string SelectSql = """
        SELECT
            a.id             AS Id,
            a.task_id        AS TaskId,
            a.task_title     AS TaskTitle,
            a.action         AS Action,
            a.actor_user_id  AS ActorUserId,
            actor.full_name  AS ActorName,
            a.target_user_id AS TargetUserId,
            target.full_name AS TargetName,
            a.details        AS Details,
            a.created_at     AS CreatedAt
        FROM activity_log a
        LEFT JOIN users actor  ON actor.id  = a.actor_user_id
        LEFT JOIN users target ON target.id = a.target_user_id
        """;

    public async Task<ActivityEntryDto?> RecordAsync(
        IDbConnection connection,
        ActivityEntry entry)
    {
        const string insertSql = """
            INSERT INTO activity_log
                (task_id, task_title, action, actor_user_id, target_user_id, team_id, details, created_at)
            VALUES
                (@TaskId, @TaskTitle, @Action, @ActorUserId, @TargetUserId, @TeamId, @Details, @CreatedAt)
            RETURNING id
            """;

        var newId = await connection.QuerySingleAsync<int>(insertSql, new
        {
            entry.TaskId,
            // Başlık sütunu 200 karakter; daha uzunu gelirse insert patlamasın.
            TaskTitle = Truncate(entry.TaskTitle, 200),
            Action = (short)entry.Action,
            entry.ActorUserId,
            entry.TargetUserId,
            // 0 geçerli bir ekip değil; foreign key'i ihlal etmemek için null.
            TeamId = entry.TeamId is > 0 ? entry.TeamId : null,
            Details = Truncate(entry.Details, 300),
            CreatedAt = entry.CreatedAt == default ? DateTime.UtcNow : entry.CreatedAt,
        });

        var sql = $"{SelectSql} WHERE a.id = @Id";
        return await connection.QuerySingleOrDefaultAsync<ActivityEntryDto>(sql, new { Id = newId });
    }

    public async Task<PagedResult<ActivityEntryDto>> GetPagedAsync(
        IDbConnection connection,
        int teamId,
        int skip,
        int take)
    {
        // Toplam ve sayfa tek gidiş dönüşte alınıyor; ikinci bir bağlantı
        // turu için ekranda gösterilecek bir şey yok.
        //
        // COUNT(*) PostgreSQL'de bigint döner; ::int olmadan Dapper'ın int
        // okuması tip uyuşmazlığına düşer.
        var sql = $"""
            SELECT COUNT(*)::int
            FROM activity_log a
            WHERE a.team_id = @TeamId;

            {SelectSql}
            WHERE a.team_id = @TeamId
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT @Take OFFSET @Skip;
            """;

        using var results = await connection.QueryMultipleAsync(
            sql, new { TeamId = teamId, Take = take, Skip = skip });

        var total = await results.ReadSingleAsync<int>();
        var items = (await results.ReadAsync<ActivityEntryDto>()).ToList();

        return new PagedResult<ActivityEntryDto>
        {
            Items = items,
            Total = total,
            Skip = skip,
            Take = take,
        };
    }

    public async Task<IEnumerable<ActivityEntryDto>> GetRecentAsync(
        IDbConnection connection,
        int teamId,
        int take,
        int? taskId = null)
    {
        // Ekip filtresi her zaman var; iş filtresi isteğe bağlı olarak
        // üstüne biniyor.
        var filter = " WHERE a.team_id = @TeamId";
        if (taskId.HasValue)
            filter += " AND a.task_id = @TaskId";

        // id'ye göre ikincil sıralama: aynı saniyede yazılan kayıtların sırası
        // da kararlı olsun (created_at tek başına eşit çıkabiliyor).
        var sql = $"""
            {SelectSql}{filter}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT @Take
            """;

        return await connection.QueryAsync<ActivityEntryDto>(
            sql, new { Take = take, TaskId = taskId, TeamId = teamId });
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return value;

        return value.Length <= maxLength ? value : value[..maxLength];
    }
}
