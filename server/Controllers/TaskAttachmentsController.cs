using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagementSystem.Data;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Controllers;

/// <summary>
/// Bir işin dosya ekleri.
///
/// Güvenlik açısından üç kural burada belirleyici:
///  - istemcinin verdiği dosya adı diske asla yazılmıyor (bkz. AttachmentStorage),
///  - indirme her zaman "attachment" olarak sunuluyor, yani tarayıcı dosyayı
///    çalıştırmıyor - aksi halde yüklenen bir HTML/SVG dosyası uygulamanın
///    kendi adresinde script çalıştırabilirdi,
///  - dosyalar wwwroot dışında duruyor, yani yalnızca bu uçtan ve ekip
///    kontrolünden geçerek erişilebiliyor.
/// </summary>
[ApiController]
[Route("api/tasks/{taskId:int}/attachments")]
[Authorize]
public class TaskAttachmentsController : ControllerBase
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IAttachmentStorage _storage;

    public TaskAttachmentsController(
        IDbConnectionFactory connectionFactory,
        IAttachmentStorage storage)
    {
        _connectionFactory = connectionFactory;
        _storage = storage;
    }

    /// <summary>
    /// Tarayıcının kendi tipiyle sunulmasına izin verilen içerikler.
    ///
    /// Liste dışındaki her şey application/octet-stream olarak gidiyor.
    /// "attachment" başlığıyla birlikte bu ikinci bir güvenlik katmanı:
    /// biri kaçarsa diğeri tutuyor.
    /// </summary>
    private static readonly HashSet<string> SafeContentTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "image/png", "image/jpeg", "image/gif", "image/webp",
            "application/pdf", "text/plain", "text/csv",
        };

    private const string SelectSql = """
        SELECT
            a.id            AS Id,
            a.task_id       AS TaskId,
            a.file_name     AS FileName,
            a.content_type  AS ContentType,
            a.size_bytes    AS SizeBytes,
            a.uploaded_by   AS UploadedByUserId,
            u.full_name     AS UploadedByName,
            a.created_at    AS CreatedAt
        FROM task_attachments a
        LEFT JOIN users u ON u.id = a.uploaded_by
        """;

    // GET api/tasks/5/attachments
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AttachmentDto>>> GetAll(int taskId)
    {
        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        var sql = $"""
            {SelectSql}
            WHERE a.task_id = @TaskId AND a.team_id = @TeamId
            ORDER BY a.created_at, a.id
            """;

        return Ok(await connection.QueryAsync<AttachmentDto>(
            sql, new { TaskId = taskId, TeamId = CurrentTeamId }));
    }

    // POST api/tasks/5/attachments
    [HttpPost]
    public async Task<ActionResult<AttachmentDto>> Upload(
        int taskId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
            return BadRequest("Dosya boş.");

        if (file.Length > _storage.MaxFileSizeBytes)
        {
            var limitMb = _storage.MaxFileSizeBytes / (1024 * 1024);
            return BadRequest($"Dosya çok büyük. Üst sınır {limitMb} MB.");
        }

        using var connection = _connectionFactory.CreateConnection();

        if (!await TaskBelongsToTeamAsync(connection, taskId))
            return NotFound();

        await using var source = file.OpenReadStream();
        var storedName = await _storage.SaveAsync(source, cancellationToken);

        const string insertSql = """
            INSERT INTO task_attachments
                (task_id, team_id, uploaded_by, file_name, stored_name,
                 content_type, size_bytes, created_at)
            VALUES
                (@TaskId, @TeamId, @UploadedBy, @FileName, @StoredName,
                 @ContentType, @SizeBytes, @CreatedAt)
            RETURNING id
            """;

        try
        {
            var newId = await connection.QuerySingleAsync<int>(insertSql, new
            {
                TaskId = taskId,
                TeamId = CurrentTeamId,
                UploadedBy = ActorUserId,
                // Yalnızca dosya adı kısmı saklanıyor: istemci "C:\..." ya da
                // "../../gizli" gönderebilir ve bu metin ekranda gösteriliyor.
                // GetFileName boş dönebilir (ör. istemci yalnızca yol yolladı);
                // sütun NOT NULL olduğu için bir yedek ad koyuyoruz.
                FileName = Truncate(
                    string.IsNullOrWhiteSpace(Path.GetFileName(file.FileName))
                        ? "dosya"
                        : Path.GetFileName(file.FileName),
                    255),
                StoredName = storedName,
                ContentType = Truncate(file.ContentType, 150)
                    ?? "application/octet-stream",
                SizeBytes = file.Length,
                CreatedAt = DateTime.UtcNow,
            });

            return Ok(await LoadAsync(connection, newId));
        }
        catch
        {
            // Kayıt yazılamadıysa diskteki dosya öksüz kalmasın.
            _storage.Delete(storedName);
            throw;
        }
    }

    // GET api/tasks/5/attachments/12/download
    [HttpGet("{attachmentId:int}/download")]
    public async Task<IActionResult> Download(int taskId, int attachmentId)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = """
            SELECT file_name AS FileName, stored_name AS StoredName,
                   content_type AS ContentType
            FROM task_attachments
            WHERE id = @Id AND task_id = @TaskId AND team_id = @TeamId
            """;

        var row = await connection.QuerySingleOrDefaultAsync<FileRow>(sql, new
        {
            Id = attachmentId,
            TaskId = taskId,
            TeamId = CurrentTeamId,
        });

        if (row is null)
            return NotFound();

        var stream = _storage.OpenRead(row.StoredName);
        if (stream is null)
            return NotFound("Dosya diskte bulunamadı.");

        // Tarayıcının içerikle bir şey yapmasını istemiyoruz: her zaman indir.
        var contentType = SafeContentTypes.Contains(row.ContentType)
            ? row.ContentType
            : "application/octet-stream";

        return File(stream, contentType, row.FileName);
    }

    // DELETE api/tasks/5/attachments/12
    /// <summary>Eki siler. Yükleyen kişi ya da ekip sahibi silebilir.</summary>
    [HttpDelete("{attachmentId:int}")]
    public async Task<IActionResult> Delete(int taskId, int attachmentId)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string selectSql = """
            SELECT stored_name AS StoredName, uploaded_by AS UploadedBy
            FROM task_attachments
            WHERE id = @Id AND task_id = @TaskId AND team_id = @TeamId
            """;

        var row = await connection.QuerySingleOrDefaultAsync<DeleteRow>(sql: selectSql, param: new
        {
            Id = attachmentId,
            TaskId = taskId,
            TeamId = CurrentTeamId,
        });

        if (row is null)
            return NotFound();

        if (row.UploadedBy != CurrentUserId && !User.IsOwner())
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                "Bu dosyayı yalnızca yükleyen kişi ya da ekip sahibi silebilir.");
        }

        await connection.ExecuteAsync(
            "DELETE FROM task_attachments WHERE id = @Id",
            new { Id = attachmentId });

        // Önce kayıt, sonra dosya: ters sırada olsaydı silme yarıda kalınca
        // ekranda indirilemeyen bir satır kalırdı.
        _storage.Delete(row.StoredName);

        return NoContent();
    }

    // --- Yardımcılar --------------------------------------------------------

    private int CurrentUserId => User.GetUserId();

    private int CurrentTeamId => User.GetTeamId();

    private int? ActorUserId => CurrentUserId > 0 ? CurrentUserId : null;

    private async Task<bool> TaskBelongsToTeamAsync(IDbConnection connection, int taskId)
    {
        const string sql =
            "SELECT COUNT(1) FROM tasks WHERE id = @TaskId AND team_id = @TeamId";

        return await connection.QuerySingleAsync<int>(
            sql, new { TaskId = taskId, TeamId = CurrentTeamId }) > 0;
    }

    private static async Task<AttachmentDto?> LoadAsync(IDbConnection connection, int id)
    {
        var sql = $"{SelectSql} WHERE a.id = @Id";

        return await connection.QuerySingleOrDefaultAsync<AttachmentDto>(sql, new { Id = id });
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return value;

        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private sealed class FileRow
    {
        public string FileName { get; set; } = string.Empty;
        public string StoredName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
    }

    private sealed class DeleteRow
    {
        public string StoredName { get; set; } = string.Empty;
        public int? UploadedBy { get; set; }
    }
}
