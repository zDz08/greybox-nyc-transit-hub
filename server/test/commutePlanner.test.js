import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex, findOptions } from "../src/modules/transit/commutePlanner.js";

function trip(routeId, ids, serviceId = "Weekday") {
    return {
        routeId,
        serviceId,
        stops: ids.split("").map((stationId) => ({ stationId, stopId: stationId + "N" })),
    };
}
const stations = new Map(
    [..."ABCDEFX"].map((id) => [id, { stop_name: id === "X" ? "C" : id }]),
);
const link = (from_stop_id, to_stop_id, transfer_type = "2") => ({
    from_stop_id,
    to_stop_id,
    transfer_type,
});

test("uses directed transfer links and ordered stops across multiple rides", () => {
    const trips = [trip("1", "ABC"), trip("2", "XDE"), trip("3", "EF")];
    const plan = (links, from, to) => findOptions(buildIndex(trips, stations, links), from, to);
    const links = [link("C", "X"), link("E", "E")];
    const [option] = plan(links, "A", "E");
    assert.deepEqual(
        option.legs.map((l) => [l.routeId, l.board.id, l.exit.id]),
        [
            ["1", "A", "C"],
            ["2", "X", "E"],
        ],
    );
    assert.deepEqual(
        plan(links, "A", "F")[0].legs.map((leg) => leg.routeId),
        ["1", "2", "3"],
    );
    assert.deepEqual(plan(links, "E", "A"), []);
    assert.deepEqual(plan([link("X", "C")], "A", "E"), []);
    assert.deepEqual(plan([link("C", "X", "3")], "A", "E"), []);
    assert.equal(plan(links, "A", "C")[0].legs.length, 1);
    assert.equal(plan(links, "A", "E")[0].id, option.id);
});

test("excludes disjoint service IDs and keeps only shared intermediate stops", () => {
    const index = buildIndex(
        [trip("1", "ABC"), trip("1", "AC"), trip("2", "XDE", "Sunday")],
        stations,
        [link("C", "X")],
    );
    assert.deepEqual(findOptions(index, "A", "C")[0].legs[0].via, []);
    assert.deepEqual(findOptions(index, "A", "E"), []);
});

test("returns only the first successful BFS layer and caps distinct alternatives", () => {
    const trips = [
        ...Array.from({ length: 10 }, (_, i) => trip(String(i), "ABC")),
        trip("L", "AB"),
        trip("M", "BC"),
    ];
    const index = buildIndex(trips, stations, [link("B", "B")]);
    const options = findOptions(index, "A", "C");
    assert.equal(options.length, 6);
    assert.equal(new Set(options.map((option) => option.id)).size, 6);
    assert.ok(options.every((option) => option.legs.length === 1));
});

test("preserves same-depth alternatives at a shared transfer station", () => {
    const index = buildIndex(
        [trip("1", "ABC"), trip("2", "AC"), trip("3", "CD"), trip("4", "DE")],
        stations,
        [link("C", "C"), link("D", "D")],
    );

    assert.deepEqual(
        findOptions(index, "A", "E").map((option) => option.legs.map((leg) => leg.routeId)),
        [
            ["2", "3", "4"],
            ["1", "3", "4"],
        ],
    );
});

test("exhausts cycles and does not combine legs with incompatible service IDs", () => {
    const trips = [
        trip("1", "AB"),
        trip("2", "BC"),
        trip("2", "BC", "Sunday"),
        trip("3", "CD", "Sunday"),
        trip("4", "CA"),
        trip("5", "EF"),
    ];
    const transfers = ["A", "B", "C"].map((id) => link(id, id));
    const index = buildIndex(trips, stations, transfers);

    assert.deepEqual(findOptions(index, "A", "D"), []);
    assert.deepEqual(findOptions(index, "A", "F"), []);
    assert.equal(findOptions(index, "B", "D")[0].legs.length, 2);
});

test("can find a route when three transfers are necessary", () => {
    const index = buildIndex(
        [trip("1", "AB"), trip("2", "BC"), trip("3", "CD"), trip("4", "DE")],
        stations,
        ["B", "C", "D"].map((id) => link(id, id)),
    );

    assert.deepEqual(
        findOptions(index, "A", "E")[0].legs.map((leg) => leg.routeId),
        ["1", "2", "3", "4"],
    );
});
