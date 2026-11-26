import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { MongoClient } from "mongodb";

test("Firebase accounts own persistent MongoDB profiles and saved commutes", async (t) => {
    const uri = process.env.MONGODB_URI;
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const projectId = process.env.FIREBASE_PROJECT_ID || "demo-greybox";

    assert.ok(uri, "Set MONGODB_URI to a running MongoDB server before running this test.");
    assert.match(emulatorHost || "", /^(127\.0\.0\.1|localhost):\d+$/, "Start the local Firebase Auth emulator and set FIREBASE_AUTH_EMULATOR_HOST.");
    assert.ok(projectId.startsWith("demo-"), "Use a demo- Firebase project ID for account tests.");

    const testId = randomUUID().replaceAll("-", "");
    const databaseName = `greybox_accounts_test_${testId}`;
    Object.assign(process.env, {
        NODE_ENV: "test",
        FIREBASE_PROJECT_ID: projectId,
        MONGODB_DB_NAME: databaseName,
        TRANSIT_DATA_MODE: "mock",
    });

    const { default: app } = await import("../src/app.js");
    const { closeDatabase } = await import("../src/database.js");
    const inspector = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    const database = inspector.db(databaseName);
    const users = database.collection("users");
    const accounts = [];
    let server;
    let baseUrl;

    async function authRequest(action, body) {
        const response = await fetch(
            `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-key`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000),
            }
        );
        return { status: response.status, data: await response.json() };
    }

    t.after(async () => {
        if (server?.listening) {
            await new Promise((resolve) => server.close(resolve));
        }
        await closeDatabase();
        // This database name and these Auth accounts are created only by this run.
        try {
            await database.dropDatabase();
        } finally {
            await inspector.close();
            await Promise.allSettled(accounts.map((account) =>
                authRequest("delete", { idToken: account.idToken })
            ));
        }
    });

    async function startApi() {
        server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    }

    async function request(method, path, account, body) {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${account?.idToken || "invalid-token"}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });
        return { status: response.status, body: await response.json(), headers: response.headers };
    }

    await inspector.connect();
    await startApi();

    for (const name of ["owner", "other"]) {
        const result = await authRequest("signUp", {
            email: `${name}-${testId}@example.test`,
            password: `Test-only-${testId}`,
            returnSecureToken: true,
        });
        assert.equal(result.status, 200);
        accounts.push(result.data);
    }
    const [owner, other] = accounts;
    const commute = {
        stationId: "R16",
        routeId: "N",
        stopId: "R16N",
        stationName: "Times Sq-42 St",
        directionLabel: "Uptown",
    };
    const commutePath = "/users/me/saved-commutes/R16%3AN%3AR16N";

    await t.test("invalid credentials cannot create or read profiles", async () => {
        const noToken = await fetch(`${baseUrl}/users/me`);
        assert.equal(noToken.status, 401);
        assert.equal((await request("GET", "/users/me")).status, 401);
        assert.equal(await users.countDocuments(), 0);
    });

    await t.test("concurrent first visits create one profile", async () => {
        const responses = await Promise.all(Array.from({ length: 12 }, () =>
            request("GET", "/users/me", owner)
        ));
        assert.ok(responses.every((response) => response.status === 200));
        assert.equal(await users.countDocuments({ _id: owner.localId }), 1);
        assert.deepEqual(responses[0].body.data.savedCommutes, []);
        assert.equal(responses[0].headers.get("cache-control"), "no-store");
    });

    await t.test("profiles created before saved commutes keep their other fields", async () => {
        await users.updateOne({ _id: owner.localId }, {
            $set: { favorites: ["A"], displayName: "Existing profile" },
            $unset: { savedCommutes: "" },
        });
        assert.deepEqual((await request("GET", "/users/me", owner)).body.data.savedCommutes, []);
        assert.equal((await request("PUT", commutePath, owner, commute)).status, 200);
        const stored = await users.findOne({ _id: owner.localId });
        assert.deepEqual(stored.favorites, ["A"]);
        assert.equal(stored.displayName, "Existing profile");
    });

    await t.test("concurrent saves deduplicate by station, line, and direction", async () => {
        const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
            request("PUT", commutePath, owner, { ...commute, directionLabel: `Label ${index}` })
        ));
        assert.ok(responses.every((response) => response.status === 200));
        const stored = await users.findOne({ _id: owner.localId });
        assert.equal(stored.savedCommutes.length, 1);

        await Promise.all([
            request("PUT", "/users/me/saved-commutes/R16%3AN%3AR16S", owner, {
                ...commute, stopId: "R16S", directionLabel: "Downtown",
            }),
            request("PUT", "/users/me/saved-commutes/R16%3AQ%3AR16N", owner, {
                ...commute, routeId: "Q",
            }),
        ]);
        assert.equal((await users.findOne({ _id: owner.localId })).savedCommutes.length, 3);
    });

    await t.test("requests cannot read or remove another user's saved commutes", async () => {
        assert.deepEqual((await request("GET", "/users/me", other)).body.data.savedCommutes, []);
        await request("DELETE", commutePath, other);
        assert.equal((await users.findOne({ _id: owner.localId })).savedCommutes.length, 3);
    });

    await t.test("invalid commute bodies fail before changing stored data", async () => {
        for (const body of [
            { ...commute, stationId: { $ne: null } },
            { ...commute, routeId: "Q" },
            { ...commute, stopId: "R17N" },
            { ...commute, directionLabel: " " },
        ]) {
            assert.equal((await request("PUT", commutePath, owner, body)).status, 400);
        }
        assert.equal((await users.findOne({ _id: owner.localId })).savedCommutes.length, 3);
    });

    await t.test("saved data survives reconnecting and restarting the API", async () => {
        await new Promise((resolve) => server.close(resolve));
        await closeDatabase();
        await startApi();
        assert.equal((await request("GET", "/users/me", owner)).body.data.savedCommutes.length, 3);
    });

    await t.test("password recovery preserves the Firebase identity and saved commutes", async () => {
        const resetRequest = await authRequest("sendOobCode", {
            requestType: "PASSWORD_RESET", email: owner.email,
        });
        assert.equal(resetRequest.status, 200);
        const oobResponse = await fetch(
            `http://${emulatorHost}/emulator/v1/projects/${projectId}/oobCodes`,
            { signal: AbortSignal.timeout(10000) }
        );
        assert.equal(oobResponse.status, 200);
        const { oobCodes } = await oobResponse.json();
        const resetCode = oobCodes.find((code) => code.email === owner.email && code.requestType === "PASSWORD_RESET");
        assert.ok(resetCode, "The Auth emulator should have a password reset email for this test account.");
        const newPassword = `Reset-only-${testId}`;
        assert.equal((await authRequest("resetPassword", {
            oobCode: resetCode.oobCode, newPassword,
        })).status, 200);
        assert.equal((await authRequest("signInWithPassword", {
            email: owner.email, password: `Test-only-${testId}`, returnSecureToken: true,
        })).status, 400);
        const signedIn = await authRequest("signInWithPassword", {
            email: owner.email, password: newPassword, returnSecureToken: true,
        });
        assert.equal(signedIn.status, 200);
        assert.equal(signedIn.data.localId, owner.localId);
        owner.idToken = signedIn.data.idToken;
        const profile = await request("GET", "/users/me", owner);
        assert.equal(profile.status, 200);
        assert.equal(profile.body.data.savedCommutes.length, 3);
        assert.equal(await users.countDocuments({ _id: owner.localId }), 1);
    });

    await t.test("database connection failures can be retried", async () => {
        await closeDatabase();
        const unusedPort = createServer().listen(0, "127.0.0.1");
        await once(unusedPort, "listening");
        const { port } = unusedPort.address();
        await new Promise((resolve) => unusedPort.close(resolve));
        process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}`;
        try {
            assert.equal((await request("GET", "/users/me", owner)).status, 503);
            assert.equal((await request("GET", "/auth/me", owner)).status, 200);
        } finally {
            await closeDatabase();
            process.env.MONGODB_URI = uri;
        }
        const result = await request("GET", "/users/me", owner);
        assert.equal(result.status, 200);
        assert.equal(result.body.data.savedCommutes.length, 3);
    });

    await t.test("repeated removal is safe and preserves other directions", async () => {
        assert.equal((await request("DELETE", commutePath, owner)).status, 200);
        assert.equal((await request("DELETE", commutePath, owner)).status, 200);
        assert.equal((await request("GET", "/users/me", owner)).body.data.savedCommutes.length, 2);
        assert.equal((await fetch(`${baseUrl}/transit/stations`)).status, 200);
    });
});
