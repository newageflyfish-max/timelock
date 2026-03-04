import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFY_EMAIL = "arenaprotocolhq@gmail.com";

/**
 * Send a signup notification email.
 * Fire-and-forget — errors are logged but never block the signup flow.
 */
export async function notifyNewSignup(alias: string, totalAgents: number) {
  try {
    await resend.emails.send({
      from: "Timelock <onboarding@resend.dev>",
      to: NOTIFY_EMAIL,
      subject: `New Timelock signup: @${alias}`,
      text: `Agent @${alias} just signed up on Timelock.\n\nTotal agents so far: ${totalAgents}`,
    });
  } catch (err) {
    // Never let email failures break the signup response
    console.error("[email] Failed to send signup notification:", err);
  }
}
