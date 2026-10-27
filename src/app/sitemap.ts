import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'
import { listSitemapEntries } from '@/server/catalog'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const { categories, products, pages } = await listSitemapEntries()
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/shop`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.3 },
    ...categories.map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: c.updatedAt, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: p.updatedAt, priority: 0.7 })),
    ...pages.map((p) => ({ url: `${base}/policies/${p.slug}`, lastModified: p.updatedAt, priority: 0.2 })),
  ]
}
