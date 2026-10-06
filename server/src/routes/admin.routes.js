import { Router } from "express";
import multer from "multer";

import {
  seedProducts,

  adminMe,
  getAdminDashboard,

  getAdminOrders,
  getAdminOrder,

  getAdminFulfillment,
  updateOrderFulfillment,
  updateOrderChecklist,
  updateOrderShipping,
  updateOrderReceipt,
  uploadOrderReceiptPdf,
  shipOrderAndNotify,

  getAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  archiveAdminProduct,
  uploadAdminProductImages,

  getAdminCustomers,
  getAdminPayments,
  getAdminContactMessages,
  markAdminContactMessageRead,
  replyToAdminContactMessage,
} from "../controllers/admin.controller.js";

import {
  requireAuth,
} from "../middleware/auth.js";

import {
  adminApproveReturn,
  adminDownloadReturnLabel,
  adminListReturns,
  adminMarkReturnReceived,
  adminMarkReturnRefunded,
  adminRejectReturn,
} from "../controllers/returns.controller.js";

import {
  requireAdmin,
} from "../middleware/requireAdmin.js";

import {
  assertPdfBuffer,
  assertImageBuffer,
} from "../utils/fileSignatures.js";


const router = Router();


const receiptUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      return callback(
        new Error("Only PDF receipts are allowed")
      );
    }

    callback(null, true);
  },
});


const productImageUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 8,
  },

  fileFilter: (_req, file, callback) => {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Only PNG, JPG and WEBP product images are allowed")
      );
    }

    callback(null, true);
  },
});


router.use(
  requireAuth,
  requireAdmin
);


/* =========================
   ADMIN
   ========================= */

router.get(
  "/me",
  adminMe
);

router.get(
  "/dashboard",
  getAdminDashboard
);


/* =========================
   ORDERS
   ========================= */

router.get(
  "/orders",
  getAdminOrders
);

router.get(
  "/orders/:id",
  getAdminOrder
);


/* =========================
   RETURNS
   ========================= */

router.get("/returns", adminListReturns);
router.post("/returns/:returnId/approve", adminApproveReturn);
router.post("/returns/:returnId/reject", adminRejectReturn);
router.post("/returns/:returnId/received", adminMarkReturnReceived);
router.post("/returns/:returnId/refunded", adminMarkReturnRefunded);
router.get("/returns/:returnId/label", adminDownloadReturnLabel);


/* =========================
   FULFILLMENT
   ========================= */

router.get(
  "/fulfillment",
  getAdminFulfillment
);

router.patch(
  "/orders/:id/fulfillment",
  updateOrderFulfillment
);

router.patch(
  "/orders/:id/checklist",
  updateOrderChecklist
);

router.patch(
  "/orders/:id/shipping",
  updateOrderShipping
);

router.patch(
  "/orders/:id/receipt",
  updateOrderReceipt
);

router.post(
  "/orders/:id/receipt-file",
  receiptUpload.single("file"),
  (req, _res, next) => {
    try {
      if (!req.file?.buffer) {
        throw new Error("Receipt file is required");
      }

      assertPdfBuffer(req.file.buffer);
      next();
    } catch (error) {
      next(error);
    }
  },
  uploadOrderReceiptPdf
);

router.post(
  "/orders/:id/ship",
  shipOrderAndNotify
);


/* =========================
   PRODUCTS
   ========================= */

router.get(
  "/products",
  getAdminProducts
);

router.post(
  "/product-images",
  productImageUpload.array("images", 8),
  (req, _res, next) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];

      if (!files.length) {
        throw new Error("At least one product image is required");
      }

      for (const file of files) {
        assertImageBuffer(file.buffer, file.mimetype);
      }

      next();
    } catch (error) {
      next(error);
    }
  },
  uploadAdminProductImages
);

router.post(
  "/products",
  createAdminProduct
);

router.patch(
  "/products/:id",
  updateAdminProduct
);


router.post(
  "/products/:id/archive",
  archiveAdminProduct
);


/* =========================
   CUSTOMERS
   ========================= */

router.get(
  "/customers",
  getAdminCustomers
);


/* =========================
   CONTACT INBOX
   ========================= */

router.get(
  "/contact-messages",
  getAdminContactMessages
);

router.patch(
  "/contact-messages/:id/read",
  markAdminContactMessageRead
);

router.post(
  "/contact-messages/:id/reply",
  replyToAdminContactMessage
);


/* =========================
   PAYMENTS
   ========================= */

router.get(
  "/payments",
  getAdminPayments
);


/* =========================
   DEVELOPMENT / SEED
   ========================= */

if (process.env.NODE_ENV !== "production") {
  router.post(
    "/seed-products",
    seedProducts
  );
}


export default router;
