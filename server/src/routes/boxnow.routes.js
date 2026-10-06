import {
  Router,
} from "express";

import {
  handleBoxNowWebhook,
} from "../controllers/boxnow.controller.js";


const router =
  Router();


/*
 * POST /api/boxnow/webhook
 *
 * Public endpoint.
 *
 * Authentication is performed using the
 * BOX NOW datasignature / webhook secret.
 */
router.post(
  "/webhook",
  handleBoxNowWebhook
);


export default router;