import { Router } from "express";
import { getStations } from "./transit.service.js";
import { getRouteShapes } from "./routeShapes.service.js"
import { getArrivals } from "./arrivals.service.js";
import { getServiceAlerts } from "./serviceAlerts.service.js";

import { findOptions, getIndex } from "./commutePlanner.js";

const router = Router();

router.get("/commute-planner", async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const index = await getIndex();
        if (from === undefined && to === undefined) {
            return res.json({ data: index.stations });
        }
        if (!index.names.has(from) || !index.names.has(to) || from === to) {
            return res.status(400).json({ error: { message: "Choose two different subway stations." } });
        }
        res.json({ data: findOptions(index, from, to) });
    } catch (error) {
        next(error);
    }
});

router.get("/stations", async(req, res, next) => {
    try {
        const result = await getStations();
        res.json(result);
    }catch(error) {
        if(error.code === "TRANSIT_MODE_NOT_IMPLEMENTED") {
            return res.status(503).json({
                error: {
                    code: error.code,
                    message: "Unsupported transit data mode. Use mock or open-data.",
                },
            });
        }
        next(error);
    }
});

router.get("/route-shapes", async (req, res, next) => {
    try {
        const result = await getRouteShapes();
        res.json(result);
    }catch(error) {
        next(error);
    }
});

router.get("/stations/:stationId/arrivals", async (req, res, next) => {
    const { stationId } = req.params;
    const routeId = req.query.routeId;

    if (typeof routeId !== "string" || !routeId.trim()) {
        return res.status(400).json({
            error: {
                code: "ROUTE_REQUIRED",
                message: "A routeId query parameter is required.",
            },
        });
    }

    try {
        const result = await getArrivals(
            stationId,
            routeId.trim().toUpperCase()
        );

        res.json(result);
    } catch (error) {
        if (error.code && error.status) {
            return res.status(error.status).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        next(error);
    }
});

router.get("/service-alerts", async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
        const result = await getServiceAlerts();
        res.json(result);
    } catch (error) {
        console.error("Could not load service alerts:", error);

        res.status(502).json({
            error: {
                code: "SERVICE_ALERTS_UNAVAILABLE",
                message: "Service alerts are temporarily unavailable.",
            },
        });
    }
});

export default router;