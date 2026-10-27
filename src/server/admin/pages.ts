// Policy and information pages. The shop does not write policies for the
// owner: pages start as marked drafts and are published only when the
// owner confirms the text has been reviewed.

import { z } from 'zod'
import { db } from '../db'
import { recordAudit } from './audit'
import type { StaffResult } from './orders'

type Actor = { id: string; ip: string | null }

export function listLegalPagesForStaff() {
  return db.legalPage.findMany({ orderBy: { title: 'asc' }, select: { slug: true, title: true, isPublished: true, updatedAt: true } })
}

export function getLegalPageForStaff(slug: string) {
  return db.legalPage.findUnique({ where: { slug } })
}

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)

export const pageSchema = z.object({
  title: z.string().trim().min(2, 'Title: at least 2 characters.').max(120),
  bodyMarkdown: z.string().max(60_000, 'The text is too long.'),
  seoTitle: optional(70),
  seoDescription: optional(160),
  publish: z.boolean(),
  reviewed: z.boolean(),
})

export type PageInput = z.infer<typeof pageSchema>

export async function saveLegalPage(slug: string, v: PageInput, actor: Actor): Promise<StaffResult> {
  if (v.publish) {
    if (/draft placeholder/i.test(v.bodyMarkdown)) return { ok: false, error: 'This page still contains the draft placeholder. Replace it with your own text before publishing.' }
    if (v.bodyMarkdown.trim().length < 200) return { ok: false, error: 'This page is too short to publish. Add the full text first.' }
    if (!v.reviewed) return { ok: false, error: 'Tick the box to confirm the text has been reviewed before publishing.' }
  }
  return db.$transaction(async (tx) => {
    const before = await tx.legalPage.findUnique({ where: { slug } })
    if (!before) return { ok: false as const, error: 'Page not found.' }
    const data = {
      title: v.title,
      bodyMarkdown: v.bodyMarkdown,
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      isPublished: v.publish,
      ...(v.publish && !before.isPublished ? { publishedAt: new Date() } : {}),
    }
    await tx.legalPage.update({ where: { slug }, data })
    await recordAudit(tx, {
      actorUserId: actor.id,
      ipAddress: actor.ip,
      action: 'page.update',
      entityType: 'LegalPage',
      entityId: slug,
      before: { title: before.title, isPublished: before.isPublished, length: before.bodyMarkdown.length },
      after: { title: v.title, isPublished: v.publish, length: v.bodyMarkdown.length, ...(v.publish ? { reviewedConfirmed: v.reviewed } : {}) },
    })
    return { ok: true as const }
  })
}
