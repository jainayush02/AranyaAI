# 🐄 AranyaAI — Precision Livestock Intelligence Platform

AranyaAI is a full-stack AI-powered livestock health monitoring platform that helps farmers and veterinarians detect critical animal health issues before they become visible. Powered by an LSTM Autoencoder anomaly detection model and integrated with the Gemini AI chatbot, AranyaAI delivers real-time diagnostics, predictive alerts, and smart farm management tools.

> **Live Demo:** [aranya-ai-five.vercel.app](https://aranya-ai-five.vercel.app)

---

## ✨ Key Features

- **AI Health Diagnostics** — LSTM-based anomaly detection on animal vitals (temperature, heart rate, respiration, activity)
- **Real-time Dashboard** — Live farm statistics, animal health overview, and revenue tracking
- **AI Chatbot** — Gemini-powered conversational assistant for livestock queries
- **Admin Portal** — Full CRM with user management, system settings, pricing controls, and audit logs
- **OTP Authentication** — Twilio-powered SMS verification + email/password login
- **Profile Management** — User profiles with photo upload
- **Responsive UI** — Modern glassmorphism design with dark mode, animations, and mobile support

---

## 🏗️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, Vite, Framer Motion, Recharts, CSS Modules |
| **Backend** | Node.js, Express 5, Mongoose, JWT, Multer, Twilio |
| **AI Engine** | Python, Flask, TensorFlow/Keras, scikit-learn |
| **Database** | MongoDB Atlas |
| **AI Chatbot** | Google Gemini API |
| **Deployment** | Vercel (frontend + backend) · Render (AI microservice) |

---

## 📁 Project Structure

```
new_aranya/
├── src/
│   ├── client/                 # React Frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── pages/          # Route pages (Dashboard, Login, Profile, etc.)
│   │   │   └── App.jsx         # Root app with routing
│   │   ├── vite.config.js      # Vite config with API proxy
│   │   └── package.json
│   │
│   └── server/                 # Node.js Backend
│       ├── routes/             # Express API routes (auth, animals, chat, admin)
│       ├── models/             # Mongoose schemas (User, Animal, Settings)
│       ├── controllers/        # Business logic controllers
│       ├── ai_model/           # Python AI Microservice
│       │   ├── ai_server.py    # Flask server with LSTM model
│       │   ├── model_converted.keras
│       │   ├── requirements.txt
│       │   └── venv/
│       ├── server.js           # Express app entry point
│       ├── .env                # Environment variables (not in Git)
│       └── package.json
│
├── start_all.py                # One-click launcher for all 3 services
├── vercel.json                 # Vercel deployment configuration
└── .gitignore
```

---

## 📋 Prerequisites

- **Node.js** v18+ → [Download](https://nodejs.org/)
- **Python** 3.10+ → [Download](https://www.python.org/)
- **MongoDB Atlas** account → [Free Cluster](https://cloud.mongodb.com/)
- **Twilio** account (optional, for SMS OTP) → [Sign Up](https://www.twilio.com/)
- **Google Gemini API Key** (for AI chatbot) → [Get Key](https://aistudio.google.com/)

---

## 🚀 Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/jainayush02/AranyaAI.git
cd AranyaAI
```

### 2. Install Dependencies

**Frontend:**
```bash
cd src/client
npm install
```

**Backend:**
```bash
cd src/server
npm install
```

**AI Microservice:**
```bash
cd src/server/ai_model
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create `src/server/.env`:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>
JWT_SECRET=your_jwt_secret

# Twilio (Optional — for SMS OTP)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Gemini AI Chatbot
GEMINI_API_KEY=your_gemini_api_key

# Google OAuth (for Google Login)
GOOGLE_CLIENT_ID=your_google_client_id

# Google Mail OTP (for sending codes via Gmail)
GOOGLE_EMAIL_USER=your-email@gmail.com
GOOGLE_EMAIL_PASS=your-google-app-password
```

Create `src/client/.env`:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 4. Start All Services (One Command)

From the project root:

```bash
python start_all.py
```

This launches all three services simultaneously:
| Service | URL |
| :--- | :--- |
| React Frontend | `http://localhost:5173` |
| Node.js Backend | `http://localhost:5000` |
| AI Microservice | `http://localhost:8000` |

---

## ☁️ Deployment

### AI Engine → Render

1. Go to [render.com](https://render.com/) → **New Web Service**
2. Connect your GitHub repo
3. **Root Directory:** `src/server/ai_model`
4. **Build Command:** `pip install -r requirements.txt`
5. **Start Command:** `gunicorn ai_server:app`
6. Add env variable: `PYTHON_VERSION` = `3.11.0`

### Full App → Vercel

1. Go to [vercel.com](https://vercel.com/) → **Add New Project**
2. Import the `AranyaAI` repo — Vercel auto-detects `vercel.json`
3. Add these **Environment Variables**:
   - `MONGO_URI` — your MongoDB connection string
   - `JWT_SECRET` — your JWT signing secret
   - `AI_SERVICE_URL` — your Render deployment URL
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - `GEMINI_API_KEY`
4. **Important:** In MongoDB Atlas → Network Access → Add `0.0.0.0/0`

---

## 🔐 Setting Up Admin Access

AranyaAI ships with a built-in script to promote any registered user to **Admin** role. Follow these steps:

### Step 1: Register a Normal Account

Go to the app's **Sign Up** page and create an account with your email and password (e.g. `your-email@example.com`).

### Step 2: Run the Admin Promotion Script

Open a terminal in the `src/server` directory and run:

```bash
cd src/server
node scripts/promote_admin.js your-email@example.com
```

**Example:**
```bash
node scripts/promote_admin.js your-email@example.com
```

If successful, you'll see:
```
✨ Platform Ownership Verified!
User: your-email@example.com
Status: ADMIN
You can now log in via the Admin Portal.
```

### Step 3: Log In via Admin Portal

1. Go to the Login page
2. Click **"Admin Portal →"** at the bottom
3. Enter your email and password
4. Click **"Authorize Access"**

> **Note:** The script requires `MONGO_URI` to be set in your `src/server/.env` file. The user must already exist in the database (registered via Sign Up) before they can be promoted.

---

## 👤 Default Accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| Admin | `your-email@example.com` | *(set during registration)* |
| User | Sign up via the registration page | — |

---

## 📄 License

This project is for educational and portfolio purposes.

---

<p align="center">Built with ❤️ by <strong>Ayush Jain</strong></p>
