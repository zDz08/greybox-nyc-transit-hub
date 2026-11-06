import { toStationFeature } from "../src/modules/transit/station.mapper.js";

const url = new URL("https://data.ny.gov/resource/39hk-dx4f.json");
url.searchParams.set("$limit", "5");

const response = await fetch(url);

if(!response.ok) {
    throw new Error(`Station request failed: HTTP ${response.status}`);
}

const stations = await response.json();

const stationCollection = {
    type: "FeatureCollection",
    features: stations.map(toStationFeature),
};

console.log("Collection type: ", stationCollection.type);
console.log("Number of features: ", stationCollection.features.length);

console.table(stationCollection.features.map((feature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    routes: feature.properties.routes.join(", "),
    coordinates: feature.geometry.coordinates.join(", "),
    }))
);