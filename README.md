# FPL Optimizer

An intelligent Fantasy Premier League (FPL) team optimization tool that analyzes player performance and suggests optimal team compositions.

---

## 🚀 Features

- **Team Generation** – Generate optimized squads using different strategies (Premium, Balanced, Value, etc.)
- **Squad Analysis** – Analyze your current team with configurable scoring weights
- **Player Suggestions** – Get replacement recommendations based on performance metrics
- **Real-time Data** – Uses the official FPL API for up-to-date player and fixture information

---

## ⚙️ Quick Start (for Developers)

```bash
# Install dependencies
pnpm install

# Setup ML service (optional, for AI Strategy)
./setup_ml.sh

# Start development servers
pnpm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧠 AI Strategy Setup

The **AI Strategy** uses machine learning to optimize team selection. To use it:

1. **Setup ML service**
   ```bash
   ./setup_ml.sh
   ```
2. **Train the model**
   ```bash
   pnpm run train:ml
   ```
3. **Start all services**
   ```bash
   pnpm run dev
   ```
4. **Use AI Strategy**
   In the web app, select **“AI Strategy”** under the team generation page.

The AI Strategy predicts optimal player selections for the next 3 gameweeks using historical data and advanced algorithms.

---

## 📊 How It Works

The optimizer scores and ranks players based on advanced performance metrics:

- **Form** – Recent consistency and performance
- **Expected Goals/Assists (xG/xA)** – Statistical indicators
- **Expected Minutes** – Predicted playing time
- **Fixture Difficulty** – Rating of upcoming matches
- **Average Points** – Historical FPL performance trends

---

## 🗂 Project Structure

```
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # React frontend
└── README.md
```

---

## 🧭 Setup Guide for Non-Developers (Windows)

This guide walks you through installing and running the app step-by-step — no developer experience required.

### Step 1: Install PNPM

Open **Windows PowerShell** and run the following command:

```powershell
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

This installs **pnpm**, a package manager used to run the app.

---

### Step 2: Create a Folder and Download the App

1. Choose a location on your computer where you want to install the app.
2. Open **PowerShell** and type:

   ```powershell
   mkdir FPL-Optimizer
   cd FPL-Optimizer
   ```

   You can replace `FPL-Optimizer` with any name you prefer for your folder.

3. Now, download the app from GitHub by running:

   ```powershell
   git clone https://github.com/Zepronex/FPL-Optimizer.git
   ```

---

### Step 3: Set Up and Start the App

Once the repository is downloaded, make sure you’re inside the folder in PowerShell, then run these commands one by one:

```powershell
pnpm install
./setup_ml.sh
pnpm run dev
```

This will install all required files, set up the machine learning service, and start the application.

---

### Step 4: Open the App

When setup is complete, open your web browser and go to:

👉 [http://localhost:3000](http://localhost:3000)

You’ll now see the **FPL Optimizer** web app running locally on your computer.

---

## 🪪 License

MIT License — see [LICENSE](LICENSE) for details.
