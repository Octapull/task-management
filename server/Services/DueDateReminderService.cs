using Dapper;
using Microsoft.Extensions.Options;
using TaskManagementSystem.Data;

namespace TaskManagementSystem.Services;

/// <summary>
/// Teslim tarihi yaklaşan ve geçen işler için hatırlatma gönderir.
///
/// Belirli aralıklarla veritabanını tarıyor. Zamanlanmış iş altyapısı
/// (Hangfire, Quartz) eklemedik: tek bir periyodik tarama için ek bağımlılık
/// ve yapılandırma yükü getirirdi.
///
/// Aynı iş için aynı hatırlatmanın tekrar gitmemesi <c>tasks.reminder_stage</c>
/// ile sağlanıyor: gönderim başarılı olunca aşama ilerliyor.
/// </summary>
public class DueDateReminderService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEmailQueue _emailQueue;
    private readonly EmailOptions _options;
    private readonly ILogger<DueDateReminderService> _logger;

    /// <summary>Uygulama açılır açılmaz taramaya başlamıyoruz.</summary>
    private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(20);

    public DueDateReminderService(
        IServiceScopeFactory scopeFactory,
        IEmailQueue emailQueue,
        IOptions<EmailOptions> options,
        ILogger<DueDateReminderService> logger)
    {
        _scopeFactory = scopeFactory;
        _emailQueue = emailQueue;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.NotifyOnDueDate)
        {
            _logger.LogInformation(
                "Teslim tarihi hatırlatmaları kapalı (Email:NotifyOnDueDate).");
            return;
        }

        try
        {
            await Task.Delay(StartupDelay, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.ReminderScanMinutes));
        using var timer = new PeriodicTimer(interval);

        do
        {
            try
            {
                await ScanAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Tarama hatası döngüyü durdurmamalı: veritabanı geçici olarak
                // erişilemez olabilir, bir sonraki turda tekrar denenir.
                _logger.LogError(ex, "Teslim tarihi taraması başarısız oldu.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task ScanAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();

        var connectionFactory = scope.ServiceProvider
            .GetRequiredService<IDbConnectionFactory>();

        using var connection = connectionFactory.CreateConnection();

        // due_date artık timestamptz: NOW() ile karşılaştırma iki tarafı da
        // mutlak an olarak ele alıyor, oturumun saat dilimi sonucu etkilemiyor.
        const string sql = """
            SELECT
                t.id             AS TaskId,
                t.title          AS Title,
                t.due_date       AS DueDate,
                t.reminder_stage AS ReminderStage,
                t.due_date <= NOW() AS IsOverdue,
                u.full_name      AS AssigneeName,
                u.email          AS Email
            FROM tasks t
            JOIN users u ON u.id = t.assigned_user_id
            WHERE t.due_date IS NOT NULL
              AND t.status <> @CompletedStatus
              AND u.notify_on_due_date
              AND u.is_email_confirmed
              AND (
                    (t.reminder_stage = 0
                     AND t.due_date <= NOW() + make_interval(hours => @DueSoonHours))
                 OR (t.reminder_stage < 2 AND t.due_date <= NOW())
              )
            """;

        var rows = (await connection.QueryAsync<ReminderRow>(sql, new
        {
            CompletedStatus = (short)Entities.TaskItemStatus.Completed,
            DueSoonHours = Math.Max(1, _options.DueSoonHours),
        })).ToList();

        if (rows.Count == 0) return;

        const string markSql =
            "UPDATE tasks SET reminder_stage = @Stage WHERE id = @TaskId";

        foreach (var row in rows)
        {
            if (cancellationToken.IsCancellationRequested) break;

            if (string.IsNullOrWhiteSpace(row.Email)) continue;

            var message = DueReminderEmailTemplate.Build(
                row.Email,
                row.AssigneeName,
                row.TaskId,
                row.Title,
                row.DueDate,
                row.IsOverdue,
                _options.AppUrl);

            _emailQueue.Enqueue(message);

            // Aşama gönderimden hemen sonra ilerletiliyor. Kuyruk gönderemezse
            // hatırlatma kaybolur; alternatifi (gönderim onayını beklemek) aynı
            // postayı defalarca yollama riskini getirirdi ve o daha kötü.
            await connection.ExecuteAsync(markSql, new
            {
                Stage = row.IsOverdue ? (short)2 : (short)1,
                row.TaskId,
            });
        }

        _logger.LogInformation("{Count} teslim tarihi hatırlatması kuyruğa alındı.", rows.Count);
    }

    private sealed class ReminderRow
    {
        public int TaskId { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime DueDate { get; set; }
        public int ReminderStage { get; set; }
        public bool IsOverdue { get; set; }
        public string AssigneeName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
    }
}
