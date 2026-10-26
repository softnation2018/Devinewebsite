import 'server-only'
import { ithink } from './ithink'
import { shiprocket } from './shiprocket'
import type { ShippingProvider } from './types'

// Couriers are switched on only by their credentials being present in the
// environment. Nothing is assumed to work until a real call succeeds.

export function configuredProviders(): ShippingProvider[] {
  const out: ShippingProvider[] = []
  const e = process.env
  if (e.ITHINK_ACCESS_TOKEN && e.ITHINK_SECRET_KEY && e.ITHINK_PICKUP_ADDRESS_ID && e.ITHINK_RETURN_ADDRESS_ID) {
    out.push(
      ithink({
        baseUrl: (e.ITHINK_BASE_URL || 'https://my.ithinklogistics.com/api_v3').replace(/\/$/, ''),
        trackBaseUrl: (e.ITHINK_TRACK_BASE_URL || 'https://api.ithinklogistics.com/api_v3').replace(/\/$/, ''),
        accessToken: e.ITHINK_ACCESS_TOKEN,
        secretKey: e.ITHINK_SECRET_KEY,
        pickupAddressId: e.ITHINK_PICKUP_ADDRESS_ID,
        returnAddressId: e.ITHINK_RETURN_ADDRESS_ID,
      }),
    )
  }
  if (e.SHIPROCKET_EMAIL && e.SHIPROCKET_PASSWORD && e.SHIPROCKET_PICKUP_LOCATION) {
    out.push(
      shiprocket({
        baseUrl: (e.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external').replace(/\/$/, ''),
        email: e.SHIPROCKET_EMAIL,
        password: e.SHIPROCKET_PASSWORD,
        pickupLocation: e.SHIPROCKET_PICKUP_LOCATION,
      }),
    )
  }
  return out
}

export function providerByName(name: string, providers = configuredProviders()): ShippingProvider | null {
  return providers.find((p) => p.name === name) ?? null
}
