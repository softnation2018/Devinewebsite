import 'server-only'
import { z } from 'zod'
import { normaliseEmail } from './auth/accounts'
import { db } from './db'
import { sendEmail } from './email'
import { getSupportSettings } from './settings'

// Messages sent from the contact page. They are stored first, so nothing is
// lost if email is not set up yet; staff read them in Admin → Messages.

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(100),
  email: z.string().trim().max(254).email('Enter a valid email address.'),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^$|^\+?[\d\s-]{8,16}$/, 'Enter a valid phone number, or leave it empty.'),
  orderNumber: z.string().trim().max(40),
  subject: z.string().trim().min(1, 'Please add a subject.').max(150),
  message: z.string().trim().min(10, 'Please write a little more so we can help.').max(4000),
})

export type ContactInput = z.infer<typeof contactSchema>

export async function createInquiry(input: ContactInput, userId: string | null): Promise<void> {
  const inquiry = await db.supportInquiry.create({
    data: {
      userId,
      name: input.name,
      email: normaliseEmail(input.email),
      phone: input.phone || null,
      orderNumber: input.orderNumber || null,
      subject: input.subject,
      message: input.message,
    },
    select: { id: true },
  })

  const support = await getSupportSettings()
  if (support.email) {
    await sendEmail({
      to: support.email,
      subject: `New message: ${input.subject}`,
      text: `From: ${input.name} <${input.email}>${input.phone ? `\nPhone: ${input.phone}` : ''}${input.orderNumber ? `\nOrder: ${input.orderNumber}` : ''}\n\n${input.message}\n\nAlso saved in Admin → Messages (ref ${inquiry.id}).`,
    })
  }
}
