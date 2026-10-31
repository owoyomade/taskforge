import "server-only";

import nodemailer from "nodemailer";

import { ROLE_LABELS, type WorkspaceRole } from "@/lib/permissions";
import { serverEnv } from "@/lib/server-env";

// One shared connection setup. Port 465 means the connection is encrypted
// from the start (Gmail); other ports upgrade with STARTTLS when offered.
const transport = nodemailer.createTransport({
  host: serverEnv.SMTP_HOST,
  port: serverEnv.SMTP_PORT,
  secure: serverEnv.SMTP_PORT === 465,
  auth: serverEnv.SMTP_USER ? { user: serverEnv.SMTP_USER, pass: serverEnv.SMTP_PASSWORD } : undefined,
});

type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends one email. Failures are logged (without the address or content)
 * rather than thrown: the sign-in library calls this in the background,
 * and an email outage shouldn't crash the request that triggered it.
 */
export async function sendEmail(email: Email): Promise<void> {
  try {
    await transport.sendMail({ from: serverEnv.EMAIL_FROM, ...email });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", context: "sendEmail", subject: email.subject, message }));
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** A short email with one button-style link; the text version carries the same link. */
function linkEmail({ to, subject, heading, intro, linkText, url, outro }: {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  linkText: string;
  url: string;
  outro: string;
}): Email {
  const href = escapeHtml(url);
  return {
    to,
    subject,
    text: `${heading}\n\n${intro}\n\n${linkText}: ${url}\n\n${outro}`,
    html: `<div style="font-family: system-ui, sans-serif; color: #2b2320; max-width: 480px">
  <h2 style="margin: 0 0 12px">${escapeHtml(heading)}</h2>
  <p>${escapeHtml(intro)}</p>
  <p><a href="${href}" style="display: inline-block; background: #cb4536; color: #ffffff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-weight: 600">${escapeHtml(linkText)}</a></p>
  <p style="color: #6b5f57; font-size: 14px">${escapeHtml(outro)}</p>
</div>`,
  };
}

export function confirmEmailMessage(to: string, url: string): Email {
  return linkEmail({
    to,
    subject: "Confirm your email for Taskforge",
    heading: "Confirm your email",
    intro: "Welcome to Taskforge. Confirm your email address to finish creating your account.",
    linkText: "Confirm my email",
    url,
    outro: "If you didn't sign up, you can ignore this email.",
  });
}

export function resetPasswordMessage(to: string, url: string): Email {
  return linkEmail({
    to,
    subject: "Reset your Taskforge password",
    heading: "Choose a new password",
    intro: "Someone asked to reset the password for this email address. The link works once and expires in one hour.",
    linkText: "Reset my password",
    url,
    outro: "If that wasn't you, ignore this email and your password stays the same.",
  });
}

/**
 * The workspace and inviter names are typed by users, so they only ever
 * appear escaped (linkEmail escapes every field) and never as links.
 */
export function invitationMessage(to: string, workspaceName: string, inviterName: string, role: WorkspaceRole, url: string): Email {
  // Collapse line breaks so a name can't add lines to the subject header.
  const workspace = workspaceName.replace(/\s+/g, " ").trim();
  const inviter = inviterName.replace(/\s+/g, " ").trim() || "A teammate";
  return linkEmail({
    to,
    subject: `${inviter} invited you to ${workspace} on Taskforge`,
    heading: `Join ${workspace} on Taskforge`,
    intro: `${inviter} invited you to join ${workspace} as ${ROLE_ARTICLES[role]} ${ROLE_LABELS[role].toLowerCase()}. Sign in or create an account with this email address to accept.`,
    linkText: "View the invitation",
    url,
    outro: "The link works for 7 days and only for this email address. If you weren't expecting it, you can ignore this email.",
  });
}

const ROLE_ARTICLES: Record<WorkspaceRole, string> = { owner: "an", admin: "an", member: "a", viewer: "a" };
