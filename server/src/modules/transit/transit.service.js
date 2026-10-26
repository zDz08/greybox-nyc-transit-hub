import { mockStations } from "./transit.mock.js"

export async function getStations() {
    const mode = process.env.TRANSIT_DATA_MODE || "mock";
    
    if(mode !== "mock") {
        const error = new Error("Live station data is not implemented");
        error.code = "TRANSIT_MODE_NOT_IMPLEMENTED";
        throw error;
    }

    return {
        data: mockStations,
        meta: {
            source: "mock",
        },
    };
}