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

    for(const part of newYorkFormatter.formatToParts(now)) {
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