import { Router } from "express";
import {
  submitContactForm,
} from "../controllers/contact.controller.js";

const router = Router();

router.post("/", submitContactForm);

export default router;
