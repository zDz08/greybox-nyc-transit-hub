// Persist only the last successful calculation for each saved commute.
const prefix = "greybox:commute-results:v1:";
const memory = new Map();
const initialized = new Set();

function persist(uid) {
    try {
        const entries = [...memory.get(uid)];
        if (entries.length) localStorage.setItem(prefix + uid, JSON.stringify(entries));
        else localStorage.removeItem(prefix + uid);
    } catch {
        // In private or quota-limited storage, keep the in-memory results.
    }
}

function forUser(uid) {
    if (!initialized.has(uid)) {
        initialized.add(uid);
        let entries = new Map();
        try {
            if (performance.getEntriesByType("navigation")[0]?.type === "reload") {
                localStorage.removeItem(prefix + uid);
            } else {
                entries = new Map(JSON.parse(localStorage.getItem(prefix + uid) || "[]"));
            }
        } catch {
            // An unreadable snapshot is treated as an empty cache.
        }
        memory.set(uid, entries);
    }
    return memory.get(uid);
}

export function initResults(uid) {
    forUser(uid);
}

export function readResults(uid, id) {
    return forUser(uid).get(id);
}

export function writeResults(uid, id, snapshot) {
    forUser(uid).set(id, snapshot);
    persist(uid);
}

export function forgetResults(uid, id) {
    forUser(uid).delete(id);
    persist(uid);
}

export function clearUserResults(uid) {
    forUser(uid).clear();
    persist(uid);
}
