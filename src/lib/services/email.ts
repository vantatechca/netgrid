import { Resend } from "resend";

let _resend: Resend | undefined;
function resendClient(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}
const resend = new Proxy({} as Resend, {
  get(_t, prop, receiver) {
    return Reflect.get(resendClient() as object, prop, receiver);
  },
});

const FROM_EMAIL = process.env.EMAIL_FROM || "NETGRID <noreply@netgrid.io>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function sendMagicLink(email: string, token: string) {
  const verifyUrl = `${APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Your NETGRID Login Link",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Sign in to NETGRID</h2>
        <p>Click the button below to access your dashboard. This link expires in 15 minutes.</p>
        <a href="${verifyUrl}"
           style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
          Sign In
        </a>
        <p style="color: #666; font-size: 13px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send magic link email:", error);
    throw new Error("Failed to send magic link email");
  }

  return data;
}

export async function sendInvoiceReminder(
  email: string,
  invoiceData: {
    clientName: string;
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    currency?: string;
  }
) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Invoice Reminder: ${invoiceData.invoiceNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Invoice Reminder</h2>
        <p>Hi ${invoiceData.clientName},</p>
        <p>This is a reminder that invoice <strong>${invoiceData.invoiceNumber}</strong>
        for <strong>${invoiceData.currency || "CAD"} $${invoiceData.amount}</strong>
        is due on <strong>${invoiceData.dueDate}</strong>.</p>
        <a href="${APP_URL}/portal/billing"
           style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
          View Invoice
        </a>
        <p style="color: #666; font-size: 13px;">
          If you've already paid, please disregard this message.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send invoice reminder:", error);
    throw new Error("Failed to send invoice reminder");
  }

  return data;
}

export async function sendRenewalAlert(
  email: string,
  alertData: {
    clientName: string;
    renewalType: string;
    domain: string;
    expiryDate: string;
    daysUntilExpiry: number;
  }
) {
  const urgency = alertData.daysUntilExpiry <= 7 ? "URGENT: " : "";

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${urgency}${alertData.renewalType} Renewal - ${alertData.domain}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">${alertData.renewalType} Renewal Alert</h2>
        <p>Hi ${alertData.clientName},</p>
        <p>The <strong>${alertData.renewalType}</strong> for <strong>${alertData.domain}</strong>
        expires on <strong>${alertData.expiryDate}</strong>
        (${alertData.daysUntilExpiry} days from now).</p>
        <p>Please ensure renewal is handled promptly to avoid service interruption.</p>
        <a href="${APP_URL}/portal/blogs"
           style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
          View Blog Details
        </a>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send renewal alert:", error);
    throw new Error("Failed to send renewal alert");
  }

  return data;
}

export async function sendReportNotification(
  email: string,
  reportData: {
    clientName: string;
    reportTitle: string;
    periodStart: string;
    periodEnd: string;
  }
) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `New Report Available: ${reportData.reportTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Your Report is Ready</h2>
        <p>Hi ${reportData.clientName},</p>
        <p>A new report has been generated for the period
        <strong>${reportData.periodStart}</strong> to <strong>${reportData.periodEnd}</strong>.</p>
        <a href="${APP_URL}/portal/reports"
           style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
          View Report
        </a>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send report notification:", error);
    throw new Error("Failed to send report notification");
  }

  return data;
}

export async function sendGenericEmail(
  to: string,
  subject: string,
  html: string
) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Failed to send email:", error);
    throw new Error("Failed to send email");
  }

  return data;
}
