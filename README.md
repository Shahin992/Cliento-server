# Cliento Server

Backend API for the Cliento CRM platform. This service manages authentication, users, contacts, deals, pipelines, and file uploads.

## Project Overview

Cliento Server is an Express + TypeScript + MongoDB API that provides:
- Authentication and user management
- Contact management (including contact photo upload)
- Deal and pipeline management for CRM workflows
- File upload support via Cloudinary
- Email delivery for onboarding and password reset flows (Brevo)
- Gmail OAuth integration for user mailbox send/receive
- Interactive API documentation with Swagger (`/api-docs`)

## Tech Stack

- Node.js
- TypeScript
- Express
- MongoDB + Mongoose
- JWT authentication
- Cloudinary (media upload)
- Brevo SMTP/API (email)
- Google OAuth + Gmail API (connected mailbox)
- Swagger UI + swagger-jsdoc

## Project Setup

### 1. Prerequisites

- Node.js 18+
- npm
- MongoDB database (Atlas or self-hosted)
- Cloudinary account (for uploads)
- Brevo account (for email features)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root (or copy from `.env.example`) and set values for:


### 4. Run the project

```bash
npm start
```

Server starts on `http://localhost:8000` by default (or your `PORT` value).

### 5. API docs

Open Swagger UI at:

```text
http://localhost:8000/api-docs
```

## Available Scripts

- `npm start` - Run the TypeScript server with `ts-node`
- `npm run build` - Compile TypeScript to `dist/`

## Main API Modules

- `/api/auth`
- `/api/users`
- `/api/upload`
- `/api/contacts`
- `/api/pipelines`
- `/api/deals`
- `/api/mail/google`

## To Be Continued

More documentation will be added soon.
