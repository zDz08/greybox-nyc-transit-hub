import { Router } from "express";
import healthRoutes from "./health.routes.js";
import transitRoutes from "../modules/transit/transit.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/transit", transitRoutes);

export default router;