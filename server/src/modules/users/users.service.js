import { getDatabase } from "../../database.js";

function profileData(user) {
    return {
        uid: user._id,
        email: user.email,
        savedCommutes: user.savedCommutes ?? [],
    };
}

async function getUserCollection() {
    const database = await getDatabase();
    return database.collection("users");
}

export async function getUserProfile(identity) {
    const users = await getUserCollection();
    const filter = { _id: identity.uid };
    const update = {
        $set: { email: identity.email ?? null },
        $setOnInsert: { createdAt: new Date(), savedCommutes: [] },
    };

    let user;
    try {
        user = await users.findOneAndUpdate(filter, update, {
            upsert: true,
            returnDocument: "after",
        });
    } catch (error) {
        // Concurrent first visits can both try to insert the same Firebase UID.
        if (error.code !== 11000) throw error;
        user = await users.findOneAndUpdate(filter, update, {
            returnDocument: "after",
        });
    }

    return profileData(user);
}

export function parseSavedCommute(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;

    const { stationId, routeId, stopId, stationName, directionLabel } = body;
    if (typeof stationId !== "string" || !/^[A-Za-z0-9_-]{1,20}$/.test(stationId)) return null;
    if (typeof routeId !== "string" || !/^[A-Z0-9]{1,4}$/.test(routeId)) return null;
    if (stopId !== `${stationId}N` && stopId !== `${stationId}S`) return null;
    if (typeof stationName !== "string" || !stationName.trim() || stationName.length > 160) return null;
    if (typeof directionLabel !== "string" || !directionLabel.trim() || directionLabel.length > 200) return null;

    return {
        id: `${stationId}:${routeId}:${stopId}`,
        stationId,
        routeId,
        stopId,
        stationName: stationName.trim(),
        directionLabel: directionLabel.trim(),
    };
}

export async function saveCommute(identity, commute) {
    await getUserProfile(identity);
    const users = await getUserCollection();

    // Match the identity and the commute key in the same atomic update.
    // Retrying a save, including with changed display labels, keeps one entry.
    await users.updateOne(
        { _id: identity.uid, "savedCommutes.id": { $ne: commute.id } },
        { $push: { savedCommutes: commute } }
    );

    return profileData(await users.findOne({ _id: identity.uid }));
}

export async function removeCommute(identity, commuteId) {
    await getUserProfile(identity);
    const users = await getUserCollection();
    const user = await users.findOneAndUpdate(
        { _id: identity.uid },
        { $pull: { savedCommutes: { id: commuteId } } },
        { returnDocument: "after" }
    );

    return profileData(user);
}
