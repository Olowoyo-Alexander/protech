// Sent via Brevo's HTTPS API (not raw SMTP) — Render's free tier blocks
// outbound SMTP ports (25/465/587) entirely, so nodemailer times out no
// matter what credentials are supplied. Brevo's API runs over port 443 like
// any other HTTP call, same as Cloudinary already does.
const appUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Wrap message content in the shared PROTECH-branded shell so every email looks
// consistent. `body` is trusted HTML the caller has already escaped as needed.
function brand(body) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a1628">
      <div style="background:#0a1628;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="color:#f59e0b;margin:0">PROTECH</h2>
        <p style="color:#c7d2e0;margin:4px 0 0;font-size:13px">Collaborative Student Innovation Hub</p>
      </div>
      <div style="border:1px solid #e5e9f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
        ${body}
        <hr style="border:none;border-top:1px solid #eef1f6;margin:24px 0 12px" />
        <p style="color:#98a2b3;font-size:12px;margin:0">
          You're receiving this because you have a PROTECH account.
        </p>
      </div>
    </div>`;
}

// Core sender. Never throws — a mail failure must not break the request that
// triggered it. When SMTP isn't configured the message is logged to the console
// so every flow still works end-to-end in development.
async function sendMail({ to, subject, text, html }) {
  if (!to) return { delivered: false };
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`\n[DEV EMAIL] To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
    return { delivered: false };
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'PROTECH',
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: brand(html),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo ${res.status}: ${body}`);
    }
    return { delivered: true };
  } catch (err) {
    console.error(`[EMAIL] Failed to send "${subject}" to ${to}:`, err.message);
    return { delivered: false, error: err.message };
  }
}

/**
 * Sends the account verification code. If SMTP is not configured,
 * the code is logged to the console so the flow still works in dev.
 */
export async function sendVerificationEmail(to, name, code) {
  const subject = 'Your PROTECH verification code';
  const text = `Hello ${name},\n\nYour PROTECH verification code is: ${code}\n\nIt expires in 15 minutes.`;
  const html = `
    <p>Hello <b>${name}</b>,</p>
    <p>Use this code to verify your PROTECH account:</p>
    <div style="font-size:30px;font-weight:bold;letter-spacing:6px;background:#f0f4ff;
      padding:16px;text-align:center;border-radius:10px;color:#0a1628">${code}</div>
    <p style="color:#888;font-size:13px">This code expires in 15 minutes.</p>`;
  return sendMail({ to, subject, text, html });
}

/**
 * Welcomes a newly registered (and active) user to the platform.
 */
export async function sendWelcomeEmail(to, name, role = 'student') {
  const roleLine =
    role === 'supervisor'
      ? 'You can now review student submissions, rate projects, and recommend outstanding work for the spotlight.'
      : 'You can now publish your projects, collaborate on others, and earn recognition for your work.';
  const subject = 'Welcome to PROTECH 🎉';
  const text = `Hello ${name},\n\nWelcome to PROTECH — your account is ready.\n\n${roleLine}\n\nSign in: ${appUrl()}`;
  const html = `
    <p>Hello <b>${name}</b>,</p>
    <p>Welcome to <b>PROTECH</b> — your account is ready to go.</p>
    <p>${roleLine}</p>
    <p style="margin-top:20px">
      <a href="${appUrl()}" style="background:#f59e0b;color:#0a1628;text-decoration:none;
        font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">Open PROTECH</a>
    </p>`;
  return sendMail({ to, subject, text, html });
}

/**
 * Sends a user the new temporary password set for them by an administrator.
 */
export async function sendPasswordResetEmail(to, name, tempPassword) {
  const subject = 'Your PROTECH password has been reset';
  const text = `Hello ${name},\n\nAn administrator has reset your PROTECH password. Your temporary password is:\n\n${tempPassword}\n\nSign in with it, then change it from your profile. Sign in: ${appUrl()}`;
  const html = `
    <p>Hello <b>${name}</b>,</p>
    <p>An administrator has reset your PROTECH password. Use this temporary password to sign in:</p>
    <div style="font-size:20px;font-weight:bold;letter-spacing:2px;background:#f0f4ff;
      padding:14px;text-align:center;border-radius:10px;color:#0a1628">${tempPassword}</div>
    <p style="color:#888;font-size:13px">For your security, change it from your profile after signing in.</p>
    <p style="margin-top:16px">
      <a href="${appUrl()}" style="background:#f59e0b;color:#0a1628;text-decoration:none;
        font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">Sign in</a>
    </p>`;
  return sendMail({ to, subject, text, html });
}

/**
 * Tells an author their project has been approved.
 */
export async function sendProjectApprovedEmail(to, name, title) {
  const subject = `Your project "${title}" was approved 🎉`;
  const text = `Hello ${name},\n\nGreat news — your project "${title}" has been approved and is now live on PROTECH.\n\nView it: ${appUrl()}`;
  const html = `
    <p>Hello <b>${name}</b>,</p>
    <p>Great news — your project <b>"${title}"</b> has been approved and is now live on PROTECH. 🎉</p>
    <p style="margin-top:16px">
      <a href="${appUrl()}" style="background:#f59e0b;color:#0a1628;text-decoration:none;
        font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">View on PROTECH</a>
    </p>`;
  return sendMail({ to, subject, text, html });
}

/**
 * Tells an author their project was not approved, with an optional reason.
 */
export async function sendProjectRejectedEmail(to, name, title, reason = '') {
  const subject = `Your project "${title}" needs revision`;
  const reasonText = reason ? `\n\nReason: ${reason}` : '';
  const text = `Hello ${name},\n\nYour project "${title}" was not approved.${reasonText}\n\nYou can revise and resubmit it from "My Projects". ${appUrl()}`;
  const reasonHtml = reason
    ? `<p style="background:#fef2f2;border-left:3px solid #ef4444;padding:10px 14px;border-radius:4px;color:#7f1d1d">
         <b>Reason:</b> ${reason}</p>`
    : '';
  const html = `
    <p>Hello <b>${name}</b>,</p>
    <p>Your project <b>"${title}"</b> was not approved.</p>
    ${reasonHtml}
    <p>You can revise and resubmit it from <b>My Projects</b>.</p>
    <p style="margin-top:16px">
      <a href="${appUrl()}" style="background:#f59e0b;color:#0a1628;text-decoration:none;
        font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">Open PROTECH</a>
    </p>`;
  return sendMail({ to, subject, text, html });
}

/**
 * Tells a supervisor they've been tagged on a project submitted for their review.
 */
export async function sendSupervisorTagEmail(to, supervisorName, studentName, title) {
  const subject = `New project awaiting your review: "${title}"`;
  const text = `Hello ${supervisorName},\n\n${studentName} tagged you as the supervisor for "${title}" and submitted it for review.\n\nReview it on PROTECH: ${appUrl()}`;
  const html = `
    <p>Hello <b>${supervisorName}</b>,</p>
    <p><b>${studentName}</b> tagged you as the supervisor for <b>"${title}"</b> and submitted it for your review.</p>
    <p style="margin-top:16px">
      <a href="${appUrl()}" style="background:#f59e0b;color:#0a1628;text-decoration:none;
        font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">Review submission</a>
    </p>`;
  return sendMail({ to, subject, text, html });
}
