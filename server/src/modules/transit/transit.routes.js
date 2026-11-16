import { Router } from "express";
import { getStations } from "./transit.service.js";
import { getRouteShapes } from "./routeShapes.service.js"

const router = Router();

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

export default router;