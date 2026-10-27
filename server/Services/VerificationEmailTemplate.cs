using System.Net;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

/// <summary>
/// Doğrulama e-postasının gövdesi.
///
/// Stiller inline yazılmış ve yerleşim tabloya dayanıyor: e-posta istemcileri
/// (özellikle Outlook) harici stil sayfası ve modern CSS yerleşimlerini
/// desteklemiyor.
/// </summary>
public static class VerificationEmailTemplate
{
    public static EmailMessage Build(
        string toEmail,
        string fullName,
        string code,
        int lifetimeMinutes,
        VerificationPurpose purpose = VerificationPurpose.EmailConfirmation)
    {
        // Kullanıcının kendi yazdığı ad doğrudan HTML'e giriyor - kaçırılmazsa
        // e-posta gövdesine etiket enjekte edilebilirdi.
        var safeName = WebUtility.HtmlEncode(fullName);

        // Konu satırı iki akışta farklı: gelen kutusunda "şifre sıfırlama mı
        // istemiştim, hesap doğrulama mı" sorusu okumadan cevaplanabilsin.
        var subject = purpose == VerificationPurpose.PasswordReset
            ? $"İş Takip şifre sıfırlama kodun: {code}"
            : $"İş Takip doğrulama kodun: {code}";

        return new EmailMessage
        {
            To = toEmail,
            Subject = subject,
            HtmlBody = Html(safeName, code, lifetimeMinutes),
            TextBody = Text(fullName, code, lifetimeMinutes),
        };
    }

    private static string Html(string safeName, string code, int lifetimeMinutes) =>
        $"""
        <!DOCTYPE html>
        <html lang="tr">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Doğrulama kodun</title>
          </head>
          <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e4e6ea;overflow:hidden;">

                    <tr>
                      <td style="padding:28px 32px 8px 32px;">
                        <div style="font-size:15px;font-weight:600;color:#111827;letter-spacing:-0.01em;">İş Takip</div>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:8px 32px 0 32px;">
                        <h1 style="margin:0 0 8px 0;font-size:20px;line-height:1.35;font-weight:600;color:#111827;">
                          Hesabını doğrula
                        </h1>
                        <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
                          Merhaba {safeName}, aşağıdaki kodu kayıt ekranına girerek hesabını
                          aktifleştirebilirsin.
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:24px 32px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e4e6ea;border-radius:10px;">
                          <tr>
                            <td align="center" style="padding:20px 16px;">
                              <div style="font-size:32px;line-height:1;font-weight:700;letter-spacing:10px;color:#111827;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">
                                {code}
                              </div>
                              <div style="margin-top:10px;font-size:12px;color:#6b7280;">
                                Kod {lifetimeMinutes} dakika geçerli
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:0 32px 28px 32px;">
                        <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                          Bu kaydı sen başlatmadıysan bu e-postayı yok sayabilirsin;
                          kod kullanılmadığı sürece hiçbir hesap açılmaz.
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e4e6ea;">
                        <div style="font-size:11px;color:#9ca3af;">
                          Bu otomatik bir e-postadır, yanıtlamana gerek yok.
                        </div>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
        """;

    private static string Text(string fullName, string code, int lifetimeMinutes) =>
        $"""
        İş Takip - Hesabını doğrula

        Merhaba {fullName},

        Doğrulama kodun: {code}
        Kod {lifetimeMinutes} dakika geçerli.

        Bu kaydı sen başlatmadıysan bu e-postayı yok sayabilirsin.
        """;
}
