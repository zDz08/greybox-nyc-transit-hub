const newYorkFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

export function getNewYorkTime(now = new Date()) {
    const parts = {};

    for (const part of newYorkFormatter.formatToParts(now)) {
        if (part.type !== "literal") {
            parts[part.type] = part.value;
        }
    }

    return {
        date: `${parts.year}${parts.month}${parts.day}`,
        weekday: parts.weekday.toLowerCase(),
        time: `${parts.hour}:${parts.minute}:${parts.second}`,
    };
}
function clockSeconds(time) {
    const [hours, minutes, seconds] = time.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

export function getServiceDay(referenceDate, offset) {
    const year = Number(referenceDate.slice(0, 4));
    const month = Number(referenceDate.slice(4, 6));
    const day = Number(referenceDate.slice(6, 8));

    const dateMarker = new Date(Date.UTC(year, month - 1, day + offset, 12));

    const date = dateMarker.toISOString().slice(0, 10).replaceAll("-", "");

    const weekday = dateMarker
        .toLocaleDateString("en-US", {
            timeZone: "UTC",
            weekday: "long",
        })
        .toLowerCase();

    const localTime = getNewYorkTime(dateMarker);
    const secondsUntilNoon = 12 * 3600 - clockSeconds(localTime.time);

    const localNoonMs = dateMarker.getTime() + secondsUntilNoon * 1000;

    const originMs = localNoonMs - 12 * 3600 * 1000;

    return { date, weekday, originMs };
}
