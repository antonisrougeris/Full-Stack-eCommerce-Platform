import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";

/* ==================================================
   TOKEN CACHE
================================================== */

let cachedToken = null;
let cachedTokenExpiresAt = 0;

/* ==================================================
   CONFIG
================================================== */

function getBoxNowMode() {
  return String(
    process.env.BOXNOW_MODE || "mock"
  )
    .trim()
    .toLowerCase();
}

function isMockMode() {
  return getBoxNowMode() === "mock";
}

function getEnvironmentLabel() {
  const mode = getBoxNowMode();

  if (mode === "stage") {
    return "stage";
  }

  if (mode === "production") {
    return "production";
  }

  return "mock";
}

function getConfig() {
  return {
    mode:
      getBoxNowMode(),

    apiUrl:
      String(
        process.env.BOXNOW_API_URL || ""
      )
        .trim()
        .replace(/\/+$/, ""),

    clientId:
      String(
        process.env.BOXNOW_CLIENT_ID || ""
      ).trim(),

    clientSecret:
      String(
        process.env.BOXNOW_CLIENT_SECRET || ""
      ).trim(),

    partnerId:
      String(
        process.env.BOXNOW_PARTNER_ID || ""
      ).trim(),

    originId:
      String(
        process.env.BOXNOW_ORIGIN_ID || ""
      ).trim(),

    returnDestinationId:
      String(
        process.env.BOXNOW_RETURN_DESTINATION_ID ||
        process.env.BOXNOW_ORIGIN_ID ||
        ""
      ).trim(),

    defaultCompartmentSize:
      Number(
        process.env.BOXNOW_DEFAULT_COMPARTMENT_SIZE || 1
      ),

    webhookSecret:
      String(
        process.env.BOXNOW_WEBHOOK_SECRET || ""
      ).trim(),
  };
}

function assertRealConfig() {
  if (isMockMode()) {
    return;
  }

  const {
    apiUrl,
    clientId,
    clientSecret,
  } = getConfig();

  if (
    !apiUrl ||
    !clientId ||
    !clientSecret
  ) {
    throw new ApiError(
      500,
      "BOX NOW is not configured"
    );
  }
}

/* ==================================================
   HELPERS
================================================== */

function normalizeMoney(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return "0.00";
  }

  return number.toFixed(2);
}

function normalizeCompartmentSize(
  value
) {
  const size =
    Number(value);

  if (![1, 2, 3].includes(size)) {
    throw new ApiError(
      500,
      "BOX NOW compartment size must be 1, 2 or 3"
    );
  }

  return size;
}

function getLockerId(order) {
  if (
    typeof order?.locker === "string"
  ) {
    return order.locker.trim();
  }

  return String(
    order?.locker?.id ||
    order?.locker?.boxnowLockerId ||
    ""
  ).trim();
}

function getCustomerName(order) {
  return [
    order?.customer?.firstName,
    order?.customer?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function resolveConfiguredOriginId(
  overrideOriginId
) {
  const {
    originId,
  } = getConfig();

  const resolved =
    String(
      overrideOriginId ||
      originId ||
      ""
    ).trim();

  if (!resolved) {
    throw new ApiError(
      500,
      "BOX NOW origin is not configured"
    );
  }

  return resolved;
}

/* ==================================================
   MOCK
================================================== */

function createMockParcelId() {
  return (
    "MOCK-BN-" +
    Date.now()
      .toString(36)
      .toUpperCase()
  );
}

function createMockDelivery(
  order
) {
  const parcelId =
    createMockParcelId();

  const createdAt =
    nowIso();

  return {
    mock:
      true,

    id:
      `MOCK-DELIVERY-${Date.now()}`,

    orderNumber:
      order.orderNumber,

    parcels: [
      {
        id:
          parcelId,
      },
    ],

    status:
      "new",

    trackingNumber:
      parcelId,

    trackingUrl:
      `/mock/boxnow/${parcelId}`,

    createdAt,
  };
}

/* ==================================================
   AUTH
================================================== */

async function getAccessToken() {
  if (isMockMode()) {
    return "mock-token";
  }

  assertRealConfig();

  const {
    apiUrl,
    clientId,
    clientSecret,
  } = getConfig();

  console.info(
    `BOX NOW using ${getEnvironmentLabel()} environment`
  );

  if (
    cachedToken &&
    Date.now() <
      cachedTokenExpiresAt -
        60_000
  ) {
    return cachedToken;
  }

  const response =
    await fetch(
      `${apiUrl}/api/v1/auth-sessions`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            grant_type:
              "client_credentials",

            client_id:
              clientId,

            client_secret:
              clientSecret,
          }),
      }
    );

  const body =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    console.error(
      "BOX NOW authentication failed",
      {
        status:
          response.status,

        body,
      }
    );

    throw new ApiError(
      502,
      `BOX NOW authentication failed (${response.status})`
    );
  }

  cachedToken =
    body?.access_token ||
    body?.accessToken ||
    body?.token;

  if (!cachedToken) {
    throw new ApiError(
      502,
      "BOX NOW did not return access token"
    );
  }

  const expiresIn =
    Number(
      body?.expires_in ||
      body?.expiresIn ||
      3600
    );

  cachedTokenExpiresAt =
    Date.now() +
    expiresIn * 1000;

  return cachedToken;
}

/* ==================================================
   GENERIC JSON REQUEST
================================================== */

async function boxNowRequest(
  path,
  {
    method = "GET",
    body,
  } = {}
) {
  assertRealConfig();

  const {
    apiUrl,
    partnerId,
  } = getConfig();

  const token =
    await getAccessToken();

  const response =
    await fetch(
      `${apiUrl}${path}`,
      {
        method,

        headers: {
          Accept:
            "application/json",

          Authorization:
            `Bearer ${token}`,

          ...(partnerId
            ? {
                "X-PartnerID":
                  partnerId,
              }
            : {}),

          ...(body
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),
        },

        ...(body
          ? {
              body:
                JSON.stringify(
                  body
                ),
            }
          : {}),
      }
    );

  const responseBody =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    console.error(
      "BOX NOW request failed",
      {
        environment:
          getEnvironmentLabel(),

        path,

        method,

        status:
          response.status,

        body:
          responseBody,
      }
    );

    const providerCode =
      responseBody?.code ||
      responseBody?.errorCode ||
      null;

    const providerMessage =
      responseBody?.message ||
      responseBody?.error ||
      null;

    throw new ApiError(
      502,
      [
        "BOX NOW request failed",
        providerCode,
        providerMessage,
      ]
        .filter(Boolean)
        .join(" - ")
    );
  }

  return responseBody;
}

/* ==================================================
   PARTNER
================================================== */

export async function getBoxNowEntrustedPartners() {
  if (isMockMode()) {
    return [];
  }

  return boxNowRequest(
    "/api/v1/entrusted-partners"
  );
}

/* ==================================================
   ORIGINS
================================================== */

export async function getBoxNowOrigins() {
  if (isMockMode()) {
    return {
      mock:
        true,

      data:
        [],
    };
  }

  return boxNowRequest(
    "/api/v1/origins"
  );
}

/* ==================================================
   DESTINATIONS
================================================== */

export async function getBoxNowDestinations(
  params = {}
) {
  if (isMockMode()) {
    return {
      mock:
        true,

      data:
        [],
    };
  }

  const searchParams =
    new URLSearchParams();

  if (params.latlng) {
    searchParams.set(
      "latlng",
      String(params.latlng)
    );
  }

  if (params.radius) {
    searchParams.set(
      "radius",
      String(params.radius)
    );
  }

  if (params.requiredSize) {
    searchParams.set(
      "requiredSize",
      String(params.requiredSize)
    );
  }

  if (params.name) {
    searchParams.set(
      "name",
      String(params.name)
    );
  }

  if (params.limit) {
    searchParams.set(
      "limit",
      String(params.limit)
    );
  }

  const query =
    searchParams.toString();

  return boxNowRequest(
    `/api/v1/destinations${
      query
        ? `?${query}`
        : ""
    }`
  );
}

/* ==================================================
   BUILD DELIVERY REQUEST
================================================== */

function buildBoxNowDeliveryPayload(
  order,
  {
    originId,
    compartmentSize,
  }
) {
  const lockerId =
    getLockerId(order);

  if (!lockerId) {
    throw new ApiError(
      400,
      "BOX NOW destination locker is missing"
    );
  }

  const customerName =
    getCustomerName(order);

  const customerEmail =
    String(
      order?.customer?.email || ""
    ).trim();

  const customerPhone =
    String(
      order?.customer?.phone || ""
    ).trim();

  if (!customerName) {
    throw new ApiError(
      400,
      "BOX NOW customer name is missing"
    );
  }

  if (!customerEmail) {
    throw new ApiError(
      400,
      "BOX NOW customer email is missing"
    );
  }

  if (!customerPhone) {
    throw new ApiError(
      400,
      "BOX NOW customer phone is missing"
    );
  }

  if (!order?.orderNumber) {
    throw new ApiError(
      400,
      "BOX NOW order number is missing"
    );
  }

  const invoiceValue =
    normalizeMoney(
      order.total
    );

  /*
   * For now:
   * One Skanare order = one BOX NOW parcel.
   *
   * compartmentSize is required because Stage origin 2
   * is Any-APM.
   */

  return {
    orderNumber:
      String(
        order.orderNumber
      ),

    description:
      `Skanare order ${order.orderNumber}`,

    invoiceValue,

    paymentMode:
      "prepaid",

    amountToBeCollected:
      "0.00",

    allowReturn:
      false,

    origin: {
      locationId:
        String(originId),
    },

    destination: {
      locationId:
        String(lockerId),

      contactNumber:
        customerPhone,

      contactEmail:
        customerEmail,

      contactName:
        customerName,
    },

    items: [
      {
        id:
          String(
            order.orderNumber
          ),

        name:
          `Skanare order ${order.orderNumber}`,

        value:
          invoiceValue,

        compartmentSize,
      },
    ],
  };
}

/* ==================================================
   CREATE DELIVERY
================================================== */

export async function createBoxNowDelivery(
  order,
  options = {}
) {
  if (!order) {
    throw new ApiError(
      400,
      "Missing order"
    );
  }

  if (
    order.delivery !== "boxnow"
  ) {
    return null;
  }

  if (isMockMode()) {
    console.log(
      "BOX NOW MOCK delivery created",
      {
        orderId:
          order.id,

        orderNumber:
          order.orderNumber,
      }
    );

    return createMockDelivery(
      order
    );
  }

  const config =
    getConfig();

  const originId =
    resolveConfiguredOriginId(
      options.originId
    );

  const compartmentSize =
    normalizeCompartmentSize(
      options.compartmentSize ||
      config.defaultCompartmentSize
    );

  const payload =
    buildBoxNowDeliveryPayload(
      order,
      {
        originId,
        compartmentSize,
      }
    );

  console.log(
    "BOX NOW creating delivery",
    {
      environment:
        getEnvironmentLabel(),

      orderNumber:
        order.orderNumber,

      originId,

      destinationId:
        getLockerId(order),

      compartmentSize,
    }
  );

  const result =
    await boxNowRequest(
      "/api/v1/delivery-requests",
      {
        method:
          "POST",

        body:
          payload,
      }
    );

  console.log(
    "BOX NOW delivery created",
    {
      environment:
        getEnvironmentLabel(),

      orderNumber:
        order.orderNumber,

      deliveryRequestId:
        result?.id ||
        null,

      parcelIds:
        Array.isArray(
          result?.parcels
        )
          ? result.parcels.map(
              (parcel) =>
                parcel.id
            )
          : [],
    }
  );

  return result;
}


/* ==================================================
   CUSTOMER RETURN DELIVERY
================================================== */

export async function createBoxNowCustomerReturn(
  returnRequest,
  order
) {
  if (!returnRequest || !order) {
    throw new ApiError(400, "Missing return request or order");
  }

  if (isMockMode()) {
    const parcelId = createMockParcelId();

    return {
      mock: true,
      id: `MOCK-RETURN-${Date.now()}`,
      orderNumber: `MOCK-${returnRequest.returnNumber}`,
      labels: [],
      parcels: [{ id: parcelId, labels: [] }],
    };
  }

  const config = getConfig();
  const destinationId = String(
    config.returnDestinationId || config.originId || ""
  ).trim();

  if (!destinationId) {
    throw new ApiError(500, "BOX NOW return destination is not configured");
  }

  const contactName = getCustomerName(order);
  const contactEmail = String(order?.customer?.email || "").trim();
  const contactPhone = String(order?.customer?.phone || "").trim();

  if (!contactName || !contactEmail || !contactPhone) {
    throw new ApiError(
      400,
      "Customer contact details are incomplete for BOX NOW return"
    );
  }

  const payload = {
    sender: {
      contactPhoneNumber: contactPhone,
      contactEmail,
      contactName,
    },
    destination: {
      locationId: destinationId,
    },
    parcels: [
      {
        id: String(returnRequest.returnNumber),
        name: `Skanare return ${returnRequest.orderNumber}`,
        value: normalizeMoney(returnRequest.refundEstimate),
        weight: 0,
        size: normalizeCompartmentSize(config.defaultCompartmentSize),
      },
    ],
  };

  console.log("BOX NOW creating customer return", {
    environment: getEnvironmentLabel(),
    returnId: returnRequest.id,
    returnNumber: returnRequest.returnNumber,
    destinationId,
  });

  return boxNowRequest(
    "/api/v1/delivery-requests:customerReturns",
    {
      method: "POST",
      body: payload,
    }
  );
}

/* ==================================================
   TRACKING / PARCEL SEARCH
================================================== */

export async function getBoxNowParcel({
  orderNumber,
  parcelId,
}) {
  if (isMockMode()) {
    return {
      mock:
        true,

      parcelId:
        parcelId ||
        null,

      orderNumber:
        orderNumber ||
        null,

      status:
        "in-depot",
    };
  }

  const params =
    new URLSearchParams();

  if (orderNumber) {
    params.set(
      "orderNumber",
      String(orderNumber)
    );
  }

  if (parcelId) {
    params.set(
      "parcelId",
      String(parcelId)
    );
  }

  const query =
    params.toString();

  return boxNowRequest(
    `/api/v1/parcels${
      query
        ? `?${query}`
        : ""
    }`
  );
}

/* ==================================================
   PARCEL LABEL / VOUCHER PDF
================================================== */

export async function getBoxNowParcelLabel(
  parcelId
) {
  if (!parcelId) {
    throw new ApiError(
      400,
      "Missing BOX NOW parcel id"
    );
  }

  if (isMockMode()) {
    throw new ApiError(
      400,
      "BOX NOW label is not available in mock mode"
    );
  }

  assertRealConfig();

  const {
    apiUrl,
    partnerId,
  } = getConfig();

  const token =
    await getAccessToken();

  const response =
    await fetch(
      `${apiUrl}/api/v1/parcels/${encodeURIComponent(
        String(parcelId)
      )}/label.pdf`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/pdf",

          Authorization:
            `Bearer ${token}`,

          ...(partnerId
            ? {
                "X-PartnerID":
                  partnerId,
              }
            : {}),
        },
      }
    );

  if (!response.ok) {
    const errorText =
      await response
        .text()
        .catch(
          () => ""
        );

    console.error(
      "BOX NOW label request failed",
      {
        environment:
          getEnvironmentLabel(),

        parcelId,

        status:
          response.status,

        body:
          errorText,
      }
    );

    throw new ApiError(
      502,
      `BOX NOW label request failed (${response.status})`
    );
  }

  const arrayBuffer =
    await response
      .arrayBuffer();

  return Buffer.from(
    arrayBuffer
  );
}

/* ==================================================
   ORDER LABEL / ALL PARCELS PDF
================================================== */

export async function getBoxNowOrderLabel(
  orderNumber
) {
  if (!orderNumber) {
    throw new ApiError(
      400,
      "Missing BOX NOW order number"
    );
  }

  if (isMockMode()) {
    throw new ApiError(
      400,
      "BOX NOW label is not available in mock mode"
    );
  }

  assertRealConfig();

  const {
    apiUrl,
    partnerId,
  } = getConfig();

  const token =
    await getAccessToken();

  const response =
    await fetch(
      `${apiUrl}/api/v1/delivery-requests/${encodeURIComponent(
        String(orderNumber)
      )}/label.pdf`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/pdf",

          Authorization:
            `Bearer ${token}`,

          ...(partnerId
            ? {
                "X-PartnerID":
                  partnerId,
              }
            : {}),
        },
      }
    );

  if (!response.ok) {
    const errorText =
      await response
        .text()
        .catch(
          () => ""
        );

    console.error(
      "BOX NOW order label request failed",
      {
        environment:
          getEnvironmentLabel(),

        orderNumber,

        status:
          response.status,

        body:
          errorText,
      }
    );

    throw new ApiError(
      502,
      `BOX NOW order label request failed (${response.status})`
    );
  }

  return Buffer.from(
    await response
      .arrayBuffer()
  );
}

/* ==================================================
   CANCEL PARCEL
================================================== */

export async function cancelBoxNowParcel(
  parcelId
) {
  if (!parcelId) {
    throw new ApiError(
      400,
      "Missing BOX NOW parcel id"
    );
  }

  if (isMockMode()) {
    return {
      mock:
        true,

      parcelId,

      canceled:
        true,
    };
  }

  return boxNowRequest(
    `/api/v1/parcels/${encodeURIComponent(
      String(parcelId)
    )}:cancel`,
    {
      method:
        "POST",
    }
  );
}

/* ==================================================
   SERVICE INFO
================================================== */

export function getBoxNowServiceInfo() {
  const config =
    getConfig();

  return {
    mode:
      config.mode,

    environment:
      getEnvironmentLabel(),

    apiUrl:
      config.apiUrl,

    partnerConfigured:
      Boolean(
        config.partnerId
      ),

    originConfigured:
      Boolean(
        config.originId
      ),

    originId:
      config.originId ||
      null,

    defaultCompartmentSize:
      config.defaultCompartmentSize,

    clientConfigured:
      Boolean(
        config.clientId &&
        config.clientSecret
      ),

    /*
     * Never expose secrets.
     */
    webhookConfigured:
      Boolean(
        config.webhookSecret
      ),
  };
}