using System.Data;
using Dapper;
using Microsoft.Extensions.Options;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

/// <summary>
/// İş üzerindeki olaylardan doğan bildirimler.
/// </summary>
public interface ITaskNotificationService
{
    /// <summary>
    /// İş başkasına atandığında o kişiye haber verir.
    ///
    /// Kendine atama bildirim üretmez: kişi zaten ne yaptığını biliyor.
    /// </summary>
    Task NotifyAssignedAsync(
        IDbConnection connection,
        TaskItem task,
        int assigneeUserId,
        int assignedByUserId);
}

/// <inheritdoc />
public class TaskNotificationService : ITaskNotificationService
{
    private readonly IEmailQueue _emailQueue;
    private readonly EmailOptions _options;
    private readonly ILogger<TaskNotificationService> _logger;

    public TaskNotificationService(
        IEmailQueue emailQueue,
        IOptions<EmailOptions> options,
        ILogger<TaskNotificationService> logger)
    {
        _emailQueue = emailQueue;
        _options = options.Value;
        _logger = logger;
    }

    public async Task NotifyAssignedAsync(
        IDbConnection connection,
        TaskItem task,
        int assigneeUserId,
        int assignedByUserId)
    {
        // Genel kapatma anahtarı - geliştirme sırasında posta kutusu dolmasın.
        if (!_options.NotifyOnAssignment) return;

        // Kendi üstlendiği işin bildirimi gereksiz.
        if (assigneeUserId == assignedByUserId) return;

        try
        {
            const string sql = """
                SELECT
                    u.full_name            AS FullName,
                    u.email                AS Email,
                    u.notify_on_assignment AS NotifyOnAssignment,
                    u.is_email_confirmed   AS IsEmailConfirmed,
                    (SELECT full_name FROM users WHERE id = @AssignedBy) AS AssignedByName
                FROM users u
                WHERE u.id = @AssigneeId
                """;

            var row = await connection.QuerySingleOrDefaultAsync<NotificationRow>(sql, new
            {
                AssigneeId = assigneeUserId,
                AssignedBy = assignedByUserId,
            });

            if (row is null) return;

            // Kullanıcı bildirimleri kapatmışsa ya da adresini hiç
            // doğrulamamışsa posta göndermiyoruz.
            if (!row.NotifyOnAssignment || !row.IsEmailConfirmed) return;

            if (string.IsNullOrWhiteSpace(row.Email)) return;

            var message = TaskAssignedEmailTemplate.Build(
                row.Email,
                row.FullName,
                row.AssignedByName ?? "Bir ekip arkadaşın",
                task.Id,
                task.Title,
                _options.AppUrl);

            // Kuyruğa bırakıp dönüyoruz; gönderim arka planda.
            _emailQueue.Enqueue(message);
        }
        catch (Exception ex)
        {
            // Bildirim yan bir iş: burada oluşan hata atamayı geri almamalı.
            _logger.LogError(
                ex,
                "Atama bildirimi hazırlanamadı. İş: {TaskId}, kişi: {UserId}",
                task.Id,
                assigneeUserId);
        }
    }

    private sealed class NotificationRow
    {
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public bool NotifyOnAssignment { get; set; }
        public bool IsEmailConfirmed { get; set; }
        public string? AssignedByName { get; set; }
    }
}
