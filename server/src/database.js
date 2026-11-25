import { MongoClient } from "mongodb";

let client;
let connection;

export async function getDatabase() {
    if (!process.env.MONGODB_URI) {
        throw new Error("MongoDB connection is not configured");
    }

    if (!connection) {
        client = new MongoClient(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            socketTimeoutMS: 10000,
        });
        connection = client.connect().catch(async (error) => {
            await client.close();
            connection = null;
            throw error;
        });
    }

    await connection;
    return client.db(process.env.MONGODB_DB_NAME || "greybox_transit");
}

export async function closeDatabase() {
    await client?.close();
    connection = null;
    client = null;
}
