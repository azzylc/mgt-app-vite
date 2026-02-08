// app/lib/email.ts
// Resend ile email gönderme servisi

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'destek@mgtapp.com';
const FROM_NAME = 'Mgt App';

interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: EmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject: subject,
        text: text,
        html: html,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Email sent to ${to}, id: ${data.id}`);
      return true;
    } else {
      const error = await response.text();
      console.error(`❌ Email failed: ${error}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Email error:', error);
    return false;
  }
}

// Şifre sıfırlama emaili
export async function sendPasswordResetEmail(
  to: string, 
  name: string, 
  newPassword: string
): Promise<boolean> {
  const subject = 'Yeni Şifreniz - Mgt App';
  
  const text = `
Merhaba ${name},

Şifreniz sıfırlandı. Yeni giriş bilgileriniz:

Email: ${to}
Şifre: ${newPassword}

Giriş yapmak için: https://gys.mgtapp.com/login

İyi çalışmalar,
Mgt App
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;">Mgt App</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #334155; line-height: 1.6;">
                Merhaba <strong style="color: #1e293b;">${name}</strong>,
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; color: #334155; line-height: 1.6;">
                Şifreniz sıfırlandı. Yeni giriş bilgileriniz:
              </p>
              
              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; border-radius: 12px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                          <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Email</span>
                          <br>
                          <span style="font-size: 15px; color: #1e293b; font-weight: 600;">${to}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Yeni Şifre</span>
                          <br>
                          <span style="font-size: 18px; color: #1e293b; font-weight: 700; font-family: 'SF Mono', Monaco, 'Courier New', monospace; letter-spacing: 1px;">${newPassword}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://gys.mgtapp.com/login" style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                      Giriş Yap
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                İyi çalışmalar,<br>
                <strong style="color: #64748b;">Mgt App</strong>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return sendEmail({ to, subject, text, html });
}