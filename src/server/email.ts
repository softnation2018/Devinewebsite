import 'server-only'

// Transactional email. Only two transports for now:
//  - "console": development; prints the email to the server log.
//  - "resend": production, once EMAIL_API_KEY is configured.
// With no provider configured in production, emails are NOT sent and an
// error is logged. Nothing pretends an email went out when it did not.

export type Email = { to: string; subject: string; text: string }

export async function sendEmail(email: Email): Promise<{ sent: boolean }> {
  const provider = process.env.EMAIL_PROVIDER ?? (process.env.NODE_ENV === 'production' ? '' : 'console')

  if (provider === 'console') {
    console.info(`[email:console] to=${email.to} subject="${email.subject}"\n${email.text}`)
    return { sent: true }
  }

  if (provider === 'resend' && process.env.EMAIL_API_KEY && process.env.EMAIL_FROM) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`[email] provider rejected message: HTTP ${res.status}`)
      return { sent: false }
    }
    return { sent: true }
  }

  console.error('[email] no email provider configured; message not sent:', email.subject)
  return { sent: false }
}
