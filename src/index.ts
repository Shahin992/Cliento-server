import 'dotenv/config';
import { Request, Response, NextFunction } from "express";
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import authRoutes from '../src/modules/users/user.route';
import userRoutes from '../src/modules/users/users.route';
import uploadRoutes from '../src/modules/upload/upload.route';
import contactRoutes from '../src/modules/contacts/contact.route';
import contactNoteRoutes from '../src/modules/contacts/contactNote.route';
import pipelineRoutes from '../src/modules/deals/pipeline.route';
import dealRoutes from '../src/modules/deals/deal.route';
import taskRoutes from '../src/modules/tasks/task.route';
import googleMailRoutes from '../src/modules/mail/google.route';
import packageRoutes from '../src/modules/billing/package.route';
import subscriptionRoutes from '../src/modules/subscription/subscription.route';
import dashboardRoutes from '../src/modules/dashboard/dashboard.route';
import { stripeWebhookHandler } from '../src/modules/billing/stripeWebhook.controller';
import { connectDB } from './config/db';
import path from 'path';
const express = require('express');
const cors = require('cors');
const PORT = process.env.PORT || 8000;
const app = express();
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);
app.use(express.json());
const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://localhost:8000",
    "https://cliento-crm.vercel.app",
    "https://cliento-server.vercel.app",
]);

app.use(
    cors({
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow non-browser requests (no Origin) and known origins.
            if (!origin || allowedOrigins.has(origin)) {
                return callback(null, true);
            }

            return callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
    })
);

app.options('*', cors());

const swaggerServerUrl = process.env.SWAGGER_SERVER_URL || `http://localhost:${PORT}`;

const swaggerSpec = swaggerJSDoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Cliento Server API',
            version: '1.0.0',
            description: 'API documentation for Clento Server. More APIs will be added soon.',
        },
        tags: [
            { name: 'Upload' },
            { name: 'Auth' },
            { name: 'Users' },
            { name: 'Contacts' },
            { name: 'Pipelines' },
            { name: 'Deals' },
            { name: 'Tasks' },
            { name: 'Dashboard' },
            { name: 'Mail' },
            { name: 'Packages' },
            { name: 'Subscriptions' },
        ],
        servers: [
            {
                url: swaggerServerUrl,
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [path.resolve(process.cwd(), 'src/modules/**/*.ts')],
});

app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
        tagsSorter: (a: string, b: string) => {
            const tagOrder = ['Upload', 'Auth', 'Users', 'Contacts', 'Pipelines', 'Deals', 'Tasks', 'Dashboard', 'Mail', 'Packages', 'Subscriptions'];
            const rankA = tagOrder.indexOf(a);
            const rankB = tagOrder.indexOf(b);
            const hasRankA = rankA !== -1;
            const hasRankB = rankB !== -1;

            if (hasRankA && hasRankB) return rankA - rankB;
            if (hasRankA) return -1;
            if (hasRankB) return 1;

            return a.localeCompare(b);
        },
        operationsSorter: (a: any, b: any) => {
            const methodA = String(a.get('method') || '').toLowerCase();
            const methodB = String(b.get('method') || '').toLowerCase();
            const pathA = String(a.get('path') || '');
            const pathB = String(b.get('path') || '');

            const pathPriority: Record<string, number> = {
                '/api/upload': 1,
                '/api/auth': 2,
                '/api/users': 3,
                '/api/contacts': 4,
                '/api/contact-notes': 5,
                '/api/pipelines': 6,
                '/api/deals': 7,
                '/api/tasks': 8,
                '/api/mail/google': 9,
                '/api/packages': 10,
                '/api/subscriptions': 11,
            };

            const getPathRank = (path: string) => {
                for (const prefix of Object.keys(pathPriority)) {
                    if (path.startsWith(prefix)) return pathPriority[prefix];
                }
                return Number.MAX_SAFE_INTEGER;
            };

            const rankA = getPathRank(pathA);
            const rankB = getPathRank(pathB);
            if (rankA !== rankB) return rankA - rankB;

            if (pathA !== pathB) return pathA.localeCompare(pathB);

            const methodOrder = ['post', 'get', 'put', 'patch', 'delete', 'options', 'head', 'trace'];
            return methodOrder.indexOf(methodA) - methodOrder.indexOf(methodB);
        },
    },
}));

// Database connection is awaited before server starts.


app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-notes', contactNoteRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/mail/google', googleMailRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.get('/health-check', (_req: Request, res: Response) => {
    return res.status(200).json({
        success: true,
        message: 'OK',
    });
});
app.get('/', (_req: Request, res: Response) => {
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


const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log('====> Server running on', PORT);
        });
        const TEN_MINUTES = 10 * 60 * 1000;
        const rawPingUrl = process.env.KEEP_ALIVE_URL || 'https://cliento-server.vercel.app/health-check';
        const normalizedPingUrl = /^https?:\/\//i.test(rawPingUrl) ? rawPingUrl : `https://${rawPingUrl}`;
        let pingUrl: string | null = null;
        try {
            pingUrl = new URL(normalizedPingUrl).toString();
        } catch {
            console.warn(`Skipping keep-alive ping. Invalid KEEP_ALIVE_URL: ${rawPingUrl}`);
        }

        if (pingUrl) {
            setInterval(async () => {
                try {
                    const response = await fetch(pingUrl);
                    console.log("API docs ping success:", response.status);
                } catch (error) {
                    console.error("Error calling API docs ping:", error);
                }
            }, TEN_MINUTES);
        }
    } catch (error) {
        console.error('====> Failed to start server due to DB connection error', error);
        process.exit(1);
    }
};

startServer();
