import { readFile } from "node:fs/promises";

const routeShapesUrl = new URL(
    "../../../data/generated/route-shapes.geojson",
    import.meta.url
);

let cachedRouteShapes = null;

export async function getRouteShapes() {
    if (!cachedRouteShapes) {
        const text = await readFile(routeShapesUrl, "utf8");
        cachedRouteShapes = JSON.parse(text);
    }

    return {
        data: cachedRouteShapes,
        meta: {
            source: "mta-static-gtfs",
        },
    };
}