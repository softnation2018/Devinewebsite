import { z } from 'zod'

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
] as const

/** Accepts 10-digit Indian mobile numbers, with or without +91 / 0 / spaces. */
export function normaliseIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

const text = (max: number, message: string) => z.string().trim().min(1, message).max(max)

export const addressSchema = z.object({
  fullName: text(100, 'Please enter the recipient’s name.'),
  phone: z
    .string()
    .transform((v, ctx) => {
      const phone = normaliseIndianMobile(v)
      if (!phone) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number.' })
      return phone ?? ''
    }),
  line1: text(200, 'Please enter the house number and street.'),
  line2: z.string().trim().max(200).optional().transform((v) => v || null),
  landmark: z.string().trim().max(120).optional().transform((v) => v || null),
  city: text(80, 'Please enter the city.'),
  state: z.enum(INDIAN_STATES, { message: 'Please choose a state.' }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code.'),
})

export type AddressInput = z.output<typeof addressSchema>
