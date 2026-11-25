import express from "express";
import { config } from "./config.js";
import { installSecurity } from "./fourni/auth/index.js";

export function createApp() {
    const app = express();

    installSecurity(app, {
        corsOrigin: config.CORS_ORIGIN
    });

    return app;
}