import { apiRequest } from "./api";

export interface CheckoutCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface CheckoutShippingAddress {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  country?: string;
  city: string;
  postalCode?: string;
  addressLine1: string;
  addressLine2?: string;
}

export interface CheckoutInvoiceDetails {
  companyName: string;
  vatNumber: string;
  taxOffice: string;
  activity: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface CheckoutPayload {
  locale?: "en" | "el";
  customer: CheckoutCustomer;
  shippingAddress: CheckoutShippingAddress;
  phoneCountryCode: string;
  delivery?: "home";
  notes?: string;
  giftOptions?: {
    tier: "none" | "simple" | "premium";
    giftBox?: boolean;
    personalNote: string;
  };
  documentType?: "receipt" | "invoice";
  invoiceDetails?: CheckoutInvoiceDetails | null;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber?: string;
  order?: unknown;
  vivaOrderCode?: string;
  checkoutUrl?: string;
}

export async function checkout(
  payload: CheckoutPayload
): Promise<CheckoutResult> {
  const res = await apiRequest<CheckoutResult | { data: CheckoutResult }>(
    "/checkout",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  if ("data" in res && res.data) {
    return res.data;
  }

  return res as CheckoutResult;
}
