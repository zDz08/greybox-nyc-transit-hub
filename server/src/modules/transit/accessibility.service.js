const ENE_FEED_URL =
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json";
//const ENE_FEED_URL =
  //  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_broken.json](https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_broken.json"
const ENE_EQUIPMENTS_URL =
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json";

const ENE_CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const EQUIPMENTS_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

let cachedOutages = null;
let outagesCacheExpiresAt = 0;
let pendingOutagesRequest = null;

let cachedEquipments = null;
let equipmentsCacheExpiresAt = 0;
let pendingEquipmentsRequest = null;

const STREET_ABBR_MAP = new Map([
    ["street", "st"],
    ["str", "st"],
    ["avenue", "av"],
    ["ave", "av"],
    ["square", "sq"],
    ["place", "pl"],
    ["park", "pk"],
    ["parks", "pk"],
    ["fort", "ft"],
    ["mount", "mt"],
    ["boulevard", "blvd"],
    ["road", "rd"],
]);

function normalizeStationName(name = "") {
    const cleaned = String(name)
        .toLowerCase()
        .replace(/\(.*?\)/g, " ")
        .replace(
            /\b(north|south|east|west|uptown|downtown|brooklyn|manhattan|queens|bronx)\b/g,
            " "
        )
        .replace(/['’]/g, "")
        .replace(/[\/\-–—,&.]+/g, " ")
        .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned) return "";

    return cleaned
        .split(" ")
        .map((token) => STREET_ABBR_MAP.get(token) ?? token)
        .join(" ");
}

function parseRoutes(routeString = "") {
    const rawTokens = String(routeString)
        .split(/[\/,\s]+/)
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);

    const expanded = new Set();
    for (const token of rawTokens) {
        expanded.add(token);
        if (/^[A-Z0-9]{2,}$/.test(token) && !/^(SIR|SI)$/.test(token)) {
            for (const ch of token) {
                expanded.add(ch);
            }
        }
    }
    return [...expanded];
}

function mapAdaCode(adaCode) {
    if (adaCode === "1") return "fully-accessible";
    if (adaCode === "2") return "partially-accessible";
    if (adaCode === "0") return "not-accessible";
    return "unknown";
}

function matchesStationAndRoutes(
    recordStationName,
    recordRouteString,
    stationNorm,
    stationRoutes
) {
    if (!stationNorm) return false;
    const recordNorm = normalizeStationName(recordStationName);
    if (!recordNorm || recordNorm !== stationNorm) {
        return false;
    }

    const recordRoutes = parseRoutes(recordRouteString);
    if (recordRoutes.length === 0 || stationRoutes.size === 0) {
        return true;
    }

    return recordRoutes.some((route) => stationRoutes.has(route));
}

async function fetchJsonArray(url, label) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        throw new Error(`${label} request failed: HTTP ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
}

export async function getOutagesFeed() {
    if (cachedOutages && Date.now() < outagesCacheExpiresAt) {
        return cachedOutages;
    }

    if (pendingOutagesRequest) {
        return pendingOutagesRequest;
    }

    pendingOutagesRequest = fetchJsonArray(ENE_FEED_URL, "ENE outage feed");

    try {
        cachedOutages = await pendingOutagesRequest;
        outagesCacheExpiresAt = Date.now() + ENE_CACHE_DURATION_MS;
        return cachedOutages;
    } finally {
        pendingOutagesRequest = null;
    }
}

export async function getEquipmentsFeed() {
    if (cachedEquipments && Date.now() < equipmentsCacheExpiresAt) {
        return cachedEquipments;
    }

    if (pendingEquipmentsRequest) {
        return pendingEquipmentsRequest;
    }

    pendingEquipmentsRequest = fetchJsonArray(
        ENE_EQUIPMENTS_URL,
        "ENE equipments feed"
    );

    try {
        cachedEquipments = await pendingEquipmentsRequest;
        equipmentsCacheExpiresAt = Date.now() + EQUIPMENTS_CACHE_DURATION_MS;
        return cachedEquipments;
    } finally {
        pendingEquipmentsRequest = null;
    }
}

export function getStationAccessibility(
    station,
    outages = [],
    equipments = [],
    options = {}
) {
    const outageFeedAvailable = options.outageFeedAvailable ?? true;
    const equipmentFeedAvailable = options.equipmentFeedAvailable ?? true;

    const stationNorm = normalizeStationName(station.stop_name);
    const stationRoutes = new Set(parseRoutes(station.daytime_routes ?? ""));

    const matchedEquipments = equipmentFeedAvailable
        ? equipments.filter((eq) =>
              matchesStationAndRoutes(
                  eq.station,
                  eq.linesservedbyelevator || eq.trainno,
                  stationNorm,
                  stationRoutes
              )
          )
        : [];

    const uniqueEquipments = [];
    const seenEquipmentCodes = new Set();
    const equipmentByCode = new Map();

    for (const eq of matchedEquipments) {
        const code = eq.equipmentno;
        if (code) {
            if (!equipmentByCode.has(code)) {
                equipmentByCode.set(code, eq);
            }
            if (seenEquipmentCodes.has(code)) {
                continue;
            }
            seenEquipmentCodes.add(code);
        }
        uniqueEquipments.push(eq);
    }

    const matchedOutages = outageFeedAvailable
        ? outages.filter((item) =>
              matchesStationAndRoutes(
                  item.station,
                  item.trainno,
                  stationNorm,
                  stationRoutes
              )
          )
        : [];

    const formatOutage = (item) => {
        const eqMeta = equipmentByCode.get(item.equipment);
        return {
            equipment: item.equipment,
            type: item.equipmenttype,
            serving:
                item.serving || eqMeta?.serving || eqMeta?.shortdescription || "",
            ada: item.ADA === "Y" || eqMeta?.ADA === "Y",
            reason: item.reason,
            outageDate: item.outagedate,
            estimatedReturnToService: item.estimatedreturntoservice,
            isUpcomingOutage: item.isupcomingoutage === "Y",
            isMaintenanceOutage: item.ismaintenanceoutage === "Y",
            alternativeRoute: eqMeta?.alternativeroute || "",
            busConnections: eqMeta?.busconnections || "",
        };
    };

    const activeItems = matchedOutages.filter(
        (item) => item.isupcomingoutage !== "Y"
    );
    const upcomingItems = matchedOutages.filter(
        (item) => item.isupcomingoutage === "Y"
    );

    const activeEquipmentCodes = new Set(
        activeItems.map((item) => item.equipment).filter(Boolean)
    );
    const upcomingEquipmentCodes = new Set(
        upcomingItems.map((item) => item.equipment).filter(Boolean)
    );

    const elevatorsOut = activeItems
        .filter((item) => item.equipmenttype === "EL")
        .map(formatOutage);
    const escalatorsOut = activeItems
        .filter((item) => item.equipmenttype === "ES")
        .map(formatOutage);
    const upcomingOutages = upcomingItems.map(formatOutage);

    const canDetermineEquipmentStatus = outageFeedAvailable && equipmentFeedAvailable;

    const normalizedEquipments = uniqueEquipments.map((eq) => {
        const code = eq.equipmentno;
        const isActive = eq.isactive === "Y";
        const isOutOfService =
            canDetermineEquipmentStatus && isActive && activeEquipmentCodes.has(code);
        const hasUpcomingOutage =
            canDetermineEquipmentStatus &&
            isActive &&
            !isOutOfService &&
            upcomingEquipmentCodes.has(code);

        let status = "unknown";
        if (!isActive) {
            status = "inactive";
        } else if (!canDetermineEquipmentStatus) {
            status = "unknown";
        } else if (isOutOfService) {
            status = "out-of-service";
        } else if (hasUpcomingOutage) {
            status = "upcoming-outage";
        } else {
            status = "available";
        }

        return {
            equipment: code,
            type: eq.equipmenttype,
            isAda: eq.ADA === "Y",
            isActive,
            status,
            serving: eq.serving || eq.shortdescription || "",
            shortDescription: eq.shortdescription || "",
            linesServed: eq.linesservedbyelevator || eq.trainno || "",
            alternativeRoute: eq.alternativeroute || "",
            busConnections: eq.busconnections || "",
        };
    });

    const availableElevators = canDetermineEquipmentStatus
        ? normalizedEquipments.filter(
              (eq) => eq.type === "EL" && eq.status === "available"
          )
        : [];
    const availableEscalators = canDetermineEquipmentStatus
        ? normalizedEquipments.filter(
              (eq) => eq.type === "ES" && eq.status === "available"
          )
        : [];

    const hasOutage =
        outageFeedAvailable && (elevatorsOut.length > 0 || escalatorsOut.length > 0);

    return {
        adaStatus: mapAdaCode(station.ada),
        adaNotes: station.ada_notes ?? null,
        outageFeedAvailable,
        equipmentFeedAvailable,
        hasOutage,
        elevatorsOutOfServiceCount: outageFeedAvailable ? elevatorsOut.length : null,
        escalatorsOutOfServiceCount: outageFeedAvailable ? escalatorsOut.length : null,
        availableElevatorCount: canDetermineEquipmentStatus
            ? availableElevators.length
            : null,
        availableEscalatorCount: canDetermineEquipmentStatus
            ? availableEscalators.length
            : null,
        upcomingOutageCount: outageFeedAvailable ? upcomingOutages.length : null,
        elevatorsOutOfService: elevatorsOut,
        escalatorsOutOfService: escalatorsOut,
        availableElevators,
        availableEscalators,
        upcomingOutages,
        equipments: normalizedEquipments,
    };
}