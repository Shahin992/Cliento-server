import https from 'https';

const getEmailConfig = () => {
  return {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || 'Cliento',
  };
};

export const canSendEmail = () => {
  const { apiKey, senderEmail } = getEmailConfig();
  return Boolean(apiKey && senderEmail);
};

export const sendWelcomeEmail = async (to: string, name: string, tempPassword: string) => {
  const { apiKey, senderEmail, senderName } = getEmailConfig();
  if (!canSendEmail()) {
    console.warn('====> Email not sent: missing Brevo API env vars');
    return;
  }

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to, name }],
    subject: 'Welcome to Cliento',
    // htmlContent: `<p>Hi ${name}, welcome to Cliento! Your account has been created.</p>`,
    htmlContent: `
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb; padding: 30px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 30px;">
        
        <h2 style="color: #333; margin-top: 0;">
          Welcome to Cliento, ${name}! 👋
        </h2>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Your account is ready. Use the temporary password below to sign in, then change it right away.
        </p>

        <div style="background:#f3f6ff;border:1px solid #d9e2ff;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;color:#333;font-size:14px;">
            Temporary password: <strong style="font-size:16px;">${tempPassword}</strong>
          </p>
        </div>

        <h3 style="color: #333;">Your first 3 steps</h3>

        <ol style="color: #555; font-size: 15px; line-height: 1.6; padding-left: 20px;">
          <li><strong>Complete your profile</strong><br/>Add your company details and preferences.</li>
          <li><strong>Add your first contact</strong><br/>Start by importing or creating a customer.</li>
          <li><strong>Create your first deal</strong><br/>Track progress and stay organized.</li>
        </ol>


        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          Need help? Reply to this email or check the in-app tips — we’ve got you covered.
        </p>

        <p style="color: #555; font-size: 14px;">
          Cheers,<br/>
          <strong>The Cliento Team</strong>
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:30px 0"/>

        <p style="color:#999;font-size:12px;text-align:center;">
          © ${new Date().getFullYear()} Cliento
        </p>

      </div>
    </div>`
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': apiKey as string,
          'content-type': 'application/json',
          accept: 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`====> Email sent: ${res.statusCode}`);
            resolve(data);
          } else {
            reject(new Error(`Brevo API error: ${res.statusCode} ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};
