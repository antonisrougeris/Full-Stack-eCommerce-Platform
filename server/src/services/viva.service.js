import { ApiError } from "../utils/apiError.js";

const VIVA_DEMO_API = "https://demo-api.vivapayments.com";
const VIVA_LIVE_API = "https://api.vivapayments.com";

const VIVA_DEMO_ACCOUNTS = "https://demo-accounts.vivapayments.com";
const VIVA_LIVE_ACCOUNTS = "https://accounts.vivapayments.com";

const VIVA_DEMO_CHECKOUT = "https://demo.vivapayments.com/web2";
const VIVA_LIVE_CHECKOUT = "https://www.vivapayments.com/web/checkout";

function isLive() {
  return process.env.VIVA_ENV === "live";
}

function getVivaBaseApi() {
  return process.env.VIVA_API_BASE || (isLive() ? VIVA_LIVE_API : VIVA_DEMO_API);
}

function getVivaAccountsBase() {
  return isLive() ? VIVA_LIVE_ACCOUNTS : VIVA_DEMO_ACCOUNTS;
}

function getVivaCheckoutBase() {
  return process.env.VIVA_CHECKOUT_BASE || (isLive() ? VIVA_LIVE_CHECKOUT : VIVA_DEMO_CHECKOUT);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function getVivaWebBase() {
  return isLive()
    ? "https://www.vivapayments.com"
    : "https://demo.vivapayments.com";
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function getVivaAccessToken() {
  const clientId = getRequiredEnv("VIVA_CLIENT_ID");
  const clientSecret = getRequiredEnv("VIVA_CLIENT_SECRET");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(`${getVivaAccountsBase()}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    console.error("Viva auth failed:", response.status, payload);
    throw new ApiError(502, `Failed to authenticate with Viva (${response.status})`, payload);
  }

  if (!payload?.access_token) {
    throw new ApiError(502, "Viva did not return access token", payload);
  }

  return payload.access_token;
}

export async function createVivaPaymentOrder(order) {
  const token = await getVivaAccessToken();

  const sourceCode = process.env.VIVA_SOURCE_CODE || null;
  const publicBaseUrl = getRequiredEnv("PUBLIC_BASE_URL");

  const amountInCents = Math.round(Number(order.total || 0) * 100);

  if (!Number.isInteger(amountInCents) || amountInCents < 1) {
    throw new ApiError(400, "Invalid payment amount");
  }
const successUrl =
  `${publicBaseUrl}/payment/success?orderId=${encodeURIComponent(
    order.id
  )}`;

const failureUrl =
  `${publicBaseUrl}/payment/failure?orderId=${encodeURIComponent(
    order.id
  )}`;

  const body = {
    amount: amountInCents,
    customerTrns: `Order ${order.orderNumber}`,
    merchantTrns: order.id,

    customer: {
      email: order.customer.email,
      fullName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      phone: order.customer.phone || "",
      countryCode: order.customer.phoneCountryCode || "GR",
      requestLang: "el-GR",
    },

    paymentTimeout: 1800,
    preauth: false,
    allowRecurring: false,
    maxInstallments: 0,
    paymentNotification: true,
    tipAmount: 0,
    disableExactAmount: false,
    disableCash: true,
    disableWallet: false,

    tags: [process.env.STORE_SLUG || "novastore", order.id],

    successUrl,
    failureUrl,
    redirectUrl: successUrl,
    cancelUrl: failureUrl,

    ...(sourceCode ? { sourceCode } : {}),
  };

  const response = await fetch(`${getVivaBaseApi()}/checkout/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    console.error("Viva create order failed:", response.status, payload);
    throw new ApiError(502, `Failed to create Viva payment order (${response.status})`, payload);
  }

  const orderCode = String(
    payload?.orderCode ||
      payload?.OrderCode ||
      payload?.order?.orderCode ||
      payload?.order?.OrderCode ||
      ""
  );

  if (!orderCode) {
    throw new ApiError(502, "Viva did not return an order code", payload);
  }

  console.log("====================================");
  console.log("VIVA CREATE ORDER PAYLOAD:", payload);
  console.log("VIVA ORDER CODE:", orderCode);
  console.log("TYPE:", typeof orderCode);
  console.log("====================================");
  return {
    vivaOrderCode: orderCode,
    checkoutUrl: `${getVivaCheckoutBase()}?ref=${encodeURIComponent(
      orderCode
    )}`,
    raw: payload,
  };
}

export async function getVivaWebhookVerificationKey() {
  const merchantId = getRequiredEnv("VIVA_MERCHANT_ID");
  const apiKey = getRequiredEnv("VIVA_API_KEY");

  const credentials = Buffer.from(`${merchantId}:${apiKey}`).toString("base64");

  const response = await fetch(
    `${getVivaWebBase()}/api/messages/config/token`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    }
  );

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error("Viva webhook key failed:", response.status, payload);
    throw new ApiError(502, "Failed to get Viva webhook key", payload);
  }

  return payload;
}


export async function retrieveVivaTransaction(transactionId) {
  const id = String(transactionId || "").trim();

  if (!id) {
    throw new ApiError(400, "Missing Viva transaction id");
  }

  const token = await getVivaAccessToken();

  const response = await fetch(
    `${getVivaBaseApi()}/checkout/v2/transactions/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    console.error("Viva retrieve transaction failed:", response.status, payload);
    throw new ApiError(
      502,
      `Failed to verify Viva transaction (${response.status})`,
      payload
    );
  }

  return payload;
}

export function validateVivaWebhookTransaction(payload, transaction) {
  const data = payload?.EventData || payload?.eventData || payload?.data || payload || {};

  const webhookOrderCode = String(
    data?.OrderCode ||
      data?.orderCode ||
      data?.OrderId ||
      data?.orderId ||
      ""
  ).trim();

  const providerOrderCode = String(
    transaction?.orderCode ||
      transaction?.OrderCode ||
      ""
  ).trim();

  const webhookStatus = String(
    data?.StatusId ||
      data?.statusId ||
      data?.StatusID ||
      data?.statusID ||
      ""
  ).trim().toUpperCase();

  const providerStatus = String(
    transaction?.statusId ||
      transaction?.StatusId ||
      ""
  ).trim().toUpperCase();

  const webhookAmountCents = Math.round(
    Number(data?.Amount ?? data?.amount ?? 0) * 100
  );

  const providerAmountCents = Math.round(
    Number(transaction?.amount ?? transaction?.Amount ?? 0) * 100
  );

  if (
    !webhookOrderCode ||
    !providerOrderCode ||
    webhookOrderCode !== providerOrderCode ||
    webhookStatus !== providerStatus ||
    !webhookAmountCents ||
    webhookAmountCents !== providerAmountCents
  ) {
    throw new ApiError(400, "Viva webhook verification mismatch");
  }

  if (providerStatus !== "F") {
    throw new ApiError(400, "Viva transaction is not completed");
  }

  return transaction;
}

export async function verifyVivaWebhookWithProvider(payload) {
  const data = payload?.EventData || payload?.eventData || payload?.data || payload || {};

  const transactionId = String(
    data?.TransactionId ||
      data?.transactionId ||
      data?.TransactionID ||
      data?.transactionID ||
      ""
  ).trim();

  if (!transactionId) {
    throw new ApiError(400, "Viva webhook is missing transaction id");
  }

  const transaction = await retrieveVivaTransaction(transactionId);

  return validateVivaWebhookTransaction(payload, transaction);
}

