import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
    res.json({
        status: "ok",
        project: "NYC Transit Hub",
        team: "Greybox",
    });
});

export default router;