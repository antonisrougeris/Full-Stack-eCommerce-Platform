import fs from "fs";
import path from "path";

import { connectDB, getDB } from "../src/config/db.js";
import {
  findExactVariant,
  resolveQrConfigForColor,
} from "../src/services/product-colors.service.js";

import { COLLECTIONS } from "../src/constants/collections.js";
import { createId, nowIso } from "../src/utils/ids.js";

import {
  reserveUniqueQrShortId,
  writeQrShortIdReservation,
} from "../src/services/qr-id.service.js";

import { sendEmail } from "../src/services/email.service.js";

import { uploadQrToStorage } from "../src/utils/uploadQrToStorage.js";

import { generatePrintQrImage } from "../src/utils/generatePrintQrImage.js";

import { generatePrintSheet } from "../src/utils/generatePrintSheet.js";

function isTshirtPrintSize(size) {
  return ["S", "M", "L", "XL", "2XL", "XXL"].includes(
    String(size || "").trim().toUpperCase()
  );
}

const PUBLIC_QR_BASE_URL =
  process.env.QR_PUBLIC_BASE_URL ||
  "https://go.skanare.com";

async function main() {
  const [
    productId,
    quantityArg,
    skuArg,
    sizeArg = "",
    colorArg = "",
  ] = process.argv.slice(2);

  const quantity = Number(quantityArg);

  // =========================
  // VALIDATION
  // =========================

  if (!productId) {
    throw new Error("Missing productId");
  }

  if (!skuArg) {
    throw new Error("Missing SKU");
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 1000
  ) {
    throw new Error(
      "Quantity must be an integer between 1 and 1000"
    );
  }

  // =========================
  // DATABASE
  // =========================

  await connectDB();

  const db = getDB();

  // =========================
  // FETCH PRODUCT
  // =========================

  const productRef = db
    .collection(COLLECTIONS.PRODUCTS)
    .doc(productId);

  const productSnap = await productRef.get();

  if (!productSnap.exists) {
    throw new Error(
      `Product not found in Firestore: ${productId}`
    );
  }

  const product = {
    id: productSnap.id,
    ...productSnap.data(),
  };

  console.log("PRODUCT FOUND:", {
    id: product.id,
    title: product.title,
    qrConfig: product.qrConfig,
  });

  // =========================
  // SKU / INVENTORY
  // =========================

  if (product.active === false || !product.customQr) {
    throw new Error("Product is inactive or does not support custom QR stock");
  }
  const sku = String(skuArg).trim();
  const variant = findExactVariant(product, { sku, size: sizeArg, color: colorArg });
  const printConfig = resolveQrConfigForColor(product, variant.color);
  const inventoryKey = `${productId}::${variant.sku}`;

  const created = [];

  const downloadLinks = [];

  // =========================
  // CREATE STOCK
  // =========================

  for (
    let index = 0;
    index < quantity;
    index += 1
  ) {
    // =========================
    // CREATE FIRESTORE QR
    // =========================

    const result =
      await db.runTransaction(
        async (tx) => {
          const qrId =
            createId("qr");

          const {
            shortId,
            reservationRef,
          } =
            await reserveUniqueQrShortId(
              tx,
              db
            );

          const createdAt =
            nowIso();

          const qrRef = db
            .collection(
              COLLECTIONS.QR_CODES
            )
            .doc(qrId);

          writeQrShortIdReservation(
            tx,
            reservationRef,
            {
              qrId,
              shortId,
              createdAt,
            }
          );

          tx.set(qrRef, {
            id: qrId,

            shortId,

            // Do not let checkout consume a QR whose print generation has failed.
            status: "generating",

            productId,

            productTitle:
              product.title || "",

            sku,

            inventoryKey,

            variant: {
              sku,

              size:
                sizeArg || "",

              color:
                colorArg || "",
            },

            qrConfig: printConfig,

            userId: null,

            guestId: null,

            orderId: null,

            targetUrl:
              "https://skanare.com",

            scans: 0,

            fulfillmentMode:
              "preprinted",

            printStatus:
              "pending",

            createdAt,

            updatedAt:
              createdAt,
          });

          return {
            qrId,

            shortId,

            url:
              `${PUBLIC_QR_BASE_URL}/${shortId}`,
          };
        }
      );

    created.push(result);

    console.log(
      `[${index + 1}/${quantity}] ${result.url}`
    );

    try {
      // =========================
      // GENERATE MAIN QR ARTWORK
      // =========================

      const qrBuffer = await generatePrintQrImage(result.url, {
        qrColor: printConfig.qrColor || printConfig.color || "#000000",
        textColor: printConfig.textColor || printConfig.qrColor || "#000000",
        textPrint: printConfig.textPrint ?? "",
        textPosition: printConfig.textPosition || "bottom",
        size: printConfig.size || 3540,
      });

      // =========================
      // GENERATE A3 DTF SHEET
      // =========================

      const printBuffer =
        isTshirtPrintSize(sizeArg)
          ? await generatePrintSheet({
              qrBuffer,

              shirtColor:
                colorArg ||
                "Black",

              shirtSize:
                sizeArg,
            })
          : qrBuffer;

      // =========================
      // UPLOAD A3 TO STORAGE
      // SAME LOGIC AS ORDER EMAIL
      // =========================

      console.log(
        `Uploading A3 print file for ${result.shortId}...`
      );

      const uploaded =
        await uploadQrToStorage(
          `stock-${result.qrId}`,
          printBuffer
        );

      if (!uploaded?.url) {
        throw new Error(
          `A3 upload did not return URL for QR ${result.shortId}`
        );
      }

      console.log(
        `A3 uploaded: ${uploaded.url}`
      );

      downloadLinks.push({
        qrId:
          result.qrId,

        shortId:
          result.shortId,

        qrUrl:
          result.url,

        printUrl:
          uploaded.url,
      });

      // =========================
      // UPDATE QR PRINT INFO
      // =========================

      const generatedAt =
        nowIso();

      await db
        .collection(
          COLLECTIONS.QR_CODES
        )
        .doc(result.qrId)
        .set(
          {
            status: "available",
            printStatus:
              "uploaded",

            printGeneratedAt:
              generatedAt,

            printFileUrl:
              uploaded.url,

            updatedAt:
              generatedAt,
          },
          {
            merge: true,
          }
        );
    } catch (error) {
      // =========================
      // MARK PRINT FAILED
      // IMPORTANT:
      // QR IS NOT AVAILABLE UNTIL PRINT GENERATION SUCCEEDS
      // =========================

      const failedAt =
        nowIso();

      await db
        .collection(
          COLLECTIONS.QR_CODES
        )
        .doc(result.qrId)
        .set(
          {
            status: "generation_failed",
            printStatus:
              "failed",

            printError:
              String(
                error?.message ||
                error
              ),

            printFailedAt:
              failedAt,

            updatedAt:
              failedAt,
          },
          {
            merge: true,
          }
        );

      throw error;
    }
  }

  // =========================
  // CREATE CSV
  // =========================

  const outputDirectory =
    path.resolve(
      process.cwd(),
      "exports"
    );

  fs.mkdirSync(
    outputDirectory,
    {
      recursive: true,
    }
  );

  const outputFile =
    path.join(
      outputDirectory,

      `qr-stock-${productId}-${sku}-${Date.now()}.csv`
    );

  const csv = [
    "qrId,shortId,url,productId,sku,inventoryKey,size,color,printUrl",

    ...created.map(
      (item) => {
        const printInfo =
          downloadLinks.find(
            (link) =>
              link.qrId ===
              item.qrId
          );

        return [
          item.qrId,

          item.shortId,

          item.url,

          productId,

          sku,

          inventoryKey,

          sizeArg,

          colorArg,

          printInfo?.printUrl ||
            "",
        ]
          .map(csvEscape)
          .join(",");
      }
    ),
  ].join("\n");

  fs.writeFileSync(
    outputFile,
    csv,
    "utf8"
  );

  // =========================
  // EMAIL CONFIG
  // =========================

  const adminEmail =
    process.env.ADMIN_EMAIL;

  const from =
    process.env.EMAIL_ORDER ||
    process.env.EMAIL_FROM;

  if (!adminEmail) {
    throw new Error(
      "ADMIN_EMAIL is missing from .env"
    );
  }

  if (!from) {
    throw new Error(
      "EMAIL_ORDER / EMAIL_FROM is missing from .env"
    );
  }

  if (
    downloadLinks.length === 0
  ) {
    throw new Error(
      "No print download links were generated"
    );
  }

  // =========================
  // CREATE EMAIL DOWNLOAD BUTTONS
  // =========================

  const downloadLinksHtml =
    downloadLinks
      .map(
        (
          item,
          index
        ) => `
          <div
            style="
              margin:20px 0;
              padding:18px;
              background:#f7f7f7;
              border-radius:12px;
            "
          >
            <p style="margin:0 0 6px;">
              <strong>
                Print ${index + 1}
              </strong>
            </p>

            <p style="margin:0 0 6px;">
              QR ID:
              ${item.shortId}
            </p>

            <p style="margin:0 0 14px;">
              QR URL:
              ${item.qrUrl}
            </p>

            <a
              href="${item.printUrl}"
              target="_blank"
              style="
                display:inline-block;
                background:#111111;
                color:#ffffff;
                text-decoration:none;
                padding:12px 18px;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Download A3 DTF Print
            </a>
          </div>
        `
      )
      .join("");

  // =========================
  // ADMIN EMAIL
  // =========================

  console.log("");

  console.log(
    `Sending print email to ${adminEmail}...`
  );

  await sendEmail({
    from,

    to:
      adminEmail,

    subject:
      `QR Stock Print - ${product.title} - ${sku}`,

    html: `
      <h2>
        New QR Stock Ready for Printing
      </h2>

      <p>
        <strong>
          Product:
        </strong>
        ${product.title}
      </p>

      <p>
        <strong>
          Product ID:
        </strong>
        ${productId}
      </p>

      <p>
        <strong>
          SKU:
        </strong>
        ${sku}
      </p>

      <p>
        <strong>
          Size:
        </strong>
        ${sizeArg || "-"}
      </p>

      <p>
        <strong>
          Color:
        </strong>
        ${colorArg || "-"}
      </p>

      <p>
        <strong>
          Quantity:
        </strong>
        ${quantity}
      </p>

      <h3>
        A3 DTF Print Files
      </h3>

      <p>
        Use the buttons below to
        download the generated
        print files.
      </p>

      ${downloadLinksHtml}
    `,
  });

  // =========================
  // MARK EMAIL AS SENT
  // =========================

  const emailSentAt =
    nowIso();

  for (
    const item
    of created
  ) {
    await db
      .collection(
        COLLECTIONS.QR_CODES
      )
      .doc(item.qrId)
      .set(
        {
          printStatus:
            "email_sent",

          adminPrintEmailSentAt:
            emailSentAt,

          updatedAt:
            emailSentAt,
        },
        {
          merge: true,
        }
      );
  }

  // =========================
  // FINISHED
  // =========================

  console.log("");

  console.log(
    "==========================="
  );

  console.log(
    "QR STOCK CREATED"
  );

  console.log(
    "==========================="
  );

  console.log(
    `Product: ${productId}`
  );

  console.log(
    `SKU: ${sku}`
  );

  console.log(
    `Quantity: ${quantity}`
  );

  console.log(
    `Inventory key: ${inventoryKey}`
  );

  console.log(
    `CSV: ${outputFile}`
  );

  console.log(
    `Admin email: ${adminEmail}`
  );

  console.log("");

  console.log(
    "PRINT FILES:"
  );

  for (
    const item
    of downloadLinks
  ) {
    console.log(
      `${item.shortId}: ${item.printUrl}`
    );
  }

  console.log("");

  console.log(
    "Print email sent successfully."
  );
}

function csvEscape(
  value
) {
  const text =
    String(
      value ?? ""
    );

  return `"${text.replaceAll(
    '"',
    '""'
  )}"`;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(
    (error) => {
      console.error(
        "QR stock generation failed:"
      );

      console.error(
        error
      );

      process.exit(1);
    }
  );