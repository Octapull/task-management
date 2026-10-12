using System.Net;

namespace TaskManagementSystem.Services;

/// <summary>Teslim tarihi hatırlatması - hem "yaklaşıyor" hem "geçti" hali.</summary>
public static class DueReminderEmailTemplate
{
    public static EmailMessage Build(
        string toEmail,
        string assigneeName,
        int taskId,
        string taskTitle,
        DateTime dueDate,
        bool isOverdue,
        string appUrl)
    {
        var safeName = WebUtility.HtmlEncode(assigneeName);
        var safeTitle = WebUtility.HtmlEncode(taskTitle);

        var taskUrl = $"{appUrl.TrimEnd('/')}/task/{taskId}";

        // Damga veritabanından UTC olarak geliyor; postada yazan tarih
        // sunucunun yerel takvimine göre olmalı, aksi halde gün sonuna yakın
        // teslim tarihleri bir gün geride görünürdü.
        var localDue = dueDate.Kind == DateTimeKind.Utc ? dueDate.ToLocalTime() : dueDate;
        var dueText = localDue.ToString("d MMMM yyyy", TurkishCulture);

        var headline = isOverdue ? "Teslim tarihi geçti" : "Teslim tarihi yaklaşıyor";

        var lead = isOverdue
            ? $"Üzerindeki iş {dueText} tarihinde teslim edilmeliydi ve hâlâ açık."
            : $"Üzerindeki işin teslim tarihi {dueText}.";

        // Geçmiş işlerde kırmızı, yaklaşanlarda turuncu: gelen kutusunda
        // aciliyet başlığı okumadan da fark edilsin.
        var accent = isOverdue ? "#dc2626" : "#f97316";

        return new EmailMessage
        {
            To = toEmail,
            Subject = isOverdue
                ? $"Teslim tarihi geçti: {taskTitle}"
                : $"Teslim tarihi yaklaşıyor: {taskTitle}",
            HtmlBody = Html(safeName, safeTitle, taskId, headline, lead, accent, taskUrl),
            TextBody = Text(assigneeName, taskTitle, taskId, headline, lead, taskUrl),
        };
    }

    private static System.Globalization.CultureInfo TurkishCulture { get; } =
        new("tr-TR");

    private static string Html(
        string safeName,
        string safeTitle,
        int taskId,
        string headline,
        string lead,
        string accent,
        string taskUrl) =>
        $"""
        <!DOCTYPE html>
        <html lang="tr">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{headline}</title>
          </head>
          <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e4e6ea;overflow:hidden;">

                    <tr>
                      <td style="padding:28px 32px 8px 32px;">
                        <p style="margin:0;font-size:13px;color:#6b7280;">İş Takip</p>
                        <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:600;color:{accent};">
                          {headline}
                        </h1>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:16px 32px 0 32px;">
                        <p style="margin:0;font-size:14px;line-height:22px;color:#374151;">
                          Merhaba {safeName}, {lead}
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:20px 32px 0 32px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e4e6ea;border-radius:8px;">
                          <tr>
                            <td style="padding:16px;">
                              <p style="margin:0;font-size:12px;color:#9ca3af;">#{taskId}</p>
                              <p style="margin:4px 0 0 0;font-size:15px;font-weight:600;color:#111827;">
                                {safeTitle}
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:24px 32px 0 32px;">
                        <a href="{taskUrl}" style="display:inline-block;padding:10px 20px;background-color:{accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                          İşi aç
                        </a>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:24px 32px 28px 32px;">
                        <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                          Bu hatırlatmaları almak istemiyorsan profil ayarlarından kapatabilirsin.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
        """;

    private static string Text(
        string assigneeName,
        string taskTitle,
        int taskId,
        string headline,
        string lead,
        string taskUrl) =>
        $"""
        {headline}

        Merhaba {assigneeName}, {lead}

        #{taskId} - {taskTitle}

        İşi açmak için: {taskUrl}

        Bu hatırlatmaları almak istemiyorsan profil ayarlarından kapatabilirsin.
        """;
}
