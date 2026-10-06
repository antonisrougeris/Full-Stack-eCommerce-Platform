import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { ApiError } from "./apiError.js";

export const quantitySchema = z.coerce.number().int().min(1).max(99);
export const idSchema = z.string().trim().min(1).max(160);
export const noteSchema = z.string().trim().max(1000).optional().default("");

export const contactFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(5000),
});

const supportedCountries = [
  "GR", "CY", "GB", "DE", "FR", "IT", "ES", "US", "CA", "AU", "NL", "BE", "AT", "PT", "IE",
];

const phoneRules = {
  GR: { length: 10, prefix: /^69/ },
  CY: { length: 8, prefix: /^9/ },
  GB: { length: 10, prefix: /^7/ },
  DE: { length: 10 },
  FR: { length: 9, prefix: /^[67]/ },
  IT: { length: 9, prefix: /^3/ },
  ES: { length: 9, prefix: /^[6789]/ },
  US: { length: 10 },
  CA: { length: 10 },
  AU: { length: 9, prefix: /^4/ },
  NL: { length: 9, prefix: /^6/ },
  BE: { length: 9, prefix: /^4/ },
  AT: { length: 10 },
  PT: { length: 9, prefix: /^9/ },
  IE: { length: 9, prefix: /^8/ },
};

const countrySchema = z.enum(supportedCountries);
const requiredPhoneSchema = z.string().trim().min(1).max(40);

function validPhoneForCountry(phone, countryCode) {
  const parsed = parsePhoneNumberFromString(phone, countryCode);
  const rule = phoneRules[countryCode];
  const nationalNumber = parsed?.nationalNumber || "";
  return Boolean(
    parsed?.isValid() &&
      rule &&
      nationalNumber.length === rule.length &&
      (!rule.prefix || rule.prefix.test(nationalNumber))
  );
}

function validPostalCodeForCountry(postalCode, countryCode) {
  const patterns = {
    GR: /^\d{5}$/,
    CY: /^\d{4}$/,
    GB: /^[A-Z0-9 ]{5,8}$/i,
    DE: /^\d{5}$/,
    FR: /^\d{5}$/,
    IT: /^\d{5}$/,
    ES: /^\d{5}$/,
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i,
    AU: /^\d{4}$/,
    NL: /^\d{4}\s?[A-Z]{2}$/i,
    BE: /^\d{4}$/,
    AT: /^\d{4}$/,
    PT: /^\d{4}-?\d{3}$/,
    IE: /^[A-Z0-9 ]{3,7}$/i,
  };

  return patterns[countryCode]?.test(postalCode) ?? false;
}

const invoiceDetailsSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  vatNumber: z.string().trim().min(1).max(20),
  taxOffice: z.string().trim().min(1).max(120),
  activity: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(180),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(20),
});

export const giftOptionsSchema = z.object({
  tier: z.enum(["none", "simple", "premium"]).optional(),
  giftBox: z.boolean().optional(),
  personalNote: z.string().trim().max(200).optional().default(""),
}).transform((value) => {
  const tier =
    value.tier ||
    (value.giftBox ? "premium" : "none");

  return {
    tier,
    giftBox: tier === "premium",
    personalNote:
      tier === "premium"
        ? value.personalNote
        : "",
  };
});

export const checkoutSchema = z.object({
  locale: z.enum(["en", "el"]).optional().default("en"),
  phoneCountryCode: countrySchema.default("GR"),

  customer: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(254),
    phone: requiredPhoneSchema,
  }),

  shippingAddress: z.object({
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().max(40).optional(),

    country: z.string().trim().max(80).optional().default(""),
    city: z.string().trim().max(120).optional().default(""),
    postalCode: z.string().trim().max(20).optional().default(""),
    addressLine1: z.string().trim().max(180).optional().default(""),
    addressLine2: z.string().trim().max(180).optional().default(""),
  }),

  delivery: z.enum(["home"]).optional().default("home"),

  locker: z.string().trim().max(160).optional().nullable(),

  documentType: z.enum(["receipt", "invoice"]).optional().default("receipt"),

  invoiceDetails: invoiceDetailsSchema.optional().nullable(),

  notes: z.string().trim().max(1000).optional().default(""),

  giftOptions: giftOptionsSchema.optional().default({
    tier: "none",
    giftBox: false,
    personalNote: "",
  }),
}).superRefine((checkout, context) => {
  const countryCode = checkout.phoneCountryCode;

  // Customer phone is always required and must be valid
  if (!validPhoneForCountry(checkout.customer.phone, countryCode)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customer", "phone"],
      message: "Phone number is invalid for the selected country",
    });
  }

  // Validate shipping phone only if one was supplied
  if (
    checkout.shippingAddress.phone &&
    !validPhoneForCountry(checkout.shippingAddress.phone, countryCode)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shippingAddress", "phone"],
      message: "Phone number is invalid for the selected country",
    });
  }

  if (checkout.documentType === "invoice" && !checkout.invoiceDetails) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["invoiceDetails"],
      message: "Invoice details are required",
    });
  }

  // Standard home delivery requires a complete shipping address
  const { country, city, postalCode, addressLine1 } =
    checkout.shippingAddress;

  if (!country) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shippingAddress", "country"],
      message: "Country is required",
    });
  }

  if (!city || city.length < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shippingAddress", "city"],
      message: "City is required",
    });
  }

  if (!addressLine1 || addressLine1.length < 5) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shippingAddress", "addressLine1"],
      message: "Address is required",
    });
  }

  const addressCountry =
    supportedCountries.find((code) => code === country) ||
    ({
      Greece: "GR",
      Cyprus: "CY",
      "United Kingdom": "GB",
      Germany: "DE",
      France: "FR",
      Italy: "IT",
      Spain: "ES",
      "United States": "US",
      Canada: "CA",
      Australia: "AU",
      Netherlands: "NL",
      Belgium: "BE",
      Austria: "AT",
      Portugal: "PT",
      Ireland: "IE",
    })[country];

  if (
    !postalCode ||
    !addressCountry ||
    !validPostalCodeForCountry(postalCode, addressCountry)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shippingAddress", "postalCode"],
      message: "Postal code is invalid for the selected country",
    });
  }
});

export function parseOrThrow(schema, value, message = "Invalid request body") {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, message, result.error.flatten());
  }
  return result.data;
}

export function normalizeUrlOrThrow(value, field = "url") {
  const raw = String(value || "").trim();
  if (!raw) throw new ApiError(400, `${field} is required`);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, `${field} must be a valid URL`);
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new ApiError(400, `${field} must use http or https`);
  }

  return url.toString();
}

export function assertString(value, field = "value") {
  const result = String(value || "").trim();

  if (!result) {
    throw new ApiError(400, `${field} is required`);
  }

  return result;
}

export function assertPositiveInteger(value, field = "value") {
  const num = Number(value);

  if (!Number.isInteger(num) || num < 1) {
    throw new ApiError(400, `${field} must be a positive integer`);
  }

  return num;
}

export function optionalUrl(value, field = "url") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return normalizeUrlOrThrow(value, field);
}

export function normalizeVariantInput(value) {
  if (!value) {
    return null;
  }

  if (typeof value !== "object") {
    throw new ApiError(400, "variant must be an object");
  }

  return {
    sku: String(value.sku || "").trim(),
    size: String(value.size || "").trim(),
    color: String(value.color || "").trim(),
  };
}
