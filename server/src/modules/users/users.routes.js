import { Router } from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { getUserProfile, parseSavedCommute, removeCommute, saveCommute } from "./users.service.js";

import { getIndex } from "../transit/commutePlanner.js";

const router = Router();
const pairIdPattern = /^pair-[A-Za-z0-9_-]{1,20}:[A-Za-z0-9_-]{1,20}$/;

router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
}, requireAuth);

router.get("/me", async (req, res) => {
    try {
        res.json({ data: await getUserProfile(req.auth) });
    } catch {
        res.status(503).json({ error: {
            code: "PROFILE_UNAVAILABLE",
            message: "Could not load your saved commutes. Please try again.",
        } });
    }
});

router.put("/me/saved-commutes/:commuteId", async (req, res) => {
    if (pairIdPattern.test(req.params.commuteId)) {
        const [from, to] = req.params.commuteId.slice("pair-".length).split(":");

        try {
            const { names } = await getIndex();
            if (from === to || !names.has(from) || !names.has(to)) {
                return res.status(400).json({
                    error: { message: "Choose two different subway stations." },
                });
            }

            const commute = {
                id: req.params.commuteId,
                origin: { id: from, name: names.get(from) },
                destination: { id: to, name: names.get(to) },
            };
            return res.json({ data: await saveCommute(req.auth, commute) });
        } catch {
            return res.status(503).json({ error: { message: "Could not save these stations." } });
        }
    }

    const commute = parseSavedCommute(req.body);
    if (!commute || commute.id !== req.params.commuteId) {
        return res.status(400).json({ error: {
            code: "INVALID_COMMUTE",
            message: "A valid station, line, and direction are required.",
        } });
    }

    try {
        res.json({ data: await saveCommute(req.auth, commute) });
    } catch {
        res.status(503).json({ error: {
            code: "SAVE_UNAVAILABLE",
            message: "Could not save this commute. Please try again.",
        } });
    }
});

router.delete("/me/saved-commutes/:commuteId", async (req, res) => {
    const { commuteId } = req.params;
    if (
        !pairIdPattern.test(commuteId) &&
        !/^plan-[a-f0-9]{32}$/.test(commuteId) &&
        !/^[A-Za-z0-9_-]{1,20}:[A-Z0-9]{1,4}:[A-Za-z0-9_-]{1,20}[NS]$/.test(commuteId)
    ) {
        return res.status(400).json({ error: {
            code: "INVALID_COMMUTE",
            message: "A valid saved commute ID is required.",
        } });
    }

    try {
        res.json({ data: await removeCommute(req.auth, req.params.commuteId) });
    } catch {
        res.status(503).json({ error: {
            code: "REMOVE_UNAVAILABLE",
            message: "Could not remove this commute. Please try again.",
        } });
    }
});

export default router;
