# Workshop 1: Cloud Hosting — Full Speaker Script
**Averis X Monash Hackathon 2026**  
**Lead Presenter:** Shariq Nauman  
**Live Demo Facilitator:** Darren Melvern  
**Total Target Time:** ~45 minutes presentation + 15 minutes live Q&A  

---

## 🎯 Presenter Tips Before You Begin:
- **Pacing:** Speak with upbeat energy, clarity, and friendly authority. Hackathon participants are excited but often stressed about technical constraints.
- **Stage Cues:** Use the `Right Arrow` or `Space` key to advance slides. Press `N` if you need to reference quick talking points in the built-in speaker notes drawer.
- **Audience Check-ins:** Engage participants frequently ("Drop a 1 in the chat if you've ever had a project break on demo day!").

---

## 🎙️ Slide-by-Slide Complete Script

---

### 🔹 Slide 1: Hackathon Cover
*(Visual: Averis X Monash Hackathon 2026 Title Cover with MUMTEC, MD, and GDG logos)*

> **[Shariq Nauman]:**  
> *"Good afternoon everyone! A very warm welcome to all our participants, organizers, mentors, and fellow tech enthusiasts. Welcome to the **Averis X Monash Hackathon 2026**!*  
>  
> *Today marks the very first technical workshop of the hackathon series. Over the next four days, you are going to brainstorm, build, fine-tune models, and develop incredible solutions to real-world industry problems. But building brilliant code on your local machine is only half the battle. Today, we're here to talk about how you get your solution into the hands of the judges seamlessly."*

---

### 🔹 Slide 2: Workshop 1 — Cloud Hosting
*(Visual: Title "Cloud Hosting", Architecture / Live Pipeline / Production cards)*

> **[Shariq Nauman]:**  
> *"Our session today is **Workshop 1: Cloud Hosting**.*  
>  
> *The central theme of this workshop is taking your project from `localhost:3000` to a globally accessible, production-grade cloud deployment.  
>  
> Throughout this session, we are going to demystify cloud infrastructure: how modern hosting works, how to structure your frontend and backend architecture so they don't crash under pressure, and how to automate deployments directly from your GitHub repository. By the end of this hour, you will know exactly how to deploy your app in under seven minutes so you can focus 100% on innovating and solving the problem statement."*

---

### 🔹 Slide 3: Meet the Speakers!
*(Visual: Polaroid frames with portrait photos of Shariq Nauman and Darren Melvern)*

> **[Shariq Nauman]:**  
> *"Before we dive into the technical details, let us quickly introduce ourselves!*  
>  
> *My name is **Shariq Nauman**. I'll be guiding you through the first half of today’s session, breaking down cloud concepts, architectural best practices, secret management, and submission strategies.*  
>  
> *And joining me today as our co-speaker is my good friend **Darren Melvern**! Darren is our live demo specialist. In the second half of this workshop, he’s going to share his screen, take a real codebase, and deploy it live right before your eyes from scratch so you can see every single click and configuration in real time.*  
>  
> *Darren, say a quick hello to everyone!"*  
>  
> **[Darren Melvern]:**  
> *"Hey everyone! Excited to be here today. Looking forward to showing you how painless modern deployment can be."*  
>  
> **[Shariq Nauman]:**  
> *"Awesome! With that, let's jump straight into why we're here."*

---

### 🔹 Slide 4: The "It Works on My Machine" Curse
*(Visual: The 2-Hour Trap, Judges Aren't on Localhost, The Winning Strategy)*

> **[Shariq Nauman]:**  
> *"Let’s start with a situation that almost every developer in this room has experienced: **The 'It Works on My Machine' curse**.*  
>  
> *Here is the classic hackathon tragedy: A team works tirelessly building their project. The UI looks stunning on the developer's laptop. The AI model responds quickly. But it’s Tuesday morning at 10:00 AM—two hours before the strict 12:00 PM submission deadline—and someone says, 'Okay, how do we deploy this?'*  
>  
> *Suddenly, build scripts fail. Environment variables are missing. Port 8080 is blocked. Panic sets in. And worst of all, when the submission link is sent, it's `http://192.168.1.5` or `http://localhost:3000`.*  
>  
> *Remember this fundamental truth: **Judges are not on your local network.** They will be opening your submission from their corporate laptops, iPads, or phones on restricted enterprise Wi-Fi. If your link doesn't open immediately with a secure HTTPS connection, your project cannot be evaluated.*  
>  
> *Our golden rule for this hackathon is: **Deploy Early**. Set up your deployment pipeline early, even if it's just a blank 'Hello World' page. That way, every single `git push` you make throughout the hackathon automatically updates your live prototype."*

---

### 🔹 Slide 5: The Cloud Hosting Landscape
*(Visual: Traditional VPS vs. Modern PaaS vs. Containerized Serverless)*

> **[Shariq Nauman]:**  
> *"So how do we choose the right cloud hosting strategy for a fast-paced 48-hour sprint? Let’s look at the three main tiers:*  
>  
> *First, we have **Traditional VPS or Virtual Machines** like AWS EC2 or DigitalOcean Droplets. While they give you total root control, you have to manually SSH into the server, install Node/Python/Java, configure NGINX reverse proxies, set up firewall rules, and renew SSL certificates. During a 48-hour hackathon, spending 4 hours configuring Linux servers is simply not a good use of your precious time.*  
>  
> *Second, we have **Modern PaaS (Platform as a Service)** like Vercel and Netlify. These are purpose-built for frontend web applications (React, Angular, Next.js, Vite, Vue). There is zero server management. You connect your GitHub repo, and in seconds it provisions global CDN caching, automatic SSL certificates, and generates preview URLs for every pull request.*  
>  
> *Third, for your backend APIs and AI services, we have **Serverless Containers** like Google Cloud Run or Render. You write your FastAPI, Spring Boot, or Express code, containerize it with Docker, and it scales automatically—and scales down to zero when idle so it costs virtually nothing.*  
>  
> *For this hackathon, our strongest recommendation is a decoupled modern approach: host your frontend on modern edge PaaS, and run your backend API on containerized serverless infrastructure."*

---

### 🔹 Slide 6: Recommended Hackathon Architecture
*(Visual: Frontend Edge ➔ Backend API ➔ Managed Database with Pro-Tip)*

> **[Shariq Nauman]:**  
> *"Let’s take a look at the architecture blueprint on this slide.*  
>  
> *Notice how cleanly decoupled this system is:*  
> 1. *On the left, your **Frontend Client** is hosted on edge nodes. Whether you are using Angular, React, Vue, or Next.js, your HTML, JavaScript, and styling assets are distributed worldwide. When a judge clicks your link, the website loads in under 100 milliseconds.*  
> 2. *In the middle, your **Backend API** runs independently on Cloud Run or Render. It handles the problem statement logic—document extraction, OCR parsing, business rules, and LLM orchestration.*  
> 3. *On the right, your **Database** (such as managed PostgreSQL or Supabase) stores persistent records via connection pooling.*  
>  
> *Why is decoupling so critical? Because if your backend server temporarily restarts or encounters a heavy OCR processing delay, your frontend website will **still stay up**! Instead of showing a dead browser 502 error, your UI can display a smooth loading animation or friendly status message. That resilience makes a huge difference in the eyes of judges."*

---

### 🔹 Slide 7: Secrets & Environment Variables
*(Visual: What NEVER to do vs The Right Way)*

> **[Shariq Nauman]:**  
> *"Now, let's talk about something that can make or break your project: **Security and Environment Variables**.*  
>  
> *First, what **NEVER** to do:  
> Never, ever commit `.env` or credential files into public GitHub repositories. Automated bots scan GitHub constantly looking for leaked OpenAI tokens, database connection strings, and cloud credentials. If a key leaks, it can be drained or compromised within minutes.*  
>  
> *Also, remember the golden rule of frontend security: **Never put secret API keys in client-side code.** In frameworks like Angular or React, anything bundled into JavaScript is completely visible to anyone who opens Developer Tools.*  
>  
> *So what is the right way?*  
> 1. *Keep your `.env` file listed inside `.gitignore`.*  
> 2. *Commit a clean `.env.example` file with placeholder dummy values so your teammates know which variables are needed.*  
> 3. *Inject your real production keys directly into your cloud hosting dashboard under **Project Settings ➔ Environment Variables**.*  
>  
> *This keeps your credentials completely private, secure, and separated between production and local development."*

---

### 🔹 Slide 8: Custom Domains, SSL & Edge CDN
*(Visual: Free Instant HTTPS, Custom Domain Setup, Global Edge Network)*

> **[Shariq Nauman]:**  
> *"The final theory piece before our demo is **Networking, SSL, and Domains**.*  
>  
> *One of the greatest advantages of modern cloud platforms is that you get **free, automated HTTPS out of the box**. The moment you deploy, you receive a valid SSL certificate and a clean public URL (like `yourproject.vercel.app`).*  
>  
> *If your team owns a custom domain name (like `teamawesome.tech`), adding it is as simple as adding a CNAME or A record pointing to the DNS provider. The platform validates DNS records and provisions the SSL certificate automatically in under 60 seconds.*  
>  
> *Furthermore, because the assets are cached across regional edge nodes in Singapore and Kuala Lumpur, latency is near zero for anyone evaluating your project here in Malaysia.*  
>  
> *Now, theory is great—but seeing it live in action is even better. I’m going to hand over the microphone and screen to Darren, who will take us through a live deployment demo!"*

---

### 🔹 Slide 9: Hands-on Live Demo — Zero to Deployed in 7 Minutes
*(Visual: Live Demo Intro card, Step 1-4 roadmap)*

> **[Shariq Nauman]:**  
> *"Over to you, Darren!"*  
>  
> **[Darren Melvern — Live Screen Share Walkthrough]:**  
> *(Darren shares his browser screen)*  
>  
> *"Thank you Shariq! Hey everyone, let’s get our hands dirty and deploy a live project in real time.*  
>  
> *As you can see on my screen, I have a clean GitHub repository here. It has our project source code, our `package.json`, and our build scripts.*  
>  
> *Watch how simple this workflow is:*  
> 1. ***Step 1: Logging into the Cloud Dashboard:** I head over to Vercel (or your chosen platform) and click **'Add New Project' ➔ 'Import Git Repository'**.*  
> 2. ***Step 2: Selecting the Repo:** I select our hackathon repository. Notice how the platform instantly auto-detects our framework preset—it knows whether it's Vite, Next.js, or Angular, and configures the build command automatically.*  
> 3. ***Step 3: Adding Secrets:** Before hitting Deploy, I open the **Environment Variables** accordion and paste in our backend API endpoint (`VITE_API_URL` or `NEXT_PUBLIC_API_URL`).*  
> 4. ***Step 4: Deploy:** Now I click the big blue **'Deploy'** button.*  
>  
> *Look at the live build terminal right here on screen. It clones the repo, installs dependencies, builds production assets, and provisions the edge routes... and in just about 25 seconds—Boom! We have a live production URL with full HTTPS.*  
>  
> *Now let me show you the real superpower for team hackathons: **Branch Previews**.*  
> *If my teammate Shariq creates a new branch called `feat/new-ui` and opens a Pull Request on GitHub, the bot automatically deploys a staging preview URL specifically for that PR. The rest of the team can test the new feature on their phones without risking our main demo link!*  
>  
> *That’s how easy it is to go from zero to deployed in under 7 minutes. Shariq, taking it back to you for our submission checklist!"*

---

### 🔹 Slide 10: Top 5 Hackathon Pitfalls & Instant Fixes
*(Visual: 5 colored cards covering SPA 404, Mixed Content, Missing Env Var, Hardcoded Host, Node Version)*

> **[Shariq Nauman]:**  
> *"Awesome demo, Darren! Thank you!*  
>  
> *Now, before you go off to deploy your own applications, take a mental screenshot or photo of this slide. These are the **Top 5 most common deployment bugs** that hackathon participants run into, and how you can fix them instantly:*  
>  
> 1. ***Pitfall #1: The Single Page App 404 on Refresh.** You click around your app and it works great, but the moment a judge refreshes `/dashboard` or `/results`, they see a 404 error.  
>    **The Fix:** Add a simple `vercel.json` file in your root folder with a rewrite rule that redirects all routes to `index.html`.*  
> 2. ***Pitfall #2: Mixed Content Errors.** Your frontend is secure HTTPS, but your API fetch calls `http://my-backend`. Modern browsers will block the request immediately.  
>    **The Fix:** Always ensure your backend server is deployed with HTTPS.*  
> 3. ***Pitfall #3: Missing Environment Variables.** The app deploys, but API calls fail with `undefined`.  
>    **The Fix:** Always double-check your variable spelling in the cloud dashboard, and trigger a redeployment after saving.*  
> 4. ***Pitfall #4: Hardcoded `localhost:8080`.** You forgot to update an internal fetch URL in a service file.  
>    **The Fix:** Centralize all API base URLs into environment variables.*  
> 5. ***Pitfall #5: Node Version Mismatch.** The local machine has Node 22 but the cloud builder runs Node 18.  
>    **The Fix:** Specify your Node version in `package.json` engines or in project settings.*  
>  
> *Keep these five solutions handy—they will save you hours of debugging this weekend!"*

---

### 🔹 Slide 11: Submission Day Readiness Checklist
*(Visual: 4 green/orange/blue cards with checkmarks)*

> **[Shariq Nauman]:**  
> *"When submission day arrives on Tuesday at 12:00 PM and you are preparing to submit your project on the hackathon portal, run through this 4-point readiness checklist:*  
>  
> 1. ***Test on Incognito and Mobile Phone:** Open your live URL on a private browser window and on your smartphone over 4G/5G data. This confirms that your app does not rely on local cookies, localhost ports, or local caching.*  
> 2. ***Demo Credentials Pre-filled:** If your application requires user sign-in, add a 1-click 'Guest Demo Login' button on your landing page, or clearly state the test credentials in your GitHub README. Never make a judge guess how to log in.*  
> 3. ***Screen Recording Backup:** Always record a 3 to 5-minute video walkthrough (via Loom, YouTube, or Google Drive) demonstrating your live app working. If an upstream third-party AI model rate-limits on judging day, your video walkthrough protects your technical score.*  
> 4. ***GitHub Repository Public & Documented:** Verify that your repository is set to Public, that your `README.md` includes clean architecture diagrams and setup instructions, and that your live deployment URL is prominently displayed at the top of the README.*"

---

### 🔹 Slide 12: Questions? & Office Hours
*(Visual: Questions? heading, Averis X Monash branding, bullet points for Q&A and Workshop 2)*

> **[Shariq Nauman]:**  
> *"And that brings us to the end of the presentation portion of Workshop 1!*  
>  
> *Both Darren and I are now opening the floor for live Q&A. If you have any questions about deployment, backend configuration, CORS errors, or setting up your repositories, feel free to drop your questions into the chat right now.*  
>  
> *Also, as a reminder:*  
> - *Full slide deck and presenter guides are available inside the repository under `docs/`.*  
> - *Don't miss **Workshop 2** tomorrow, 21st September at 7:00 PM!*  
>  
> *Thank you all for listening, and best of luck building this weekend! Let's take the first question!"*

---
