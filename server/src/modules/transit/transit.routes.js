import { Router } from "express";
import { getStations } from "./transit.service.js";

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
                    message: "Only mock transit data is avaliable right now",
                },
            });
        }
        next(error);
    }
});

export default router;