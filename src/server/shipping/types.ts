// The common shape every courier integration fits. Each provider adapter
// turns these calls into that provider's documented API and nothing more.

export type Parcel = {
  /** Our order number. Sent as the courier's order reference, so the provider also sees a repeat. */
  orderNumber: string
  orderDate: Date
  paymentMode: 'COD' | 'PREPAID'
  totalPaise: number
  codAmountPaise: number
  shippingPaise: number
  discountPaise: number
  weightGrams: number
  lengthCm: number
  breadthCm: number
  heightCm: number
  customer: { name: string; phone: string; email: string | null; line1: string; line2: string | null; city: string; state: string; pincode: string }
  items: { name: string; sku: string; quantity: number; unitPricePaise: number; gstRateBp: number }[]
}

export type CreatedShipment = {
  awbNumber: string
  providerShipmentId: string | null
  courierName: string | null
  trackingUrl: string | null
}

export type TrackingScan = { status: string; code: string | null; location: string | null; remark: string | null; occurredAt: Date }

export type TrackingResult = {
  awbNumber: string
  currentStatus: string
  currentCode: string | null
  expectedDelivery: Date | null
  scans: TrackingScan[]
}

/** The courier answered and refused: nothing was created, so it is safe to fix and try again. */
export class ProviderRejected extends Error {}

/**
 * We do not know what happened (timeout, network error, unreadable reply).
 * A parcel may or may not exist at the courier, so we never retry blindly.
 */
export class ProviderUnknown extends Error {
  /** What we did learn before losing track, such as the courier's own order id. */
  constructor(
    message: string,
    readonly partial?: { providerShipmentId?: string },
  ) {
    super(message)
  }
}

export interface ShippingProvider {
  readonly name: 'ITHINK' | 'SHIPROCKET'
  readonly label: string
  createShipment(parcel: Parcel): Promise<CreatedShipment>
  /** Null when this provider's tracking is not supported here; staff use the tracking link. */
  track: ((awbNumbers: string[]) => Promise<TrackingResult[]>) | null
  cancel(shipment: { awbNumber: string | null; providerShipmentId: string | null }): Promise<void>
  /** A PDF address for the shipping label, when the provider offers one. */
  labelPdf: ((awbNumber: string) => Promise<string | null>) | null
}
