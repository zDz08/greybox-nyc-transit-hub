// Illustrative test data, not live MTA data
// Coordinates use GeoJSON order: [longitude, latitude]

export const mockStations = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [-73.9875, 40.7553],
            },
            properties: {
                if: "mock-times-square",
                name: "Times Sq-42 St",
                routes: ["N", "Q", "R", "W"],
            },
        },
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [-73.9904, 40.7359],
            },
            properties: {
                id: "mock-union-square",
                name: "14 St-Union Sq",
                routes: ["N", "Q", "R", "W"],
            },
        },
    ],
};