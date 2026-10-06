import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";

function getMode() {
  return String(
    process.env.OXYGEN_MODE ||
      "mock"
  )
    .trim()
    .toLowerCase();
}

function isMockMode() {
  return getMode() === "mock";
}

function getConfig() {
  return {
    mode: getMode(),

    apiUrl: String(
      process.env.OXYGEN_API_URL ||
        "https://sandbox-api.oxygen.gr/v1"
    ).replace(/\/+$/, ""),

    apiKey: String(
      process.env.OXYGEN_API_KEY ||
        ""
    ).trim(),
  };
}


function createMockReceipt(order) {
  const issuedAt = nowIso();

  const receiptNumber =
    `MOCK-${Date.now()}`;

  const documentType =
    order?.billing?.documentType === "invoice"
      ? "invoice"
      : "retail_receipt";

  return {
    mock: true,

    provider:
      "oxygen",

    status:
      "issued",

    id:
      receiptNumber,

    number:
      receiptNumber,

    type:
      documentType,

    invoiceDetails:
      documentType === "invoice"
        ? order?.billing?.invoiceDetails || null
        : null,

    mark:
      null,

    pdfUrl:
      null,

    issuedAt,
  };
}


async function oxygenRequest(
  path,
  {
    method = "GET",
    body,
  } = {}
) {
  const {
    apiUrl,
    apiKey,
  } = getConfig();

  if (!apiKey) {
    throw new ApiError(
      500,
      "Oxygen API key is not configured"
    );
  }

  const response = await fetch(
    `${apiUrl}${path}`,
    {
      method,

      headers: {
        Accept:
          "application/json",

        Authorization:
          `Bearer ${apiKey}`,

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
              JSON.stringify(body),
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
      "Oxygen request failed",
      {
        path,
        status:
          response.status,
        body:
          responseBody,
      }
    );

    throw new ApiError(
      502,
      "Oxygen API request failed"
    );
  }

  return responseBody;
}


/*
 * For now this returns a mock document.
 *
 * Later the mock implementation will
 * be replaced by POST /invoices or
 * POST /receipts with the exact Oxygen
 * payload required by your account.
 */

export async function issueOrderReceipt(
  order
) {
  if (!order) {
    throw new ApiError(
      400,
      "Missing order"
    );
  }

  if (isMockMode()) {
    console.log(
      "OXYGEN MOCK fiscal document issued",
      {
        orderId:
          order.id,

        orderNumber:
          order.orderNumber,
      }
    );

    return createMockReceipt(order);
  }

  /*
   * We deliberately don't guess
   * the fiscal payload yet.
   *
   * This will be implemented after
   * getting the sandbox account
   * configuration.
   */

  throw new ApiError(
    501,
    "Real Oxygen receipt issuing is not configured yet"
  );
}


export async function testOxygenConnection() {
  if (isMockMode()) {
    return {
      ok: true,
      mock: true,
      environment:
        "mock",
    };
  }

  return oxygenRequest("/");
}