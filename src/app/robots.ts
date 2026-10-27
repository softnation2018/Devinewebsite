import type { MetadataRoute } from 'next'
import { indexingAllowed, siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/account', '/cart', '/checkout', '/order', '/api', '/newsletter', '/search'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
