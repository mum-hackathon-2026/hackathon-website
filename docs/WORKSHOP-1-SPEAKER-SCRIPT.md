# Workshop 1: Cloud Hosting — Full Speaker Script
**Averis X Monash Hackathon 2026**  
**Lead Presenter:** Shariq Nauman  
**Live Demo Facilitator:** Darren Melvern  
**Total Target Time:** ~45 minutes presentation + 15 minutes live Q&A  

---

## 🎯 Presenter Tips:
- **Tone:** Friendly, conversational, and natural. Keep sentences simple and avoid complex buzzwords.
- **Stage Navigation:** Press `Right Arrow` or `Space` to advance slides. Press `N` to open/close your speaker notes on screen.
- **Chat Check-ins:** Feel free to ask participants questions in chat (e.g. *"Drop a thumbs up in the chat if you've already started coding your prototype!"*).

---

## 🎙️ Slide-by-Slide Complete Script

---

### 🔹 Slide 1: Hackathon Cover
*(Visual: Averis X Monash Hackathon 2026 Title Cover with MUMTEC, MD, and GDG logos)*

> **[Shariq Nauman]:**  
> *"Hey everyone! Welcome to the first workshop of the Averis X Monash Hackathon 2026. I hope you've all been building well for the past two days since our opening ceremony. There are only about 48 hours left until Tuesday's submission deadline, so let's jump right in!"*

---

### 🔹 Slide 2: Workshop 1 — Cloud Hosting
*(Visual: Title "Cloud Hosting", Architecture / Live Pipeline / Production cards)*

> **[Shariq Nauman]:**  
> *"So today's session is all about Cloud Hosting.*  
>  
> *We're going to keep things very simple and practical. We'll look at how hosting works, how to connect your frontend and backend without running into weird errors, and how to set up automatic deploys so every time you push code to GitHub, your live website updates automatically.*  
>  
> *By the end of this workshop, you'll see that getting your project deployed takes only a few minutes, so your team can focus on actually building your solution."*

---

### 🔹 Slide 3: Meet the Speakers!
*(Visual: Polaroid frames with portrait photos of Shariq Nauman and Darren Melvern)*

> **[Shariq Nauman]:**  
> *"Before we jump in, a quick intro.*  
>  
> *My name is Shariq Nauman. I'll walk you through the core concepts—like how to structure your app, how to keep your API keys safe, and what mistakes to avoid before submitting.*  
>  
> *And with me is my friend Darren Melvern! Darren is going to do a live demo where he shares his screen, takes a real repository, and deploys it live right in front of you so you can follow along step by step.*  
>  
> *Darren, do you want to say hi real quick?"*  
>  
> **[Darren Melvern]:**  
> *"Hey everyone! Really glad to be here today. I'm excited to show you guys how quick and easy this whole process is."*  
>  
> **[Shariq Nauman]:**  
> *"Awesome. Let's get straight into it."*

---

### 🔹 Slide 4: The "It Works on My Machine" Curse
*(Visual: The 2-Hour Trap, Judges Aren't on Localhost, The Winning Strategy)*

> **[Shariq Nauman]:**  
> *"We've all been there: you build an app on your laptop, everything looks great, but then it's Tuesday morning at 10:00 AM—just two hours before the 12:00 PM deadline—and someone asks, 'Wait, how do we actually put this online?'*  
>  
> *Then people start rushing. Build errors pop up, environment variables go missing, and suddenly panic sets in. Worst of all, someone accidentally submits a link that says `localhost:3000` or `192.168.1.5`.*  
>  
> *Remember: judges aren't on your home Wi-Fi or your laptop. They will open your link on their own phones or office laptops. If the link doesn't open right away with a secure HTTPS link, they won't be able to test your work.*  
>  
> *So our main advice today is simple: deploy early. Put up a basic working page today. That way, every time you push code to GitHub, your live site updates automatically."*

---

### 🔹 Slide 5: The Cloud Hosting Landscape
*(Visual: Traditional VPS vs. Modern PaaS vs. Containerized Serverless)*

> **[Shariq Nauman]:**  
> *"When it comes to hosting your project for a hackathon, you have a few options:*  
>  
> *First, you could rent a raw virtual server, like on AWS EC2 or DigitalOcean. But with that, you have to log into a Linux terminal, install software, set up NGINX, and mess with SSL certificates. With only two days left, spending half your day setting up a server is just not worth your time.*  
>  
> *Second, you have platforms like Vercel or Netlify. These are built specifically for frontend web apps like React, Angular, Vue, or Next.js. You just connect your GitHub repository, and it builds your site, gives you a free HTTPS link, and handles all the hosting for you.*  
>  
> *Third, if you have a backend API in Python, Java, or Node, you can use serverless container platforms like Google Cloud Run or Render. They run your backend code in a container, scale automatically, and cost nothing when idle.*  
>  
> *For this hackathon, the easiest and most reliable setup is: host your frontend on a platform like Vercel, and run your backend API on Cloud Run or Render."*

---

### 🔹 Slide 6: Recommended Hackathon Architecture
*(Visual: Frontend Edge ➔ Backend API ➔ Managed Database with Pro-Tip)*

> **[Shariq Nauman]:**  
> *"Here's a simple setup that works really well for hackathons.*  
>  
> *On the frontend side, you have your web app hosted on a platform like Vercel. Because it's served through global content delivery networks, pages load almost instantly when someone opens your link.*  
>  
> *In the middle, you have your backend API running on Cloud Run or Render, handling things like document processing, AI logic, and business rules.*  
>  
> *On the right, you have your database, like PostgreSQL or Supabase, holding your app data.*  
>  
> *One big advantage of keeping your frontend and backend separate like this is reliability. If your backend takes a few extra seconds to process an AI request, your website still loads cleanly and can show a nice loading spinner instead of giving the user a broken page."*

---

### 🔹 Slide 7: Secrets & Environment Variables
*(Visual: What NEVER to do vs The Right Way)*

> **[Shariq Nauman]:**  
> *"Next, let's talk about keeping your passwords and API keys safe.*  
>  
> *First, the most important rule: never push your `.env` file or secret keys to GitHub. There are bots that constantly scan public repos, and if an OpenAI key or database password gets posted, it will get stolen in seconds.*  
>  
> *Also, remember that anything you write directly into your frontend code—like inside your Angular or React files—can be seen by anyone who opens the browser's developer tools. So never hardcode secret keys in frontend code.*  
>  
> *The right way to do this is simple:*  
> 1. *Put `.env` in your `.gitignore` file so it stays on your computer.*  
> 2. *Create a `.env.example` file with fake placeholder values so your teammates know what variables to fill in.*  
> 3. *Add your real keys inside your cloud hosting dashboard under Environment Variables.*  
>  
> *That way, your secrets stay secure and nothing sensitive gets leaked."*

---

### 🔹 Slide 8: Custom Domains, SSL & Edge CDN
*(Visual: Free Instant HTTPS, Custom Domain Setup, Global Edge Network)*

> **[Shariq Nauman]:**  
> *"One great thing about modern hosting platforms is that you get HTTPS completely free out of the box. As soon as you deploy, you get a working URL with a green padlock, so browsers won't show any security warnings.*  
>  
> *If your team happens to have a custom domain name, you can easily plug it in through your dashboard by adding a DNS record, and the platform sets up the SSL certificate for you.*  
>  
> *Plus, because files are served from nearby servers in Singapore and Malaysia, your website will feel snappy and responsive for the judges.*  
>  
> *Now, instead of just talking through slides, let's watch how this actually works in practice. I'll pass it over to Darren for the live demo!"*

---

### 🔹 Slide 9: Hands-on Live Demo — Zero to Deployed in 7 Minutes
*(Visual: Live Demo Intro card, Step 1-4 roadmap)*

> **[Shariq Nauman]:**  
> *"Over to you, Darren!"*  
>  
> **[Darren Melvern — Live Screen Share Walkthrough]:**  
> *(Darren shares his browser screen)*  
>  
> *"Thanks Shariq! Hey everyone, let me share my screen and show you how easy this is.*  
>  
> *So here on my screen, I have a basic GitHub repository. It has our frontend code, our package.json file, and our build script.*  
>  
> *Let's walk through the steps together:*  
> 1. ***Step 1:*** *I go to Vercel and click **'Add New Project'**, then **'Import Git Repository'**.*  
> 2. ***Step 2:*** *I pick our hackathon repo. The platform automatically detects the framework—whether it's Next.js, Vite, or Angular—and sets up the build command for us.*  
> 3. ***Step 3:*** *Before clicking Deploy, I open the Environment Variables section and paste our backend API URL.*  
> 4. ***Step 4:*** *I hit Deploy.*  
>  
> *And right here in the build log, you can see it cloning the code, installing packages, and building the project. In about 20 to 30 seconds... there it is! We now have a live, working URL with HTTPS that anyone in the world can open.*  
>  
> *Another cool feature for teams: whenever someone creates a pull request on GitHub, the platform automatically creates a preview link just for that branch. That means your team can test changes on your phones before merging them into the main branch.*  
>  
> *That's literally all it takes to get your project online. Passing it back to Shariq to go over the final checklist!"*

---

### 🔹 Slide 10: Top 5 Hackathon Pitfalls & Instant Fixes
*(Visual: 5 colored cards covering SPA 404, Mixed Content, Missing Env Var, Hardcoded Host, Node Version)*

> **[Shariq Nauman]:**  
> *"Thanks Darren! That was super smooth.*  
>  
> *Now, before you go and set up your own deployment, here are the top 5 most common deployment issues students run into during hackathons, and how to solve them:*  
>  
> 1. ***The 404 error on page refresh:** If you click around your Single Page App and it works fine, but refreshing `/dashboard` shows a 404 error, that's because the server doesn't know about frontend routes. Fix this by adding a small `vercel.json` file that rewrites all requests back to `index.html`.*  
> 2. ***Mixed Content errors:** If your frontend is on HTTPS but your API call goes to `http://`, browsers will block it. Always make sure your backend uses HTTPS.*  
> 3. ***Missing environment variables:** If your app deploys but API calls fail with undefined, check your variable names in the hosting dashboard and redeploy.*  
> 4. ***Hardcoded localhost:** If you forgot an old `localhost:8080` URL inside your code, replace it with an environment variable.*  
> 5. ***Node version issues:** If your local machine uses Node 22 but the cloud server uses Node 18, make sure your Node version is set correctly in your settings or package.json.*  
>  
> *Keep these 5 tips in mind—they'll save you a ton of time if something goes wrong."*

---

### 🔹 Slide 11: Submission Day Readiness Checklist
*(Visual: 4 green/orange/blue cards with checkmarks)*

> **[Shariq Nauman]:**  
> *"When Tuesday comes around and you're getting ready to submit before the 12:00 PM cut-off, here is a quick 4-point checklist to run through:*  
>  
> 1. ***Test your live link in an incognito window and on your phone using mobile data.** This makes sure your site doesn't depend on local cookies or your home Wi-Fi.*  
> 2. ***Make login easy for judges.** If your app has a login screen, add a simple 'Demo Login' button or clearly put test username and password credentials in your GitHub README.*  
> 3. ***Record a short 3 to 5 minute backup video** of your working app using Loom, YouTube, or Google Drive. If an AI service or API is slow or down during judging, your video proves that your project works.*  
> 4. ***Make sure your GitHub repository is public** and has a clear README with your live project link right at the top."*

---

### 🔹 Slide 12: Questions? & Wrap Up
*(Visual: Questions? heading, Averis X Monash branding, bullet points for Q&A and Workshop 2)*

> **[Shariq Nauman]:**  
> *"And that wraps up our presentation for Workshop 1!*  
>  
> *Darren and I are here to answer any questions you have. If you're running into deployment issues, questions about backend setups, or CORS errors, go ahead and drop your questions in the chat right now.*  
>  
> *Also, don't forget that Workshop 2 is happening tomorrow, Monday 21st September at 7:00 PM.*  
>  
> *Thank you everyone for joining, keep up the great work on your projects, and let's check the chat for questions!"*

---
