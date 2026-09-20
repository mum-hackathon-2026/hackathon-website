# Workshop 1: Cloud Hosting & Vercel Live Deployment
**Averis X Monash Hackathon 2026**

- **Interactive Presentation Deck:** [`docs/workshop-1-cloud-hosting-slides.html`](file:///c:/Users/ZAID%20AHMED/Documents/hackathon-website/docs/workshop-1-cloud-hosting-slides.html) (or open via local frontend at `http://localhost:4200/documents/workshop-1-slides.html`)
- **Speakers:**
  - **Speaker 1 (Shariq Nauman):** Architecture, Traditional vs. Modern Hosting, Cloud Providers, Security & DNS.
  - **Speaker 2 (Darren Melvern):** Git to Vercel Live Demo, Environment Variables, Preview Branches, Troubleshooting.
- **Estimated Duration:** 45 minutes + 15 minutes Q&A

---

## 1. Workshop Outline & Timeline

| Time | Slide(s) | Topic | Speaker | Key Message |
|------|----------|-------|---------|-------------|
| **00:00 - 05:00** | 1 - 3 | **Welcome & The Hackathon Dilemma** | Shariq | Why localhost is not enough for judges; the 2-hour before submission trap. |
| **05:00 - 10:00** | 4 - 5 | **Hosting Landscape & Vercel / Cloud Run Architecture** | Shariq | VPS vs. PaaS vs. Serverless. Why Vercel for Frontend & Cloud Run for Containers. |
| **10:00 - 15:00** | 6 - 7 | **Secrets, Security & Custom Domains / DNS** | Shariq | Never commit `.env`. Build-time vs Run-time env vars. DNS propagation tips. |
| **15:00 - 35:00** | 8 - 11 | **Hands-on Live Demo: Zero to Deployed in 7 Mins** | Darren | Connect GitHub repo, configure build settings, import env vars, test preview PR. |
| **35:00 - 40:00** | 12 | **Top 5 Hackathon Pitfalls & Debugging** | Darren & Shariq | Dynamic route 404s (SPA rewrite), mixed content HTTP/HTTPS, rate limits. |
| **40:00 - 45:00** | 13 - 14 | **Submission Checklist & Wrap Up** | Both | Health checks, live link verification, slide resources & cheat sheet. |
| **45:00 - 60:00** | - | **Live Q&A / Troubleshooting Office Hours** | Both | Helping teams troubleshoot their deployment configurations. |

---

## 2. Speaker 1 Talk Track (Shariq Nauman)

### Slide 1: Title & Welcome
- **Goal:** Set a high-energy tone. Welcome participants to the first official workshop of the Averis X Monash Hackathon 2026.
- **Talking Points:**
  - *"Welcome everyone! During hackathon weekend, building a brilliant AI or web solution is only half the battle. If the judges can't open your link on Sunday, your hard work goes unseen."*
  - *"Today, we're taking you from `localhost:3000` to a globally distributed, production-grade HTTPS URL in under 7 minutes."*

### Slide 2: The "It Works on My Machine" Curse
- **Talking Points:**
  - Classic mistake: Waiting until 2 hours before the deadline to think about deployment.
  - Why judges test on mobile, iPads, or different corporate Wi-Fi networks where `localhost` or local IP links fail completely.
  - Golden Rule: **Deploy on Day 1 (Friday evening / Saturday morning)** with CI/CD so every commit is automatically live.

### Slide 3: Cloud Hosting Landscape
- **Talking Points:**
  - **Traditional VPS (EC2, Droplets):** Full control, but you have to manage Linux packages, NGINX, SSL certs, and firewall rules. Too slow for a 48h hackathon.
  - **Modern PaaS (Vercel, Netlify):** Zero server management, built-in edge CDN, automatic SSL certificates, pull-request preview environments.
  - **Serverless & Containers (GCP Cloud Run):** Perfect for backend APIs (FastAPI, Spring Boot, Node.js Docker containers) with scale-to-zero pricing.

### Slide 4: Frontend vs. Backend Architecture
- **Talking Points:**
  - Walk through the visual architecture diagram on the slide.
  - Explain how Vercel serves static SPA assets (Angular, React, Next.js, Vite) on edge nodes, while API requests route securely with CORS to backend services on Cloud Run / Fly.io / Render.
  - Explain Database connectivity (Supabase / Postgres / Neon) via connection pooling.

### Slide 5: Secrets, Env Variables & Security
- **Talking Points:**
  - *AGENTS.md and Hackathon Security Rules:* **Never push `.env` to public GitHub repositories.**
  - Difference between client-side exposed env variables (`NEXT_PUBLIC_`, `VITE_`) and server-side secret API keys (OpenAI keys, database passwords).
  - How to configure Environment Variables in the Vercel Dashboard for Production and Preview environments.

### Slide 6: DNS, Domains & Edge Performance
- **Talking Points:**
  - Free default domains provided (`*.vercel.app`, `*.run.app`).
  - Adding custom domains and explaining CNAME / A records.
  - Edge caching benefits: Instant load times for judges anywhere in Malaysia or globally.

---

## 3. Speaker 2 Talk Track & Live Demo (Darren Melvern)

### Preparation Checklist Before Demo:
1. Sample repository prepared on GitHub (e.g. Next.js / Vite / Angular template).
2. Deliberate mock `.env.example` file ready.
3. Vercel account logged in on browser tab.

### Slide 7: Live Demo Setup & Roadmap
- **Talking Points:**
  - *"I'm going to share my screen and deploy a live web application from scratch in front of your eyes."*

### Slide 8: Step-by-Step Live Deployment Walkthrough
1. **GitHub Push:** Show clean `git push origin main`.
2. **Vercel Dashboard:** Click *Add New Project* -> *Import Git Repository*.
3. **Build & Output Settings:** Point out framework preset auto-detection (Vite / Next / Angular).
4. **Environment Variables:** Copy keys from `.env.local` into Vercel's secret manager.
5. **Deploy Button:** Click Deploy and watch the live build log.

### Slide 9: Preview Deployments & Collaboration
- **Talking Points:**
  - Demonstrate creating a feature branch `git checkout -b feature/cool-ui`.
  - Make a minor UI change and open a Pull Request.
  - Show the Vercel GitHub bot automatically commenting with a unique preview URL.
  - Explain how team members can test features without breaking the main presentation link.

### Slide 10: Backend & Database Connections
- **Talking Points:**
  - Setting `VITE_API_URL` or `NEXT_PUBLIC_API_URL` to point to the live backend.
  - Handling CORS headers on the backend to allow requests from the Vercel domain.

---

## 4. Shared Section: Troubleshooting & Submission Checklist

### Slide 11: Top 5 Hackathon Pitfalls
1. **The SPA 404 on Refresh:**
   - Problem: Clicking links works, but refreshing `/dashboard` returns 404.
   - Fix: Add `vercel.json` rewrites (`"source": "/(.*)", "destination": "/index.html"`).
2. **Missing Environment Variables:**
   - Problem: White screen or `undefined` API errors.
   - Fix: Double check names match exact case in dashboard and redeploy.
3. **Mixed Content Errors:**
   - Problem: Calling `http://api.myserver.com` from an `https://` Vercel frontend.
   - Fix: Always serve backend over HTTPS.
4. **Hardcoded Localhost:**
   - Problem: `fetch("http://localhost:8080/api")` left in frontend code.
   - Fix: Centralize API base URLs into environment variables.
5. **Node.js Version Mismatch:**
   - Fix: Specify Node version in `package.json` engines or Vercel project settings.

### Slide 12: Final Hackathon Submission Checklist
- [ ] Production URL tested in Incognito / Private window.
- [ ] Tested on mobile phone viewport.
- [ ] Database credentials not leaking in client bundle.
- [ ] Backup recording of demo ready just in case.

---

## 5. Slide Controls & Hotkeys

- `Right Arrow` / `Space` / `Page Down`: Next Slide
- `Left Arrow` / `Page Up`: Previous Slide
- `F`: Toggle Fullscreen Presentation Mode
- `N`: Toggle Speaker Notes Drawer
- `Home` / `End`: Jump to First / Last Slide
