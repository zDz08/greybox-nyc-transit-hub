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

test("uses directed transfer links, ordered stops and at most two legs", () => {
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
    assert.deepEqual(plan(links, "A", "F"), []);
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
