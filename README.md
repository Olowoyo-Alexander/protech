# PROTECH — Collaborative Student Project Repository & Innovation Hub

A full-stack **MERN** platform for securely storing student projects, collaborating across
academic sets, tracking engagement, and surfacing high-impact work for institutional use.

> Built with **React (Vite)** · **Express** · **MongoDB (Mongoose)** · **Socket.io** ·
> **Cloudinary** · **JWT auth** · **Recharts**.

---

## ✨ Features (mapped to the PRD)

| PRD requirement | Implementation |
| --- | --- |
| Role-based registration (Observer / Student / Supervisor) | JWT auth with role gating on every route |
| Supervisor email verification | 6-digit code via Nodemailer (logged to console in dev) |
| Project creation + document upload | Structured form → Multer → **Cloudinary** (URL stored in MongoDB) |
| Collaboration on projects | Students can join approved projects as co-authors |
| Supervisor approval workflow | Pending → Approved / Rejected (with reason) queue |
| Engagement system | Likes, comments, bookmarks, **weighted** ratings |
| Leaderboard & analytics | Ranked by engagement score + **Recharts** dashboards |
| Advanced search & filtering | Keyword + department + set + status + sort |
| Real-time notifications & DMs | **Socket.io** live notifications and direct messages |

**Weighted ratings:** supervisor ratings count ×1.5. **Engagement score** = `likes×2 + weightedAvgRating×10 + comments×3`.

**Roles & privileges**
- **Observer** — view + comment only
- **Student** — view, create, collaborate, comment, rate
- **Supervisor** — department oversight; approve / reject / moderate + a **dashboard**
- **Admin** — platform super-user: user management, content moderation, taxonomy & platform analytics

### Dashboards
- **Supervisor dashboard** (landing page) — *My Students & Projects* front and centre, an
  awaiting-review queue with one-click approve/reject, department status & set charts, a recent
  activity feed, and the department leaderboard.
- **Admin dashboard** (landing page) — platform KPIs, users-by-role & status pies, projects-by-department,
  a 6-month growth line, plus **User Management** (search, change role, verify, activate/deactivate,
  delete), **Content Moderation** (approve/reject/delete any project), and **Settings** (add/remove
  departments & academic sets, applied live across the app).

---

## 🚀 Quick start (zero-install database)

You need only **Node.js 18+**. The dev setup runs a real, **embedded MongoDB** (binary
downloaded once, data persisted in `server/.mongo-data`) — no manual MongoDB install required.

```bash
# 1. Install everything (root tooling + server + client)
npm install
npm run install:all

# 2. Seed demo data (first run downloads the MongoDB binary — may take a minute)
npm run seed

# 3. Run backend + frontend together
npm run dev
```

Then open **http://localhost:5173**.

> Prefer separate terminals? Run `npm run server` and `npm run client`.

### Demo accounts (password: `demo123`)
| Role | Email |
| --- | --- |
| Admin | `admin@prostech.edu` |
| Supervisor | `s.okonkwo@uni.edu` |
| Student | `c.adeyemi@stu.edu` |
| Observer | `guest@view.edu` |

> Admins are **seeded** (no public admin signup). To make another admin, sign in as admin →
> **Users** → change their role to *Admin*.

---

## 🔧 Configuration

Copy the example env files and fill in what you need:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env   # optional — only for a deployed backend
```

`server/.env` keys:

| Key | Purpose | If left blank |
| --- | --- | --- |
| `MONGO_URI` | Mongo connection (local or **Atlas**) | embedded DB used when `USE_EMBEDDED_DB=true` |
| `JWT_SECRET` | Token signing | **required** — no fallback, `jsonwebtoken` throws if unset |
| `CLOUDINARY_*` | File uploads | uploads disabled (project still saves, filename kept) |
| `BREVO_*` | Supervisor verification emails | code is logged to the server console |

### Using a real MongoDB instead of the embedded one
Set `MONGO_URI` (e.g. a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster), then run
the non-embedded scripts:

```bash
npm run dev --prefix server     # uses MONGO_URI
npm run seed --prefix server    # seeds MONGO_URI
```

### Enabling Cloudinary uploads
Create a free [Cloudinary](https://cloudinary.com) account and set `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Uploaded documents are stored on Cloudinary and
their secure URL is saved on the project.

### Enabling real verification emails
Set `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` — sign up free at [Brevo](https://www.brevo.com), create
an API key, and verify a single sender email (just a confirmation link, no domain/DNS setup needed).
Sent over Brevo's HTTPS API rather than raw SMTP, since most PaaS free tiers (Render included) block
outbound SMTP ports entirely. Without `BREVO_API_KEY`, the verification code is printed to the server
console and surfaced in the UI for dev.

---

## 🗂 Project structure

```
PROJECT/
├── server/                 # Express + Mongoose API
│   └── src/
│       ├── config/         # db, cloudinary, embedded mongo
│       ├── models/         # User, Project, Notification, Message
│       ├── middleware/     # auth, roles, upload, error handling
│       ├── controllers/    # auth, projects, users, notifications, messages, analytics
│       ├── routes/         # REST routes
│       ├── socket/         # Socket.io (presence, live notifications, DMs)
│       └── utils/          # email, notify, cloud upload, seed
└── client/                 # React (Vite) SPA
    └── src/
        ├── api/            # axios client (JWT interceptor)
        ├── context/        # Auth, Socket/notifications, UI
        ├── components/     # Layout, ProjectCard, ProjectModal, NewProjectModal, Avatar
        └── pages/          # Auth, Feed, Leaderboard, Analytics, Approvals, MyProjects, Bookmarks, Messages
```

---

## 📡 API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register (supervisors get a verification step) |
| POST | `/api/auth/verify` | Verify supervisor with code |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/projects` | List (filters: `q,dept,set,status,sort,scope`) |
| POST | `/api/projects` | Create (multipart, optional `document`) |
| PATCH | `/api/projects/:id/approve` \| `/reject` | Supervisor moderation |
| POST | `/api/projects/:id/like` \| `/bookmark` \| `/rate` \| `/comments` \| `/collaborate` | Engagement |
| GET | `/api/analytics` | Aggregated stats for charts |
| GET/POST | `/api/messages/:userId` | DM thread / send |
| GET | `/api/notifications` | User notifications |
| GET | `/api/supervisor/dashboard` | Supervisor dashboard data |
| GET | `/api/admin/overview` | Platform-wide analytics (admin) |
| GET | `/api/admin/users` | List/search users (admin) |
| PATCH | `/api/admin/users/:id/role` \| `/verify` \| `/active` | User management (admin) |
| DELETE | `/api/admin/users/:id` | Delete user (admin) |
| GET | `/api/settings` · PUT `/api/admin/settings` | Read / edit departments & sets |

---

## 🏗 Production build

```bash
npm run build --prefix client      # outputs client/dist
npm start --prefix server          # serves the API AND client/dist from one process
```

**Deployment is single-service:** the Express server serves the built React app
directly (see `server/src/app.js`), so the whole app deploys as one Render web
service backed by MongoDB Atlas — no separate static host needed. See
`render.yaml` for the blueprint and `.env.render.example` for the env vars to
fill in on Render.
