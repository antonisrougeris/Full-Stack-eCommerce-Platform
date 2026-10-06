import { Router } from "express";
import { ApiError } from "../utils/apiError.js";

import {
  getBoxNowServiceInfo,
  getBoxNowEntrustedPartners,
  getBoxNowOrigins,
  getBoxNowDestinations,
  createBoxNowDelivery,
  getBoxNowParcel,
  getBoxNowParcelLabel,
  getBoxNowOrderLabel,
  cancelBoxNowParcel,
} from "../services/boxnow.service.js";


const router = Router();


/* ==================================================
   STAGE TEST ACCESS
================================================== */

/*
 * These routes must NEVER be usable against production.
 *
 * Required env:
 *
 * BOXNOW_MODE=stage
 * BOXNOW_TEST_KEY=some-long-random-secret
 *
 * Every request must include:
 *
 * X-BOXNOW-TEST-KEY: <secret>
 */

function requireBoxNowStageAccess(
  req,
  _res,
  next
) {
  try {
    const mode = String(
      process.env.BOXNOW_MODE || ""
    )
      .trim()
      .toLowerCase();

    if (mode !== "stage") {
      throw new ApiError(
        404,
        "Not found"
      );
    }

    const configuredKey =
      String(
        process.env.BOXNOW_TEST_KEY || ""
      ).trim();

    if (!configuredKey) {
      throw new ApiError(
        500,
        "BOX NOW test access is not configured"
      );
    }

    const suppliedKey =
      String(
        req.get(
          "X-BOXNOW-TEST-KEY"
        ) || ""
      ).trim();

    if (
      !suppliedKey ||
      suppliedKey !== configuredKey
    ) {
      throw new ApiError(
        403,
        "Forbidden"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}


/*
 * Protect every route below.
 */
router.use(
  requireBoxNowStageAccess
);


/* ==================================================
   SERVICE INFO
================================================== */

/*
 * GET /api/test-boxnow/info
 *
 * Shows safe BOX NOW configuration information.
 * Does NOT expose secrets.
 */

router.get(
  "/info",
  async (
    _req,
    res,
    next
  ) => {
    try {
      const info =
        getBoxNowServiceInfo();

      return res
        .status(200)
        .json({
          success:
            true,

          data:
            info,
        });
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   PARTNER
================================================== */

/*
 * GET /api/test-boxnow/partners
 *
 * Useful to verify that BOXNOW_PARTNER_ID
 * matches a partner available to these credentials.
 */

router.get(
  "/partners",
  async (
    _req,
    res,
    next
  ) => {
    try {
      const result =
        await getBoxNowEntrustedPartners();

      return res
        .status(200)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   ORIGINS
================================================== */

/*
 * GET /api/test-boxnow/origins
 *
 * Returns available pickup origins.
 *
 * For your Stage account we already saw:
 *
 * id: "2"
 * type: "any-apm"
 */

router.get(
  "/origins",
  async (
    _req,
    res,
    next
  ) => {
    try {
      const result =
        await getBoxNowOrigins();

      return res
        .status(200)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   DESTINATIONS
================================================== */

/*
 * GET /api/test-boxnow/destinations
 *
 * Optional query params:
 *
 * ?latlng=37.9838,23.7275
 * ?radius=5000
 * ?requiredSize=1
 * ?name=...
 * ?limit=20
 */

router.get(
  "/destinations",
  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await getBoxNowDestinations(
          {
            latlng:
              req.query.latlng,

            radius:
              req.query.radius,

            requiredSize:
              req.query.requiredSize,

            name:
              req.query.name,

            limit:
              req.query.limit,
          }
        );

      return res
        .status(200)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   CREATE STAGE DELIVERY REQUEST
================================================== */

/*
 * POST /api/test-boxnow/delivery-request
 *
 * Example body:
 *
 * {
 *   "orderNumber": "SK-BOXNOW-TEST-001",
 *   "locker": "12345",
 *   "total": 10,
 *   "compartmentSize": 1,
 *   "customer": {
 *     "firstName": "Antonis",
 *     "lastName": "Test",
 *     "email": "test@example.com",
 *     "phone": "+306900000000"
 *   }
 * }
 */

router.post(
  "/delivery-request",
  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        req.body || {};

      const orderNumber =
        String(
          body.orderNumber || ""
        ).trim();

      if (!orderNumber) {
        throw new ApiError(
          400,
          "Missing orderNumber"
        );
      }


      const locker =
        String(
          body.locker ||
          body.destination?.id ||
          body.destination?.locationId ||
          ""
        ).trim();

      if (!locker) {
        throw new ApiError(
          400,
          "Missing BOX NOW destination locker"
        );
      }


      const firstName =
        String(
          body.customer?.firstName ||
          "Test"
        ).trim();

      const lastName =
        String(
          body.customer?.lastName ||
          "User"
        ).trim();

      const email =
        String(
          body.customer?.email ||
          ""
        ).trim();

      const phone =
        String(
          body.customer?.phone ||
          ""
        ).trim();


      if (!email) {
        throw new ApiError(
          400,
          "Missing customer email"
        );
      }

      if (!phone) {
        throw new ApiError(
          400,
          "Missing customer phone"
        );
      }


      const total =
        Number(
          body.total ?? 10
        );

      if (
        !Number.isFinite(total) ||
        total <= 0
      ) {
        throw new ApiError(
          400,
          "Invalid total"
        );
      }


      /*
       * This object intentionally follows
       * the same shape as a real Skanare order.
       */
      const order = {
        id:
          `stage-test-${Date.now()}`,

        orderNumber,

        delivery:
          "boxnow",

        locker,

        total,

        currency:
          "EUR",

        customer: {
          firstName,
          lastName,
          email,
          phone,
        },
      };


      /*
       * Optional override only for Stage tests.
       *
       * Normally origin comes from:
       *
       * BOXNOW_ORIGIN_ID
       */
      const originId =
        String(
          body.originId || ""
        ).trim() ||
        undefined;


      /*
       * Optional compartment override.
       *
       * If omitted, boxnow.service.js uses:
       *
       * BOXNOW_DEFAULT_COMPARTMENT_SIZE
       */
      const compartmentSize =
        body.compartmentSize !==
        undefined
          ? Number(
              body.compartmentSize
            )
          : undefined;


      const result =
        await createBoxNowDelivery(
          order,
          {
            originId,
            compartmentSize,
          }
        );


      const parcelIds =
        Array.isArray(
          result?.parcels
        )
          ? result.parcels
              .map(
                (parcel) =>
                  String(
                    parcel?.id ||
                    ""
                  ).trim()
              )
              .filter(Boolean)
          : [];


      return res
        .status(201)
        .json({
          success:
            true,

          environment:
            "stage",

          order: {
            orderNumber,
            originId:
              originId ||
              process.env
                .BOXNOW_ORIGIN_ID ||
              null,

            destinationId:
              locker,

            compartmentSize:
              compartmentSize ||
              Number(
                process.env
                  .BOXNOW_DEFAULT_COMPARTMENT_SIZE ||
                1
              ),
          },

          parcelIds,

          data:
            result,
        });
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   PARCEL SEARCH
================================================== */

/*
 * GET /api/test-boxnow/parcels
 *
 * Examples:
 *
 * /parcels?orderNumber=SK-BOXNOW-TEST-001
 *
 * /parcels?parcelId=123456789
 */

router.get(
  "/parcels",
  async (
    req,
    res,
    next
  ) => {
    try {
      const orderNumber =
        String(
          req.query.orderNumber ||
          ""
        ).trim();

      const parcelId =
        String(
          req.query.parcelId ||
          ""
        ).trim();


      if (
        !orderNumber &&
        !parcelId
      ) {
        throw new ApiError(
          400,
          "Provide orderNumber or parcelId"
        );
      }


      const result =
        await getBoxNowParcel(
          {
            orderNumber:
              orderNumber ||
              undefined,

            parcelId:
              parcelId ||
              undefined,
          }
        );


      return res
        .status(200)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   PARCEL PDF LABEL
================================================== */

/*
 * GET
 * /api/test-boxnow/parcels/:parcelId/label
 *
 * Downloads one parcel voucher as PDF.
 */

router.get(
  "/parcels/:parcelId/label",
  async (
    req,
    res,
    next
  ) => {
    try {
      const parcelId =
        String(
          req.params
            .parcelId ||
          ""
        ).trim();

      if (!parcelId) {
        throw new ApiError(
          400,
          "Missing parcelId"
        );
      }


      const pdf =
        await getBoxNowParcelLabel(
          parcelId
        );


      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="boxnow-${parcelId}.pdf"`
      );

      res.setHeader(
        "Content-Length",
        String(
          pdf.length
        )
      );


      return res.send(
        pdf
      );
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   ORDER PDF LABEL
================================================== */

/*
 * GET
 * /api/test-boxnow/orders/:orderNumber/label
 *
 * Downloads labels for the complete
 * BOX NOW delivery request.
 */

router.get(
  "/orders/:orderNumber/label",
  async (
    req,
    res,
    next
  ) => {
    try {
      const orderNumber =
        String(
          req.params
            .orderNumber ||
          ""
        ).trim();

      if (!orderNumber) {
        throw new ApiError(
          400,
          "Missing orderNumber"
        );
      }


      const pdf =
        await getBoxNowOrderLabel(
          orderNumber
        );


      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="boxnow-order-${orderNumber}.pdf"`
      );

      res.setHeader(
        "Content-Length",
        String(
          pdf.length
        )
      );


      return res.send(
        pdf
      );
    } catch (error) {
      next(error);
    }
  }
);


/* ==================================================
   CANCEL STAGE PARCEL
================================================== */

/*
 * POST
 * /api/test-boxnow/parcels/:parcelId/cancel
 *
 * Useful during Stage testing.
 */

router.post(
  "/parcels/:parcelId/cancel",
  async (
    req,
    res,
    next
  ) => {
    try {
      const parcelId =
        String(
          req.params
            .parcelId ||
          ""
        ).trim();

      if (!parcelId) {
        throw new ApiError(
          400,
          "Missing parcelId"
        );
      }


      const result =
        await cancelBoxNowParcel(
          parcelId
        );


      return res
        .status(200)
        .json({
          success:
            true,

          parcelId,

          data:
            result,
        });
    } catch (error) {
      next(error);
    }
  }
);


export default router;