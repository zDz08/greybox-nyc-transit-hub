import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

const calendarUrl = new URL(
    "../../../data/gtfs/calendar.txt",
    import.meta.url
);

const exceptionsUrl = new URL(
    "../../../data/gtfs/calendar_dates.txt",
    import.meta.url
);

let calendarPromise = null;

async function readCsv(fileUrl) {
    const text = await readFile(fileUrl, "utf8");

    return parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
    });
}

async function loadCalendar() {
    if (!calendarPromise) {
        calendarPromise = Promise.all([
            readCsv(calendarUrl),
            readCsv(exceptionsUrl),
        ]).catch((error) => {
            calendarPromise = null;
            throw error;
        });
    }

    return calendarPromise;
}

export async function getActiveServiceIds({ date, weekday }) {
    const [calendar, exceptions] = await loadCalendar();

    const activeServiceIds = new Set();

    for (const service of calendar) {
        const withinDateRange =
            date >= service.start_date &&
            date <= service.end_date;

        const runsOnWeekday = service[weekday] === "1";

        if (withinDateRange && runsOnWeekday) {
            activeServiceIds.add(service.service_id);
        }
    }

    for (const exception of exceptions) {
        if (exception.date !== date) continue;

        if (exception.exception_type === "1") {
            activeServiceIds.add(exception.service_id);
        } else if (exception.exception_type === "2") {
            activeServiceIds.delete(exception.service_id);
        }
    }

    return activeServiceIds;
}