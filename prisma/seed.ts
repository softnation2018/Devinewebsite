// Development seed. Safe to run repeatedly: every write is an upsert.
// With SEED_DEMO_PRODUCTS=false (used for a new live shop) it sets up
// categories, settings, couriers and policy drafts, but no demo products.
// With SEED_ONLY_IF_EMPTY=true it does nothing once the shop has settings,
// so deployments can run it every time without touching the owner's changes.
//
// Every product created here is DEMO content (isDemo = true, "(Demo)" in the
// name). Prices, stock and descriptions are placeholders, not real listings.
// No product description claims a spiritual, health or financial outcome.

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from '../src/generated/prisma/client'

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const rupees = (r: number) => Math.round(r * 100)

const categories = [
  { slug: 'yantras-vastu', name: 'Yantras & Vastu', nameHi: 'यंत्र एवं वास्तु', position: 1 },
  { slug: 'devotional', name: 'Religious & Devotional', nameHi: 'धार्मिक एवं भक्ति', position: 2 },
  { slug: 'rudraksha-malas', name: 'Rudraksha & Malas', nameHi: 'रुद्राक्ष एवं माला', position: 3 },
  { slug: 'bracelets', name: 'Bracelets & Wearables', nameHi: 'ब्रेसलेट', position: 4 },
] as const

type DemoProduct = {
  sku: string
  slug: string
  name: string
  category: (typeof categories)[number]['slug']
  priceRupees: number
  compareAtRupees?: number
  stock: number
  weightGrams: number
  material?: string
  isFeatured?: boolean
  shortDescription: string
  attributes: [string, string][]
}

const products: DemoProduct[] = [
  {
    sku: 'DEMO-YAN-001',
    slug: 'demo-shri-yantra-brass-4in',
    name: 'Shri Yantra, Brass, 4 inch (Demo)',
    category: 'yantras-vastu',
    priceRupees: 1499,
    compareAtRupees: 1799,
    stock: 12,
    weightGrams: 350,
    material: 'Brass',
    isFeatured: true,
    shortDescription: 'Engraved brass Shri Yantra plate for a home altar. Demo listing.',
    attributes: [['Size', '4 × 4 inch'], ['Finish', 'Polished']],
  },
  {
    sku: 'DEMO-YAN-002',
    slug: 'demo-kuber-yantra-copper',
    name: 'Kuber Yantra, Copper (Demo)',
    category: 'yantras-vastu',
    priceRupees: 899,
    stock: 8,
    weightGrams: 180,
    material: 'Copper',
    shortDescription: 'Copper Kuber Yantra plate. Demo listing.',
    attributes: [['Size', '3 × 3 inch']],
  },
  {
    sku: 'DEMO-DEV-001',
    slug: 'demo-hanuman-chalisa-pocket',
    name: 'Hanuman Chalisa, Pocket Edition (Demo)',
    category: 'devotional',
    priceRupees: 149,
    stock: 50,
    weightGrams: 60,
    isFeatured: true,
    shortDescription: 'Pocket-size Hanuman Chalisa in Hindi. Demo listing.',
    attributes: [['Language', 'Hindi'], ['Pages', '48']],
  },
  {
    sku: 'DEMO-DEV-002',
    slug: 'demo-brass-puja-thali-set',
    name: 'Brass Puja Thali Set (Demo)',
    category: 'devotional',
    priceRupees: 1299,
    stock: 6,
    weightGrams: 700,
    material: 'Brass',
    shortDescription: 'Seven-piece brass puja thali. Demo listing.',
    attributes: [['Pieces', '7'], ['Diameter', '10 inch']],
  },
  {
    sku: 'DEMO-RUD-001',
    slug: 'demo-rudraksha-mala-108',
    name: 'Rudraksha Mala, 108 + 1 Beads (Demo)',
    category: 'rudraksha-malas',
    priceRupees: 1199,
    stock: 15,
    weightGrams: 90,
    material: 'Rudraksha',
    isFeatured: true,
    shortDescription: 'Five-mukhi rudraksha mala on cotton thread. Demo listing; origin not verified.',
    attributes: [['Beads', '108 + 1'], ['Bead size', '7–8 mm']],
  },
  {
    sku: 'DEMO-RUD-002',
    slug: 'demo-gomti-chakra-set-11',
    name: 'Gomti Chakra, Set of 11 (Demo)',
    category: 'rudraksha-malas',
    priceRupees: 249,
    stock: 30,
    weightGrams: 50,
    shortDescription: 'Eleven natural Gomti Chakra shells. Demo listing; sourcing not verified.',
    attributes: [['Count', '11']],
  },
  {
    sku: 'DEMO-BRC-001',
    slug: 'demo-rudraksha-bracelet',
    name: 'Rudraksha Bracelet, Elastic (Demo)',
    category: 'bracelets',
    priceRupees: 499,
    compareAtRupees: 599,
    stock: 2, // deliberately at the low-stock threshold, to exercise that UI
    weightGrams: 30,
    material: 'Rudraksha',
    shortDescription: 'Stretch-fit rudraksha bracelet. Demo listing.',
    attributes: [['Fit', 'Elastic, fits most wrists']],
  },
  {
    sku: 'DEMO-BRC-002',
    slug: 'demo-tiger-eye-bracelet',
    name: 'Tiger Eye Bead Bracelet (Demo)',
    category: 'bracelets',
    priceRupees: 699,
    stock: 0, // deliberately out of stock, to exercise that UI
    weightGrams: 35,
    material: 'Tiger eye stone',
    shortDescription: '8 mm tiger eye beads. Demo listing.',
    attributes: [['Bead size', '8 mm']],
  },
]

// Business decisions the owner has not made yet. Each value is a placeholder
// so the shop can run in development; the admin panel will flag every row
// with needsOwnerDecision until the owner confirms or changes it.
const settings: { key: string; value: Prisma.InputJsonValue; description: string }[] = [
  { key: 'shipping.flatPaise', value: rupees(79), description: 'Flat shipping charge per order' },
  { key: 'shipping.freeAbovePaise', value: rupees(999), description: 'Free shipping at or above this order value (after discount); null = never' },
  { key: 'cod.enabled', value: true, description: 'Whether Cash on Delivery is offered' },
  { key: 'cod.feePaise', value: rupees(49), description: 'COD handling fee added to COD orders' },
  { key: 'cod.minOrderPaise', value: rupees(199), description: 'Smallest order eligible for COD' },
  { key: 'cod.maxOrderPaise', value: rupees(10000), description: 'Largest order eligible for COD' },
  { key: 'returns.windowDays', value: 7, description: 'Days after delivery a return can be requested' },
  { key: 'cancellation.allowedUntil', value: 'BEFORE_SHIPMENT', description: 'Until when a customer can cancel themselves' },
  { key: 'tax.pricesIncludeGst', value: true, description: 'Product prices include GST (confirm with your CA)' },
  { key: 'business.legalName', value: '', description: 'Registered legal business name' },
  { key: 'business.address', value: '', description: 'Registered business address' },
  { key: 'business.gstin', value: '', description: 'GSTIN, if registered' },
  { key: 'support.email', value: '', description: 'Customer support email' },
  { key: 'support.phone', value: '', description: 'Customer support phone' },
  { key: 'support.whatsapp', value: '', description: 'WhatsApp number for the support button' },
  { key: 'support.hours', value: '', description: 'Support hours shown to customers' },
]

const legalPages = [
  ['privacy', 'Privacy Policy'],
  ['terms', 'Terms and Conditions'],
  ['shipping', 'Shipping Policy'],
  ['returns', 'Return and Refund Policy'],
  ['cancellation', 'Cancellation Policy'],
  ['authenticity', 'Product Authenticity and Sourcing'],
] as const

async function main() {
  if (process.env.SEED_ONLY_IF_EMPTY === 'true' && (await db.storeSetting.count()) > 0) {
    console.log('Shop already set up; seed skipped.')
    return
  }
  const categoryIds = new Map<string, string>()
  for (const c of categories) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, nameHi: c.nameHi, position: c.position },
      create: c,
    })
    categoryIds.set(c.slug, row.id)
  }

  for (const p of process.env.SEED_DEMO_PRODUCTS === 'false' ? [] : products) {
    const data = {
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      description: `${p.shortDescription}\n\nThis is a demonstration product for development. It is not a real listing.`,
      categoryId: categoryIds.get(p.category)!,
      pricePaise: rupees(p.priceRupees),
      compareAtPaise: p.compareAtRupees ? rupees(p.compareAtRupees) : null,
      gstRateBp: 0, // real rates to be confirmed with the owner's CA
      weightGrams: p.weightGrams,
      material: p.material ?? null,
      status: 'PUBLISHED' as const,
      isFeatured: p.isFeatured ?? false,
      isDemo: true,
      publishedAt: new Date(),
    }
    const product = await db.product.upsert({
      where: { sku: p.sku },
      update: data,
      create: { sku: p.sku, ...data },
    })

    await db.productAttribute.deleteMany({ where: { productId: product.id } })
    await db.productAttribute.createMany({
      data: p.attributes.map(([label, value], position) => ({ productId: product.id, label, value, position })),
    })

    // Stock is only set when the row is first created, so re-running the seed
    // never silently overwrites stock someone changed by hand.
    const existing = await db.inventory.findUnique({ where: { productId: product.id } })
    if (!existing) {
      await db.inventory.create({
        data: {
          productId: product.id,
          onHand: p.stock,
          movements: { create: { delta: p.stock, reason: 'MANUAL_ADJUSTMENT', note: 'Demo seed' } },
        },
      })
    }
  }

  for (const s of settings) {
    await db.storeSetting.upsert({
      where: { key: s.key },
      update: { description: s.description }, // never overwrite a value the owner has set
      create: { ...s, needsOwnerDecision: true },
    })
  }

  for (const provider of ['ITHINK', 'SHIPROCKET'] as const) {
    await db.shippingProviderConfig.upsert({
      where: { provider },
      update: {},
      create: { provider, isEnabled: false, isPrimary: provider === 'ITHINK', isVerified: false },
    })
  }

  for (const [slug, title] of legalPages) {
    await db.legalPage.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title,
        isPublished: false,
        bodyMarkdown:
          `# ${title}\n\n**Draft placeholder.** Divine Mantra must supply this text. ` +
          'It should be reviewed by a qualified professional before publishing. This is not legal advice.',
      },
    })
  }

  const ownerEmail = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase()
  if (ownerEmail) {
    // No password is set here. The owner signs in for the first time through
    // the password-reset flow, so no password ever appears in code or logs.
    await db.user.upsert({
      where: { email: ownerEmail },
      update: { role: 'OWNER' },
      create: { email: ownerEmail, role: 'OWNER', name: 'Store owner' },
    })
  }

  const counts = {
    categories: await db.category.count(),
    products: await db.product.count({ where: { isDemo: true } }),
    settingsAwaitingOwner: await db.storeSetting.count({ where: { needsOwnerDecision: true } }),
    legalDrafts: await db.legalPage.count({ where: { isPublished: false } }),
  }
  console.log('Seed complete:', counts)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
