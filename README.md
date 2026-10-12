# Mehta Sales — stock & catalogue — deploy on Vercel

Files: `index.html` (the site), `api/index.js` (server: logins, permissions, database), `package.json`.

## Deploy (about 5 minutes)
1. Put this folder on GitHub (new repo, upload all files), or use the Vercel CLI (`npx vercel` inside this folder).
2. On vercel.com: **Add New → Project →** pick the repo → **Deploy** (leave all settings as they are).
3. Open the project → **Storage** tab → **Create Database / Marketplace → Upstash Redis** (free plan is fine) → connect it to this project. This adds the database keys automatically.
4. Project → **Settings → Environment Variables**, add:
   - `AUTH_SECRET` = a long random text (e.g. 40+ random letters/numbers). **Required.**
   - `OWNER_USER` = `parth` (optional, this is the default)
   - `OWNER_PASS` = your owner password (**strongly recommended** — if you skip it the default `apple8901` is used, and that default is visible in the code on GitHub)
5. **Deployments → ⋯ → Redeploy** so the variables take effect.
6. Open your site, sign in as the owner, and add your products. On a phone, use "Add to Home Screen" to install it like an app.

## How it's secured
- Passwords are checked on the server. Team passwords are stored hashed (scrypt), never in plain text.
- Dealer prices are only ever sent to the owner's login. Other logins never receive them.
- Brands blocked for a person are removed on the server, so they never reach that person's device.
- Permissions (add / edit / delete) are checked on the server on every request, and changes apply immediately.
- Keep the GitHub repo **private** if you leave the default owner password.

## Notes
- Changes appear on everyone's screen within about 4 seconds while people are using the app (15 seconds when idle), with a small "Live update" message. Each check is one tiny request, so many devices left open all day can approach the free Vercel/Upstash limits; upgrade the plan if that happens.
- To change the owner password later, edit `OWNER_PASS` in Vercel and redeploy.

## Outlets
- Owner: sidebar → **Outlets** to add/rename outlets (a default "Main Shop" is created automatically; existing stock goes into it).
- Add/Edit product has one quantity box per outlet. The top bar has an outlet picker (All outlets or one outlet).
- Team → each person can be limited to certain outlets; they only see and change stock for those.

## Roles
Team → Add member → pick a role: **Sales Officer** (browse + reduce stock to record sales), **Store Keeper** (add products & change stock), **Manager** (add/edit/delete), **Owner** (full access incl. dealer prices — only the main owner can create/remove Owners), or **Custom** (tick exactly what they can do). Roles are enforced on the server.
