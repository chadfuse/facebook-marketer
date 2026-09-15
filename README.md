# ⚡ Facebook Group Marketer & AI Auto-Poster

An automated client acquisition platform built for web developers and agencies to discover niche Facebook groups, manage memberships, generate high-converting niche-tailored offers with Google Gemini AI, and schedule automated posts safely with human-like typing delays.

---

## 🚀 Key Features

- **🎯 Target Niche Management**: Add, edit, and delete target niches with specific local pain points (e.g., *HVAC Company in New York*, *Dental Clinic in Florida*, *Roofing in Texas*).
- **👥 Facebook Group Discovery & Joiner**: Search Facebook for active groups matching your keywords, inspect member counts, and trigger auto-join requests.
- **✨ Gemini AI Outreach Studio**: Generates 4 proven high-converting marketing framework posts (Free Website Audits, Conversion Case Studies, Local SEO/Speed Tips, and Portfolio Launches).
- **🛡️ Anti-Ban Protections & Human Jitter**: Types keystroke-by-keystroke with natural randomized delays (50ms–180ms), smooth scrolling, and strict daily safety limits (e.g., max 5 posts/day).
- **🔐 Flexible Authentication**:
  - **Local Mode**: Interactive 1-click Chrome popup window for effortless login with 2FA.
  - **Cloud / Render Mode**: Direct Cookie JSON importer.
- **📊 Real-time Dashboard**: Modern, dark-themed responsive dashboard with glassmorphism, instant post copying, queue management, and live activity logs.

---

## 🛠️ Quick Start (Local Setup)

### 1. Install Dependencies
```bash
cd "/Users/chadsia/Documents/facebook marketer"
npm install
```

### 2. Start the Server
```bash
npm start
```

### 3. Open Dashboard
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🌐 Deploy to Render (100% Free)

You can host the dashboard 24/7 on **Render.com** using their Free Web Service tier:

1. Push this repository to **GitHub** (or GitLab).
2. Log into [Render.com](https://render.com) and click **New + > Web Service**.
3. Connect your GitHub repository.
4. Render will automatically detect the settings from `render.yaml` (or choose **Node** runtime):
   - **Build Command**: `npm install && npx playwright install --with-deps chromium`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google Gemini API Key from [AI Studio](https://aistudio.google.com/app/apikey).
   - `PORT`: `3000`
6. Click **Create Web Service**. Your app will be live at `https://your-service-name.onrender.com`!

---

## 🎯 The 4 High-Converting Post Frameworks

| Framework | Angle & Hook | Why it Converts |
| :--- | :--- | :--- |
| **1. Free Website Audit** *(Highest Reply Rate)* | "I audited 5 local [Niche] websites in [City] and found why 70% lose emergency calls..." | Delivers upfront value, invites low-friction DMs for a free 5-minute teardown. |
| **2. Case Study / ROI** | "How a simple 1-click 'Book Emergency Service' button increased inbound calls by 45%..." | Proves tangible ROI and leads instead of just talking about design. |
| **3. Mobile & Speed Tips** | "3 common mobile design mistakes killing your Google Maps ranking in 2026..." | Positions you as a trusted local consultant. |
| **4. Soft Portfolio Showcase** | "Built a modern, high-speed website template specifically for [Niche]..." | Direct showcase of your aesthetic and technical capabilities. |

---

## 🔒 Facebook Account Safety Best Practices

1. **Keep Daily Posts Conservative**: 3–5 posts per day maximum across different groups.
2. **Space Out Posts**: Use the built-in queue runner which spaces posts by 15–45 minutes.
3. **Always Use AI Variations**: Never post the exact same message to multiple groups. Gemini creates fresh phrasing for every single post.
4. **Interact Naturally**: Occasionally comment on other members' posts in the groups you join to maintain high account health.
