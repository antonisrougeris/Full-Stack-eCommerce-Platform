import express from "express";
import { createGuestId, setGuestCookie } from "../middleware/guestSession.js";
import { ok } from "../utils/response.js";

const router = express.Router();

router.post("/guest", (req, res) => {
  let guestId = req.guestId;

  if (!guestId) {
    guestId = createGuestId();
    setGuestCookie(res, guestId);
  }

  return ok(res, {
    guestId,
  });
});

export default router;
