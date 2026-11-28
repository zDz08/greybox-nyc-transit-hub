import { Router } from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { getUserProfile, parseSavedCommute, removeCommute, saveCommute } from "./users.service.js";

import { findOptions, getIndex } from "../transit/commutePlanner.js";

const router = Router();

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
    if (/^plan-[a-f0-9]{32}$/.test(req.params.commuteId)) {
        try {
            const { from, to } = req.body ?? {};
            const options = findOptions(await getIndex(), from, to);
            const plan = options.find(item => item.id === req.params.commuteId);
            if (!plan) {
                return res.status(400).json({ error: { message: "Find routes again before saving." } });
            }
            return res.json({ data: await saveCommute(req.auth, plan) });
        } catch {
            return res.status(503).json({ error: { message: "Could not save this itinerary." } });
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
    if (!/^plan-[a-f0-9]{32}$/.test(req.params.commuteId) && !/^[A-Za-z0-9_-]{1,20}:[A-Z0-9]{1,4}:[A-Za-z0-9_-]{1,20}[NS]$/.test(req.params.commuteId)) {
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
