import test from "node:test";
import assert from "node:assert/strict";
import { classifyImpact } from "../src/commuteImpact.js";

const alert = {
    status: "current",
    routeIds: ["1"],
    type: "Planned - Stops Skipped",
    title: "Downtown [1] skips 125 St",
    targets: ["112", "116", "117"].map((stopId) => ({
        routeId: "1",
        stopId,
        directionId: 1,
    })),
};

const c = {
    routeId: "1",
    stationId: "115",
    stationName: "137 St-City College",
    stopId: "115S",
};

const skipped = { id: "116", name: "125 St" };
test("distinguish boarding, exit, intermediate, alternative station and opposite direction", () => {
    assert.equal(
        classifyImpact({ ...c, stationId: "116", stationName: "125 St", stopId: "116S" }, alert)
            .rank,
        0,
    );

    assert.equal(classifyImpact({ ...c, destination: { ...skipped, via: [] } }, alert).rank, 1);

    assert.equal(
        classifyImpact(
            { ...c, destination: { id: "120", name: "96 St", via: [skipped] } },
            alert,
        ).rank,
        2,
    );

    assert.equal(
        classifyImpact({ ...c, stationId: "112", stationName: "168 St-Washington Hts" }, alert)
            .rank,
        3,
    );

    assert.equal(classifyImpact({ ...c, stopId: "115N" }, alert), null);
});
