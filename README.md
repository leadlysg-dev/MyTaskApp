# 🔑 My Keys & Env Vars Cheat-Sheet

A reusable guide for **getting API keys and putting them into environment variables**.
Not tied to any one project — open this any time you start something new.

---

## The 3 rules (read once, never forget)

1. **A key is a password.** Anyone who has it can spend your money or read your data.
2. **Never put a key in your code or commit it to GitHub.** Keys live in *env vars* only.
   Always add a `.gitignore` that contains `.env` and `node_modules/`.
3. **Two places keys go:**
   - A local file called `.env` → for testing on your own computer.
   - Your host's dashboard (Netlify → Environment variables) → for the live site.

In code you read them with `process.env.NAME` — the value is never written in the file.

---

## Quick reference — where each value comes from

| Env var | Where to get it | Looks like |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | `sk-ant-...` |
| `OPENAI_API_KEY` | platform.openai.com → API keys | `sk-...` |
| `GOOGLE_SHEET_ID` | the long bit in a Sheet's URL | `1AbC...xyz` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud → Service Accounts | `name@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | the JSON key file you download | `-----BEGIN PRIVATE KEY-----\n...` |

The pattern is always the same: **get the key from the provider's dashboard → paste it
into env vars → read it with `process.env`.** Everything below is just the detail per provider.

---

## 1 · Anthropic (Claude) API key

1. Go to **https://console.anthropic.com** and log in.
2. Left menu → **API Keys** → **Create Key** → name it → **Copy**.
3. You only see it once. Paste it straight into your env vars as `ANTHROPIC_API_KEY`.
4. Make sure billing is set up (Settings → Billing) or calls will fail.

Using it in code (Node):
```js
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,   // <- from env var
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }] })
});
```

---

## 2 · Google Sheet ID

Open any Google Sheet. The URL looks like:

```
https://docs.google.com/spreadsheets/d/  1AbC...long...xyz  /edit
                                        └──── this is the ID ────┘
```

Copy the part between `/d/` and `/edit`. That's `GOOGLE_SHEET_ID`. Done.

---

## 3 · Google Service Account (to read/write Sheets, Drive, etc.)

A service account is a **robot Google login** your app uses. This gives you two env vars:
the **email** and the **private key**.

1. Go to **https://console.cloud.google.com**.
2. Top bar → project dropdown → **New Project** → name it → **Create**. Select it.
3. Search bar → type the API you need (e.g. **Google Sheets API**) → **Enable**.
   *(Repeat for Drive API, Calendar API, etc. if the project needs them.)*
4. Search bar → **Service Accounts** → **+ Create Service Account** → name it →
   **Create and Continue** → **Continue** → **Done**.
5. Click the new service account → **copy its email** → that's
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
6. Same screen → **Keys** tab → **Add Key** → **Create new key** → **JSON** → **Create**.
   A `.json` file downloads. Open it in a text editor.
7. Find `"private_key": "-----BEGIN PRIVATE KEY-----\n......\n-----END PRIVATE KEY-----\n"`.
   Copy the **whole value inside the quotes** (keep the `\n` bits) → that's
   `GOOGLE_PRIVATE_KEY`.

### ⚠️ The #1 thing people forget
If the robot needs to touch **your** file (a Sheet, a Drive folder), you must **share that
file with the service account email** (give it **Editor**). Until you do, you'll get a
*"permission denied"* error no matter what.

### ⚠️ The private-key `\n` gotcha
Env vars store the key as one line with literal `\n` characters. In code, convert them
back to real line breaks before use:
```js
const key = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
```
If you ever see *"error:0909006C"* or *"DECODER routines"*, this replace is missing or the
key got mangled — re-paste it whole.

---

## 4 · Putting env vars on Netlify (the live site)

1. **https://app.netlify.com** → your site → **Site configuration** → **Environment variables**.
2. **Add a variable** → enter the **Key** (e.g. `ANTHROPIC_API_KEY`) and the **Value** → save.
3. Repeat for each one.
4. **Re-deploy after adding them:** **Deploys** → **Trigger deploy** → **Deploy site**.
   Env vars only take effect on a *fresh* deploy — this is the step everyone skips.

*(Other hosts are the same idea: Vercel → Settings → Environment Variables; Cloudflare →
Settings → Variables; Render → Environment. Same pattern everywhere.)*

---

## 5 · Testing on your own computer (`.env`)

1. In your project folder make a file named exactly `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_SHEET_ID=1AbC...xyz
   GOOGLE_SERVICE_ACCOUNT_EMAIL=name@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
2. Confirm `.env` is listed in `.gitignore` so it never gets uploaded.
3. Run locally:
   ```
   npm install -g netlify-cli
   netlify dev
   ```
   Netlify Dev auto-loads `.env` and serves the site at http://localhost:8888.

*(Plain Node without Netlify? `npm i dotenv` then `require('dotenv').config()` at the top.)*

---

## 6 · When something breaks

| Symptom | Almost always means |
|---|---|
| `permission denied` on a Google file | You didn't **share the file** with the service account email |
| `error:0909006C` / `DECODER routines` | `GOOGLE_PRIVATE_KEY` mangled — re-paste whole, add `.replace(/\\n/g,'\n')` |
| API key works locally, fails when deployed | You forgot to **re-deploy** after adding env vars |
| `401 / invalid x-api-key` | Wrong key name, extra spaces, or billing not enabled |
| `undefined` when reading `process.env.X` | Typo in the var name, or `.env` not loaded |
| Key accidentally pushed to GitHub | **Rotate it immediately** (delete + make a new one). Treat the old one as burned. |

---

### TL;DR
Get key from dashboard → paste into `.env` (local) **and** host env vars (live) →
read with `process.env.NAME` → for Google, share the file with the robot email and
fix the `\n` → re-deploy. That's every project.
