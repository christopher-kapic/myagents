import { env } from "@myagents/env/server";
import nodemailer from "nodemailer";

export function isSmtpConfigured(): boolean {
  return !!(
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASSWORD &&
    env.SMTP_FROM
  );
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });
}

export async function sendInvitationEmail({
  to,
  inviterName,
  token,
}: {
  to: string;
  inviterName: string;
  token: string;
}) {
  const transport = createTransport();
  const inviteUrl = `${env.BETTER_AUTH_URL}/login?invitation=${token}`;

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `${inviterName} invited you to MyAgents`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        <p><strong>${inviterName}</strong> has invited you to join MyAgents.</p>
        <p>
          <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: #fff; text-decoration: none; border-radius: 6px;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #71717a; font-size: 14px;">This invitation expires in 7 days.</p>
        <p style="color: #a1a1aa; font-size: 12px;">If you didn't expect this email, you can safely ignore it.</p>
      </div>
    `,
  });
}
