import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../src/modules/transit/commutePlanner.js";
import { planScheduledJourney } from "../src/modules/transit/scheduledCommutes.js";
import { getServiceDay } from "../src/modules/transit/transit.time.js";

const base = Date.parse("2026-11-27T13:00:00.000Z");
const stations = new Map([..."ABCDX"].map((id) => [id, { stop_name: id }]));

function trip(routeId, times) {
    return {
        routeId,
        serviceId: "Weekday",
        stops: times.map(([stationId, arrival, departure = arrival, restrictions = {}]) => ({
            stationId,
            stopId: stationId + "N",
            arrivalSeconds: arrival * 60,
            departureSeconds: departure * 60,
            ...restrictions,
        })),
    };
}

function plan(trips, transferMinutes = 3, start = 0) {
    const transfers = [
        {
            from_stop_id: "B",
            to_stop_id: "X",
            transfer_type: "2",
            min_transfer_time: String(transferMinutes * 60),
        },
        { from_stop_id: "C", to_stop_id: "C", transfer_type: "3" },
    ];
    return planScheduledJourney(
        buildIndex(trips, stations, transfers),
        trips.map((trip) => ({ trip, originMs: base })),
        "A",
        "D",
        new Date(base + start * 60000),
    );
}

test("separates earliest arrival from fewest transfers and skips a missed connection", () => {
    const trips = [
        trip("1", [
            ["A", 0],
            ["B", 5],
        ]),
        trip("2", [
            ["X", 7],
            ["D", 12],
        ]),
        trip("2", [
            ["X", 8],
            ["D", 16],
        ]),
        trip("3", [
            ["A", 6],
            ["D", 24],
        ]),
    ];
    const [fastest, simplest] = plan(trips);
    assert.deepEqual(fastest.labels, ["Earliest arrival"]);
    assert.deepEqual(
        fastest.legs.map((leg) => leg.routeId),
        ["1", "2"],
    );
    assert.equal(fastest.arrivalAt, "2026-11-27T13:16:00.000Z");
    assert.equal(fastest.legs[1].departureAt, "2026-11-27T13:08:00.000Z");
    assert.deepEqual(simplest.labels, ["Fewest transfers"]);
    assert.equal(simplest.legs.length, 1);

    const [later] = plan(trips, 3, 1);
    assert.equal(later.id, simplest.id);
    assert.deepEqual(later.labels, ["Earliest arrival", "Fewest transfers"]);
});

test("respects boarding restrictions and prohibited transfers", () => {
    const trips = [
        trip("1", [
            ["A", 0, 0, { noPickup: true }],
            ["D", 3],
        ]),
        trip("2", [
            ["A", 0],
            ["B", 4, 4, { noDropOff: true }],
            ["C", 6],
        ]),
        trip("3", [
            ["X", 7],
            ["D", 12],
        ]),
        trip("4", [
            ["C", 10],
            ["D", 14],
        ]),
    ];
    assert.deepEqual(plan(trips), []);
});

test("checks arrival and departure rather than requiring a shared service ID", () => {
    const trips = [
        trip("1", [
            ["A", 0],
            ["B", 5],
        ]),
        {
            ...trip("2", [
                ["X", 8],
                ["D", 12],
            ]),
            serviceId: "Saturday",
        },
    ];
    assert.equal(plan(trips)[0].legs.length, 2);
});

test("continues the previous service day after midnight", () => {
    const prior = getServiceDay("20261128", -1);
    assert.equal(prior.date, "20261127");
    assert.equal(
        new Date(prior.originMs + 25 * 3600000).toISOString(),
        "2026-11-28T06:00:00.000Z",
    );
});
