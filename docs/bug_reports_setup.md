# Bug Reports Setup Guide

This guide explains how to set up the bug reporting repository and configure Railway so player bug reports are automatically committed directly to GitHub.

---

## 1. Create the Private GitHub Reports Repository

1. Open [GitHub](https://github.com) and log in.
2. In the top-right corner, click **+** and select **New repository**.
3. Choose a repository name (e.g., `true-grind-bug-reports`).
4. Set the visibility to **Private** (critical: player reports contain save snapshots and game state).
5. Check **Add a README file** so the default branch is initialized with a commit.
6. Click **Create repository**.

---

## 2. Create a Fine-Grained Personal Access Token (PAT)

1. In GitHub, click your profile icon (top-right) → **Settings**.
2. In the left sidebar, scroll down to the bottom and click **Developer settings**.
3. Under **Personal access tokens**, click **Fine-grained tokens** → **Generate new token**.
4. Configure the token fields:
   - **Token name:** `rpg-true-grind-reports-bot`
   - **Expiration:** Select an expiration period (e.g. 90 days or 1 year). Set a calendar reminder 1 week before expiry to renew it.
   - **Repository access:** Choose **Only select repositories**, then pick `true-grind-bug-reports`.
   - **Permissions:** Under **Repository permissions**, find **Contents** and select **Access: Read and write**.
5. Click **Generate token** at the bottom.
6. **Copy the token immediately** (it starts with `github_pat_`). You will not be able to see it again once you leave this page.

---

## 3. Configure Railway Environment Variables

1. Log in to your [Railway dashboard](https://railway.app).
2. Select your `RPG True Grind` service.
3. Click the **Variables** tab.
4. Add the following two environment variables:
   - `GITHUB_REPORTS_TOKEN`: Paste your fine-grained token (`github_pat_...`).
   - `GITHUB_REPORTS_REPO`: Enter your repository in `Owner/Repo` format (e.g., `InsaneReaper7/true-grind-bug-reports`).
5. Click **Save / Redeploy**.

---

## 4. Verify Railway Start Command

1. In your Railway service dashboard, click the **Settings** tab.
2. Scroll to the **Deploy** section.
3. Check the **Start Command** setting:
   - Ensure it is empty (defaulting to `npm start`), or explicitly set to `npm start`.
   - **Important:** If it was previously set to `vite preview` or `npm run preview`, clear it or change it to `npm start`. The production Node server must run `server/index.js` to serve `/api/bug-report` and `/api/health`.

---

## 5. Test with `/api/health`

1. Open your game's live URL in your browser with `/api/health` appended:
   `https://<your-railway-domain>.up.railway.app/api/health`
2. You should see a JSON response confirming the server is healthy:
   ```json
   {
     "ok": true,
     "version": "<commit-hash-or-version>"
   }
   ```
   If this returns 200 OK, the Node backend is actively routing API traffic.

---

## 6. Send a Test Bug Report

1. Open the game in your browser.
2. Press **F8** (or click the **🐛 Report a Bug [F8]** button on the Title screen or HUD panel).
3. In the dialog:
   - Select category: **Other**
   - Type in "What happened?": `Initial system verification test report`
4. Click **Send Report**.
5. Within 2–3 seconds, you should see:
   `✅ Report TG-XXXXXX sent. Thank you!`
6. Open your private `true-grind-bug-reports` GitHub repository. Under `reports/YYYY-MM-DD/`, you should see two new files:
   - `HHMMSS_TG-XXXXXX.json` (the raw report bundle with your live snapshot and event log)
   - `HHMMSS_TG-XXXXXX.log` (readable plain-text log with player notes at the top)

---

## 7. What to Do When the Token Expires

When a fine-grained GitHub token expires:
1. The game safely detects that reports cannot be uploaded and immediately displays a button:
   `📥 Download Report (TG-XXXXXX.json)`
   This guarantees that no player bug report is ever lost, even when GitHub credentials expire.
2. To restore automatic uploads:
   - Go to GitHub Developer settings → Personal access tokens → Fine-grained tokens.
   - Click the expired token and click **Regenerate token** (or create a new one with Contents: Read and write on the reports repo).
   - Update `GITHUB_REPORTS_TOKEN` in your Railway dashboard variables.
   - Railway will restart the container with the updated token automatically.
