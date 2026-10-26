import express from "express";
import apiRoutes from "./routes/index.js"

const app = express();

app.use(express.json({limit: "100kb"}));

app.use("/api", apiRoutes);

// Unmatched routes return JSON
app.use((req, res) => {
    res.status(404).json({
        error: {
            code: "NOT_FOUND",
            message: "Endpoint not found",
        },
    });
});

// Error middleware must come after the routes
app.use((err, req, res, next) => {
    if(res.headersSent) {
        return next(err);
    }

    if(err.type === "entity.parse.failed") {
        return res.status(400).json({
            error: {
            code: "INVALID_JSON",
            message: "Request body must contain valid JSON",
            },
        });
    }

    if(err.type === "entity.too.large") {
        return res.status(413).json({
            error: {
                code: "PAYLOAD_TOO_LARGE",
                message: "Request body exceeds the size limit",
            },
        });
    }

    console.error(err);

    res.status(500).json({
        error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected server error occurred",
        },
    });
});

export default app;