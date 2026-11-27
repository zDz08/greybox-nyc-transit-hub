const FEED_URL =
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";

let cached = null;
let pending = null;

function english(value) {
    const items = value?.translation ?? [];

    return (
        items.find((item) => item.language === "en") ??
        items.find((item) => !item.language)
    )?.text?.trim() ?? "";
}

export function normalizeAlerts(feed, now = Date.now()) {
    const seconds = now / 1000;

    return (feed.entity ?? []).flatMap((entity) => {
        if (entity.is_deleted || !entity.alert) return [];

        const alert = entity.alert;
        const extra = alert["transit_realtime.mercury_alert"] ?? {};

        const periods = (
            alert.active_period?.length ? alert.active_period : [{}]
        ).map((period) => ({
            start: period.start == null ? null : Number(period.start),
            end: period.end == null ? null : Number(period.end),
        }));

        const current = periods.some(
            (period) =>
                (period.start == null || period.start <= seconds) &&
                (period.end == null || seconds < period.end)
        );

        const future = periods.filter(
            (period) =>
                period.start != null &&
                period.start > seconds &&
                (period.end == null || period.end > period.start)
        );

        if (!current && !future.length) return [];

        const targets = (alert.informed_entity ?? [])
            .filter((item) => !item.agency_id || item.agency_id === "MTASBWY")
            .map((item) => {
                const routeId = item.route_id ?? item.trip?.route_id ?? null;

                return {
                    routeId: routeId === "SIR" ? "SI" : routeId,
                    stopId: item.stop_id ?? null,
                    tripId: item.trip?.trip_id ?? null,
                    startDate: item.trip?.start_date ?? null,
                    startTime: item.trip?.start_time ?? null,
                    directionId: item.direction_id ?? item.trip?.direction_id ?? null,
                    routeType: item.route_type ?? null,
                };
            });

        const routeIds = [
            ...new Set(targets.map((target) => target.routeId).filter(Boolean)),
        ].sort();

        return [{
            id: entity.id,
            title: english(alert.header_text) || "Service update",
            description: english(alert.description_text),
            type: extra.alert_type || "Service update",
            routeIds,
            targets,
            status: current ? "current" : "upcoming",
            nextStart: future.length
                ? new Date(
                    Math.min(...future.map((period) => period.start)) * 1000
                ).toISOString()
                : null,
            schedule: english(extra.human_readable_active_period),
            activePeriods: periods,
        }];
    });
}

async function loadFeed() {
    if (cached && Date.now() - cached.fetchedAt < 30000) {
        return cached;
    }

    if (!pending) {
        pending = (async () => {
            const response = await fetch(FEED_URL, {
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                throw new Error("MTA alerts request failed.");
            }

            const feed = await response.json();

            if (
                !Array.isArray(feed.entity) ||
                !Number.isFinite(Number(feed.header?.timestamp)) ||
                Number(feed.header.timestamp) <= 0
            ) {
                throw new Error("Invalid MTA alerts response.");
            }

            cached = {
                feed,
                fetchedAt: Date.now(),
            };

            return cached;
        })().finally(() => {
            pending = null;
        });
    }

    return pending;
}

export async function getServiceAlerts() {
    const { feed, fetchedAt } = await loadFeed();
    const updated = Number(feed.header.timestamp) * 1000;

    return {
        data: {
            alerts: normalizeAlerts(feed),
        },
        meta: {
            source: "mta-service-alerts",
            feedUpdatedAt: new Date(updated).toISOString(),
            fetchedAt: new Date(fetchedAt).toISOString(),
            stale:
                Date.now() - updated > 10 * 60 * 1000 ||
                updated > Date.now() + 60000,
        },
    };
}