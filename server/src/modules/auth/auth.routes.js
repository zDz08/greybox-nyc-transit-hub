import { Router } from "express";
import { requireAuth } from "./requireAuth.js";

const router = Router();

router.get("/me", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
}, requireAuth, (req, res) => {
    const { uid, email } = req.auth;
    res.json({ data: { uid, email } });
});

export default router;
