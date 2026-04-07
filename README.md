# Ops Command Center

A full-stack operations management platform built for a multi-location education company. Handles sales pipeline tracking, workforce scheduling, tutor management, financial reporting, marketing analytics, and automated communications.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Material UI
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (raw SQL queries, no ORM for performance-critical paths)
- **Integrations**: Stripe, TutorCruncher, Klaviyo, Meta Ads, Google Ads, Brevo, Missive, Webflow

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
# Install dependencies
npm install

# Create local database
createdb ops_command_center

# Copy environment file and add your DATABASE_URL + JWT_SECRET
cp env.example .env

# Run migrations
psql -d ops_command_center -f migrations/001_initial_schema.sql
# (run additional migrations in order as needed)

# Start development server (frontend + backend)
npm run dev
```

The app boots with only `DATABASE_URL` and `JWT_SECRET`. All external service integrations (Stripe, Meta Ads, etc.) are stubbed with realistic mock data when their API keys are not set.

### Environment Variables

See `env.example` for the full list. Only two are required:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT token signing |

All other variables are optional. When not set, the corresponding service returns mock/stub data so the UI still renders.

## Architecture

```
server.js          → Express server entry point
config/deps.js     → Dependency injection (DB pool, API clients, etc.)
routes/            → Express route handlers (100+ API endpoints)
services/          → Business logic and external API integrations
utils/             → Shared utilities (email, logging, alerts)
src/               → React frontend (Vite)
migrations/        → PostgreSQL migration scripts
```

## Key Features

- **Sales Pipeline**: Lead tracking, conversion funnels, attribution analytics
- **Workforce Management**: Contractor profiles, scheduling, payroll integration
- **Financial Dashboard**: Multi-account Stripe revenue tracking, EBITDA calculations
- **Marketing Command Center**: Unified Google Ads + Meta Ads campaign management
- **Communications**: Missive inbox sync, automated email workflows via Brevo
- **Reporting**: Lesson reports, client reports, scorecard system
- **CRM**: Client notes, activity feeds, task automation
