import 'server-only'
import { db } from './db'

export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
  const item = await db.wishlistItem.findFirst({ where: { productId, wishlist: { userId } }, select: { id: true } })
  return item !== null
}

/** Adds or removes the product. Returns whether it is now saved. */
export async function setWishlisted(userId: string, productId: string, saved: boolean): Promise<boolean> {
  if (!saved) {
    await db.wishlistItem.deleteMany({ where: { productId, wishlist: { userId } } })
    return false
  }
  const product = await db.product.findFirst({ where: { id: productId, status: 'PUBLISHED' }, select: { id: true } })
  if (!product) return false
  const wishlist = await db.wishlist.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } })
  const count = await db.wishlistItem.count({ where: { wishlistId: wishlist.id } })
  if (count >= 100) return false
  await db.wishlistItem.createMany({ data: [{ wishlistId: wishlist.id, productId }], skipDuplicates: true })
  return true
}

/** Saved products that are still for sale, newest first. */
export async function listWishlist(userId: string) {
  const items = await db.wishlistItem.findMany({
    where: { wishlist: { userId }, product: { status: 'PUBLISHED' } },
    orderBy: { createdAt: 'desc' },
    select: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          shortDescription: true,
          pricePaise: true,
          compareAtPaise: true,
          isDemo: true,
          lowStockThreshold: true,
          images: { select: { key: true, alt: true }, orderBy: { position: 'asc' }, take: 1 },
          inventory: { select: { onHand: true, reserved: true } },
          category: { select: { slug: true, name: true } },
        },
      },
    },
  })
  return items.map((i) => i.product)
}
