import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

async function readGtfs(filename) {
    const fileUrl = new URL(`../data/gtfs/${filename}`, import.meta.url);
    const text = await readFile(fileUrl, "utf8");

    return parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
    });
}

const routes = await readGtfs("routes.txt");
const trips = await readGtfs("trips.txt");
const shapes = await readGtfs("shapes.txt");

const pointsByShape = new Map();

for (const point of shapes) {
    const shapeId = point.shape_id;

    if (!pointsByShape.has(shapeId)) {
        pointsByShape.set(shapeId, []);
    }

    pointsByShape.get(shapeId).push(point);
}

const coordinatesByShape = new Map();

for (const [shapeId, points] of pointsByShape) {
    if (points.length < 2) {
        throw new Error(`Shape ${shapeId} needs at least two points`);
    }

    points.sort(
        (a, b) =>
            Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence)
    );

    const coordinates = points.map((point) => {
        const longitude = Number(point.shape_pt_lon);
        const latitude = Number(point.shape_pt_lat);

        if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            longitude < -180 ||
            longitude > 180 ||
            latitude < -90 ||
            latitude > 90
        ) {
            throw new Error(`Invalid coordinates in shape ${shapeId}`);
        }

        return [longitude, latitude];
    });

    coordinatesByShape.set(shapeId, coordinates);
}

const routesById = new Map(
    routes.map((route) => [route.route_id, route])
);

const seenPairs = new Set();
const features = [];

for (const trip of trips) {
    const routeId = trip.route_id;
    const shapeId = trip.shape_id;
    const pairKey = JSON.stringify([routeId, shapeId]);

    if (seenPairs.has(pairKey)) continue;

    const route = routesById.get(routeId);
    const coordinates = coordinatesByShape.get(shapeId);

    if (!route) {
        throw new Error(`Unknown route: ${routeId}`);
    }

    if (!coordinates) {
        throw new Error(`Missing shape ${shapeId} for route ${routeId}`);
    }

    const color = route.route_color?.trim();

    if (!/^[0-9a-f]{6}$/i.test(color ?? "")) {
        throw new Error(`Invalid color for route ${routeId}`);
    }

    features.push({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates,
        },
        properties: {
            routeId,
            routeName: route.route_short_name,
            shapeId,
            color: `#${color}`,
        },
    });

    seenPairs.add(pairKey);
}

if (features.length === 0) {
    throw new Error("No route features were generated");
}

const collection = {
    type: "FeatureCollection",
    features,
};

const outputDirectory = new URL("../data/generated/", import.meta.url);
const outputFile = new URL("route-shapes.geojson", outputDirectory);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, JSON.stringify(collection), "utf8");

const routeCounts = new Map();

for (const feature of features) {
    const routeId = feature.properties.routeId;
    routeCounts.set(routeId, (routeCounts.get(routeId) ?? 0) + 1);
}

console.table(
    [...routeCounts].map(([routeId, shapeCount]) => ({
        routeId,
        shapeCount,
    }))
);

console.log("Saved:", outputFile.pathname);
console.log("Routes represented:", routeCounts.size);
console.log("Total features:", features.length);