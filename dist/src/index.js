"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const user_route_1 = __importDefault(require("../src/modules/users/user.route"));
const upload_route_1 = __importDefault(require("../src/modules/upload/upload.route"));
const db_1 = require("./config/db");
const path_1 = __importDefault(require("path"));
const express = require('express');
const cors = require('cors');
const PORT = process.env.PORT || 8000;
const app = express();
app.use(express.json());
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://cliento-server.vercel.app",
        "https://cliento-crm.vercel.app"
    ],
    credentials: true
}));
const swaggerServerUrl = process.env.SWAGGER_SERVER_URL || `http://localhost:${PORT}`;
const swaggerSpec = (0, swagger_jsdoc_1.default)({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Cliento Server API',
            version: '1.0.0',
            description: 'API documentation for Clento Server',
        },
        servers: [
            {
                url: swaggerServerUrl,
            },
        ],
    },
    apis: [path_1.default.resolve(process.cwd(), 'src/modules/**/*.ts')],
});
app.use('/api-docs', swagger_ui_express_1.default.serve);
app.get('/api-docs', swagger_ui_express_1.default.setup(swaggerSpec));
// Database connection
(0, db_1.connectDB)();
app.use('/api/auth', user_route_1.default);
app.use('/api/upload', upload_route_1.default);
app.get('/', (_req, res) => {
    return res
        .status(200)
        .type('html')
        .send(`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cliento CRM API</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Space Grotesk", "IBM Plex Sans", "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #f8f4ff 0%, #f2f7ff 45%, #ffffff 100%);
        color: #0f172a;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: min(720px, 100%);
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 36px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #eef2ff;
        color: #3730a3;
        font-weight: 600;
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      h1 {
        margin: 18px 0 8px;
        font-size: 34px;
        letter-spacing: -0.02em;
      }
      p {
        margin: 0 0 22px;
        color: #475569;
        line-height: 1.6;
      }
      .cta {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: #0f172a;
        color: #ffffff;
        text-decoration: none;
        padding: 12px 20px;
        border-radius: 12px;
        font-weight: 600;
        transition: transform 150ms ease, box-shadow 150ms ease;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
      }
      .cta:hover {
        transform: translateY(-2px);
      }
      .meta {
        margin-top: 26px;
        font-size: 12px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="badge">Cliento CRM</span>
      <h1>API is running</h1>
      <p>Explore endpoints, schemas, and live testing through the Swagger docs.</p>
      <a class="cta" href="/api-docs">Open API Docs →</a>
      <div class="meta">Environment ready · ${new Date().toUTCString()}</div>
    </main>
  </body>
</html>
        `);
});
app.listen(PORT, () => {
    console.log('====> Server running on', PORT);
});
