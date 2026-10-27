using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Hubs;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// İşler.
///
/// Bütün sorgular token'daki ekiple sınırlı: başka bir ekibin işi hem
/// listelenmiyor hem de Id'si bilinse bile okunamıyor/düzenlenemiyor.
/// Ekip Id'si hiçbir zaman istekten okunmuyor.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TasksController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IHubContext<TaskHub> _hubContext;
    private readonly IActivityLogService _activityLog;
    private readonly ITaskNotificationService _notifications;
    private readonly IAttachmentStorage _attachments;

    public TasksController(
        IDbConnectionFactory connectionFactory,
        IHubContext<TaskHub> hubContext,
        IActivityLogService activityLog,
        ITaskNotificationService notifications,
        IAttachmentStorage attachments)
    {
        _connectionFactory = connectionFactory;
        _hubContext = hubContext;
        _activityLog = activityLog;
        _notifications = notifications;
        _attachments = attachments;
    }

    // Sütun eşlemesi her sorguda tekrarlanmasın diye tek yerde.
    private const string TaskColumns = """
        id                AS Id,
        title             AS Title,
        description       AS Description,
        status            AS Status,
        priority          AS Priority,
        due_date          AS DueDate,
        assigned_user_id  AS AssignedUserId,
        created_by        AS CreatedByUserId,
        team_id           AS TeamId,
        created_at        AS CreatedAt,
        started_at        AS StartedAt,
        completed_at      AS CompletedAt,
        -- Kontrol listesi sayaçları kartta rozet olarak görünüyor. Korelasyonlu
        -- alt sorgu: FROM tarafına dokunmadığı için bu sabit, hem liste hem
        -- tekil sorguda olduğu gibi kullanılabiliyor.
        (SELECT COUNT(*)::int FROM task_checklist_items c
          WHERE c.task_id = tasks.id) AS ChecklistTotal,
        (SELECT COUNT(*)::int FROM task_checklist_items c
          WHERE c.task_id = tasks.id AND c.is_done) AS ChecklistDone,
        -- Etiket id'leri dizi olarak geliyor; Npgsql int[] tipini doğrudan
        -- eşliyor, ayrı bir sorgu ya da JSON ayrıştırma gerekmiyor.
        (SELECT COALESCE(array_agg(tl.label_id ORDER BY tl.label_id), ARRAY[]::int[])
           FROM task_labels tl WHERE tl.task_id = tasks.id) AS LabelIds
        """;

    // GET api/tasks
    // GET api/tasks?status=Open
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TaskItem>>> GetAll([FromQuery] TaskItemStatus? status)
    {
        using var connection = _connectionFactory.CreateConnection();

        var sql = $"SELECT {TaskColumns} FROM tasks WHERE team_id = @TeamId";
        if (status.HasValue)
            sql += " AND status = @Status";

        var tasks = await connection.QueryAsync<TaskItem>(
            sql, new { Status = status, TeamId = CurrentTeamId });

        return Ok(tasks);
    }

    // GET api/tasks/5
    [HttpGet("{id:int}")]
    public async Task<ActionResult<TaskItem>> GetById(int id)
    {
        using var connection = _connectionFactory.CreateConnection();

        var task = await LoadTaskAsync(connection, id, CurrentTeamId);

        if (task is null)
            return NotFound();

        return Ok(task);
    }

    // GET api/tasks/5/activity
    // Tek bir işin geçmişi - iş ayrıntısında "bu işte neler oldu" listesi.
    [HttpGet("{id:int}/activity")]
    public async Task<ActionResult<IEnumerable<ActivityEntryDto>>> GetActivity(int id)
    {
        using var connection = _connectionFactory.CreateConnection();

        // Başka ekibin işinin geçmişi Id tahmin edilerek okunamasın.
        var task = await LoadTaskAsync(connection, id, CurrentTeamId);
        if (task is null)
            return NotFound();

        var entries = await _activityLog.GetRecentAsync(
            connection, CurrentTeamId, take: 100, taskId: id);

        return Ok(entries);
    }

    // POST api/tasks
    [HttpPost]
    public async Task<ActionResult<TaskItem>> Create(CreateTaskRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = """
            INSERT INTO tasks
                (title, description, status, priority, due_date, created_by, team_id, created_at)
            VALUES
                (@Title, @Description, @Status, @Priority, @DueDate, @CreatedBy, @TeamId, @CreatedAt)
            RETURNING id
            """;

        var newId = await connection.QuerySingleAsync<int>(sql, new
        {
            request.Title,
            request.Description,
            Status = TaskItemStatus.Open,
            request.Priority,
            request.DueDate,
            // Oluşturan kişi istekten değil, token'dan okunuyor - istemci
            // başkasının adına iş açamasın. Ekip de aynı sebeple token'dan.
            CreatedBy = CurrentUserId,
            TeamId = CurrentTeamId,
            CreatedAt = DateTime.UtcNow,
        });

        var created = await LoadTaskAsync(connection, newId, CurrentTeamId);

        await BroadcastAsync("TaskCreated", created);
        await RecordAsync(connection, ActivityAction.TaskCreated, created);

        return CreatedAtAction(nameof(GetById), new { id = newId }, created);
    }

    // PUT api/tasks/5
    // Yalnızca içerik alanları; durum ve atama ayrı uç noktalardan yönetiliyor.
    [HttpPut("{id:int}")]
    public async Task<ActionResult<TaskItem>> Update(int id, UpdateTaskRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();

        // Neyin değiştiğini geçmişe yazabilmek için önceki hali lazım.
        var previous = await LoadTaskAsync(connection, id, CurrentTeamId);
        if (previous is null)
            return NotFound();

        const string sql = """
            UPDATE tasks
            SET title = @Title,
                description = @Description,
                priority = @Priority,
                due_date = @DueDate,
                -- Teslim tarihi değiştiyse hatırlatma zinciri baştan başlar.
                -- CASE'in sağ tarafı SET uygulanmadan ÖNCEKİ due_date'i görüyor,
                -- yani karşılaştırma eski ile yeni arasında yapılıyor.
                reminder_stage = CASE WHEN due_date IS DISTINCT FROM @DueDate
                                      THEN 0 ELSE reminder_stage END
            WHERE id = @Id AND team_id = @TeamId
            """;

        var affectedRows = await connection.ExecuteAsync(sql, new
        {
            Id = id,
            TeamId = CurrentTeamId,
            request.Title,
            request.Description,
            request.Priority,
            request.DueDate,
        });

        if (affectedRows == 0)
            return NotFound();

        var updated = await LoadTaskAsync(connection, id, CurrentTeamId);
        await BroadcastAsync("TaskUpdated", updated);

        // Gerçekten bir şey değiştiyse kaydet; "kaydet"e basıp hiçbir alanı
        // değiştirmemek geçmişi kirletmesin.
        var changes = DescribeChanges(previous, updated);
        if (changes is not null)
            await RecordAsync(connection, ActivityAction.TaskUpdated, updated, details: changes);

        return Ok(updated);
    }

    // PUT api/tasks/5/assign?userId=3
    // "Boştaki işi üstlen" akışı. Aynı işi iki kişi aynı anda almaya
    // çalışırsa WHERE'deki "status hala Open mı" kontrolü ikinciyi eler.
    [HttpPut("{id:int}/assign")]
    public async Task<IActionResult> AssignToSelf(int id, [FromQuery] int userId)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await IsTeammateAsync(connection, userId, CurrentTeamId))
            return BadRequest("Böyle bir kullanıcı yok.");

        // İş havuzdan çıktığı an başlangıç saati de işleniyor.
        const string sql = """
            UPDATE tasks
            SET status = @NewStatus,
                assigned_user_id = @UserId,
                started_at = @Now,
                -- İş el değiştirdi: yeni sahibi kendi hatırlatmasını alsın.
                reminder_stage = 0
            WHERE id = @Id AND team_id = @TeamId AND status = @OpenStatus
            """;

        var affectedRows = await connection.ExecuteAsync(sql, new
        {
            Id = id,
            TeamId = CurrentTeamId,
            UserId = userId,
            NewStatus = TaskItemStatus.Taken,
            OpenStatus = TaskItemStatus.Open,
            Now = DateTime.UtcNow,
        });

        if (affectedRows == 0)
            return Conflict("Bu iş zaten alınmış ya da bulunamadı.");

        var task = await LoadTaskAsync(connection, id, CurrentTeamId);
        await BroadcastAsync("TaskAssigned", task);

        // Kişi işi kendi mi üstlendi, yoksa başkası adına mı alındı?
        var action = userId == CurrentUserId
            ? ActivityAction.TaskClaimed
            : ActivityAction.TaskAssigned;

        await RecordAsync(connection, action, task,
            targetUserId: action == ActivityAction.TaskAssigned ? userId : null);

        // İş başkasına atandıysa o kişiye haber gidiyor. Servis kendine
        // atamayı ve bildirimi kapatmış kullanıcıyı kendisi eliyor.
        if (task is not null)
            await _notifications.NotifyAssignedAsync(connection, task, userId, CurrentUserId);

        return NoContent();
    }

    // PUT api/tasks/5/assignee?userId=3
    // Doğrudan atama: işi başka birine devretmek için. /assign'dan farkı,
    // işin durumuna bakmaması - bilinçli bir devir işlemi olduğu için
    // yarış korumasına gerek yok.
    [HttpPut("{id:int}/assignee")]
    public async Task<IActionResult> SetAssignee(int id, [FromQuery] int userId)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await IsTeammateAsync(connection, userId, CurrentTeamId))
            return BadRequest("Böyle bir kullanıcı yok.");

        // Boştaki bir iş birine atandığında otomatik olarak "Alınmış" olur;
        // tamamlanmış bir işin durumu ise atama yüzünden geri alınmaz.
        //
        // started_at yalnızca henüz yoksa doldurulur: devam eden bir iş
        // başkasına devredildiğinde işin başlangıcı değişmemeli.
        const string sql = """
            UPDATE tasks
            SET assigned_user_id = @UserId,
                status = CASE WHEN status = @OpenStatus THEN @TakenStatus ELSE status END,
                started_at = COALESCE(started_at, @Now),
                -- İş el değiştirdi: yeni sahibi kendi hatırlatmasını alsın.
                reminder_stage = 0
            WHERE id = @Id AND team_id = @TeamId
            """;

        var affectedRows = await connection.ExecuteAsync(sql, new
        {
            Id = id,
            TeamId = CurrentTeamId,
            UserId = userId,
            OpenStatus = TaskItemStatus.Open,
            TakenStatus = TaskItemStatus.Taken,
            Now = DateTime.UtcNow,
        });

        if (affectedRows == 0)
            return NotFound();

        var task = await LoadTaskAsync(connection, id, CurrentTeamId);
        await BroadcastAsync("TaskAssigned", task);

        var action = userId == CurrentUserId
            ? ActivityAction.TaskClaimed
            : ActivityAction.TaskAssigned;

        await RecordAsync(connection, action, task,
            targetUserId: action == ActivityAction.TaskAssigned ? userId : null);

        // İş başkasına atandıysa o kişiye haber gidiyor. Servis kendine
        // atamayı ve bildirimi kapatmış kullanıcıyı kendisi eliyor.
        if (task is not null)
            await _notifications.NotifyAssignedAsync(connection, task, userId, CurrentUserId);

        return NoContent();
    }

    // DELETE api/tasks/5/assignee
    // Atamayı kaldırır ve işi tekrar havuza (Boşta) döndürür.
    [HttpDelete("{id:int}/assignee")]
    public async Task<IActionResult> RemoveAssignee(int id)
    {
        using var connection = _connectionFactory.CreateConnection();

        // İş havuza dönüyor: başlangıç ve bitiş saatleri de sıfırlanır,
        // bir sonraki üstlenen için baştan sayılsın.
        const string sql = """
            UPDATE tasks
            SET assigned_user_id = NULL,
                status = @OpenStatus,
                started_at = NULL,
                completed_at = NULL,
                -- Havuza dönen işin hatırlatması da sıfırlanıyor.
                reminder_stage = 0
            WHERE id = @Id AND team_id = @TeamId
            """;

        var affectedRows = await connection.ExecuteAsync(sql, new
        {
            Id = id,
            TeamId = CurrentTeamId,
            OpenStatus = TaskItemStatus.Open,
        });

        if (affectedRows == 0)
            return NotFound();

        var task = await LoadTaskAsync(connection, id, CurrentTeamId);
        await BroadcastAsync("TaskAssigned", task);
        await RecordAsync(connection, ActivityAction.TaskReleased, task);

        return NoContent();
    }

    // PUT api/tasks/5/status?status=Completed
    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromQuery] TaskItemStatus status)
    {
        using var connection = _connectionFactory.CreateConnection();

        // Hangi geçişin yapıldığını (tamamlandı mı, yeniden mi açıldı)
        // anlamak için önceki durum lazım.
        var previous = await LoadTaskAsync(connection, id, CurrentTeamId);
        if (previous is null)
            return NotFound();

        // Üç kural burada birlikte uygulanıyor:
        //  - İş "Boşta"ya çekilirse üzerindeki atama da kalkar; aksi halde
        //    kart havuzda görünürken hala birine atanmış olurdu.
        //  - started_at havuzda null'lanır, havuzdan çıkarken doldurulur;
        //    zaten doluysa korunur (tamamlanan işin başlangıcı kaybolmasın).
        //  - completed_at yalnızca iş tamamlandığında dolu kalır; iş yeniden
        //    açıldığında eski tamamlanma tarihi silinir.
        const string sql = """
            UPDATE tasks
            SET status = @Status,
                assigned_user_id = CASE WHEN @Status = @OpenStatus
                                        THEN NULL ELSE assigned_user_id END,
                started_at = CASE WHEN @Status = @OpenStatus
                                  THEN NULL ELSE COALESCE(started_at, @Now) END,
                completed_at = CASE WHEN @Status = @CompletedStatus
                                    THEN @Now ELSE NULL END,
                reminder_stage = CASE WHEN @Status = @OpenStatus
                                      THEN 0 ELSE reminder_stage END
            WHERE id = @Id AND team_id = @TeamId
            """;

        var affectedRows = await connection.ExecuteAsync(sql, new
        {
            Id = id,
            TeamId = CurrentTeamId,
            Status = status,
            OpenStatus = TaskItemStatus.Open,
            CompletedStatus = TaskItemStatus.Completed,
            Now = DateTime.UtcNow,
        });

        if (affectedRows == 0)
            return NotFound();

        var task = await LoadTaskAsync(connection, id, CurrentTeamId);
        await BroadcastAsync("TaskStatusChanged", task);

        if (previous.Status != status)
            await RecordAsync(connection, DescribeTransition(previous.Status, status), task);

        return NoContent();
    }

    // PUT api/tasks/5/labels
    /// <summary>
    /// İşin etiketlerini verilen listeyle değiştirir.
    ///
    /// Tek tek ekle/çıkar yerine tam liste alınıyor: arayüzde birden fazla
    /// kutu aynı anda işaretlenebiliyor.
    /// </summary>
    [HttpPut("{id:int}/labels")]
    public async Task<ActionResult<TaskItem>> SetLabels(int id, SetTaskLabelsRequest request)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        var existing = await LoadTaskAsync(connection, id, CurrentTeamId);
        if (existing is null)
            return NotFound();

        // Yalnızca kendi ekibinin etiketleri takılabilsin: istemciden gelen
        // id'ler doğrudan yazılsaydı başka ekibin etiketi bu işe bağlanabilirdi.
        const string validSql = """
            SELECT id FROM labels
            WHERE team_id = @TeamId AND id = ANY(@LabelIds)
            """;

        var validIds = (await connection.QueryAsync<int>(validSql, new
        {
            TeamId = CurrentTeamId,
            LabelIds = request.LabelIds.Distinct().ToArray(),
        })).ToArray();

        using var transaction = connection.BeginTransaction();

        await connection.ExecuteAsync(
            "DELETE FROM task_labels WHERE task_id = @TaskId",
            new { TaskId = id },
            transaction);

        if (validIds.Length > 0)
        {
            await connection.ExecuteAsync(
                "INSERT INTO task_labels (task_id, label_id) VALUES (@TaskId, @LabelId)",
                validIds.Select(labelId => new { TaskId = id, LabelId = labelId }),
                transaction);
        }

        transaction.Commit();

        var updated = await LoadTaskAsync(connection, id, CurrentTeamId);

        await BroadcastAsync("TaskUpdated", updated);

        return Ok(updated);
    }

    // DELETE api/tasks/5
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        using var connection = _connectionFactory.CreateConnection();

        // Silmeden önce yüklüyoruz: hem yetki kontrolü için hem de geçmiş
        // kaydında işin başlığı görünsün diye.
        var task = await LoadTaskAsync(connection, id, CurrentTeamId);
        if (task is null)
            return NotFound();

        if (!CanDelete(task))
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                "Bu işi yalnızca oluşturan kişi ya da ekip sahibi silebilir.");
        }

        // Ek kayıtları ON DELETE CASCADE ile gidiyor ama diskteki dosyalar
        // gitmiyor; adlarını silmeden önce alıyoruz.
        var storedNames = (await connection.QueryAsync<string>(
            "SELECT stored_name FROM task_attachments WHERE task_id = @Id",
            new { Id = id })).ToList();

        const string sql = "DELETE FROM tasks WHERE id = @Id AND team_id = @TeamId";
        var affectedRows = await connection.ExecuteAsync(
            sql, new { Id = id, TeamId = CurrentTeamId });

        if (affectedRows == 0)
            return NotFound();

        foreach (var storedName in storedNames)
            _attachments.Delete(storedName);

        await _hubContext.Clients
            .Group(TaskHub.TeamGroup(CurrentTeamId))
            .SendAsync("TaskDeleted", id);

        await RecordAsync(connection, ActivityAction.TaskDeleted, task);

        return NoContent();
    }

    // --- Yardımcılar --------------------------------------------------------

    /// <summary>Token içindeki kullanıcı Id'si.</summary>
    private int CurrentUserId => User.GetUserId();

    /// <summary>
    /// Token içindeki ekip Id'si. Ekipsiz bir token'da 0 kalır ve bütün
    /// sorgular boş sonuç döner - başka bir ekibin verisine düşmez.
    /// </summary>
    private int CurrentTeamId => User.GetTeamId();

    /// <summary>
    /// Geçmiş kaydında kullanılacak kullanıcı Id'si. Token'da geçerli bir
    /// kimlik yoksa null yazılır - 0 foreign key'i ihlal ederdi.
    /// </summary>
    private int? ActorUserId => CurrentUserId > 0 ? CurrentUserId : null;

    /// <summary>
    /// İşi silme yetkisi: işi açan kişi ya da ekip sahibi.
    ///
    /// Ortak havuzdaki bir işi ekipteki herkesin silebilmesi, kazara veri
    /// kaybının en kolay yoluydu. Diğer işlemler (üstlenme, atama, durum
    /// değiştirme) geri alınabilir olduğu için herkese açık kalıyor.
    ///
    /// created_by sütunu sonradan eklendiği için eski kayıtlarda null
    /// olabiliyor; o işleri yalnızca ekip sahibi silebilir.
    /// </summary>
    private bool CanDelete(TaskItem task) =>
        User.IsOwner() ||
        (task.CreatedByUserId is int creatorId && creatorId == CurrentUserId);

    private static async Task<TaskItem?> LoadTaskAsync(IDbConnection connection, int id, int teamId)
    {
        var sql = $"SELECT {TaskColumns} FROM tasks WHERE id = @Id AND team_id = @TeamId";
        return await connection.QuerySingleOrDefaultAsync<TaskItem>(
            sql, new { Id = id, TeamId = teamId });
    }

    /// <summary>
    /// Atama hedefi aynı ekipte mi? Sadece "kullanıcı var mı" diye bakmak
    /// yetmez: başka ekipten birine iş atanabilirdi.
    /// </summary>
    private static async Task<bool> IsTeammateAsync(IDbConnection connection, int userId, int teamId)
    {
        const string sql = "SELECT COUNT(1) FROM users WHERE id = @UserId AND team_id = @TeamId";
        return await connection.QuerySingleAsync<int>(
            sql, new { UserId = userId, TeamId = teamId }) > 0;
    }

    /// <summary>
    /// Değişikliği ekibin bağlı olan üyelerine duyurur. Her olayda işin
    /// tamamı gönderiliyor; istemci parça parça birleştirmek yerine kaydı
    /// doğrudan değiştirebiliyor.
    /// </summary>
    private async Task BroadcastAsync(string eventName, TaskItem? task)
    {
        if (task is null) return;

        await _hubContext.Clients
            .Group(TaskHub.TeamGroup(CurrentTeamId))
            .SendAsync(eventName, task);
    }

    /// <summary>
    /// İşlem geçmişine yazar ve yeni kaydı ekibin istemcilerine duyurur,
    /// böylece geçmiş ekranı yenilenmeden güncelleniyor.
    ///
    /// Geçmiş kaydı yan bir kayıt: burada oluşan bir hata asıl işlemi geri
    /// almamalı, bu yüzden istisna yutuluyor.
    /// </summary>
    private async Task RecordAsync(
        IDbConnection connection,
        ActivityAction action,
        TaskItem? task,
        int? targetUserId = null,
        string? details = null)
    {
        if (task is null) return;

        try
        {
            var entry = await _activityLog.RecordAsync(connection, new ActivityEntry
            {
                TaskId = task.Id,
                TaskTitle = task.Title,
                Action = action,
                ActorUserId = ActorUserId,
                TargetUserId = targetUserId,
                TeamId = CurrentTeamId,
                Details = details,
                CreatedAt = DateTime.UtcNow,
            });

            if (entry is not null)
            {
                await _hubContext.Clients
                    .Group(TaskHub.TeamGroup(CurrentTeamId))
                    .SendAsync("ActivityLogged", entry);
            }
        }
        catch (Exception)
        {
            // Geçmiş yazılamadıysa işlemin kendisi yine de başarılı sayılır.
        }
    }

    /// <summary>Durum geçişini geçmiş hareketine çevirir.</summary>
    private static ActivityAction DescribeTransition(TaskItemStatus from, TaskItemStatus to) =>
        to switch
        {
            TaskItemStatus.Completed => ActivityAction.TaskCompleted,
            TaskItemStatus.Open => ActivityAction.TaskReleased,
            // Tamamlanmış işin tekrar devam edenlere alınması "yeniden açma".
            TaskItemStatus.Taken when from == TaskItemStatus.Completed
                => ActivityAction.TaskReopened,
            _ => ActivityAction.TaskClaimed,
        };

    /// <summary>
    /// İçerik güncellemesinde hangi alanların değiştiğini kısa bir metne
    /// çevirir. Hiçbiri değişmediyse null döner.
    /// </summary>
    private static string? DescribeChanges(TaskItem before, TaskItem? after)
    {
        if (after is null) return null;

        var changes = new List<string>();

        if (before.Title != after.Title)
            changes.Add("başlık");

        if (before.Description != after.Description)
            changes.Add("açıklama");

        if (before.Priority != after.Priority)
            changes.Add($"öncelik ({PriorityLabel(before.Priority)} -> {PriorityLabel(after.Priority)})");

        if (before.DueDate != after.DueDate)
            changes.Add("teslim tarihi");

        return changes.Count == 0 ? null : string.Join(", ", changes);
    }

    private static string PriorityLabel(TaskPriority priority) => priority switch
    {
        TaskPriority.Low => "Düşük",
        TaskPriority.High => "Yüksek",
        _ => "Orta",
    };
}
