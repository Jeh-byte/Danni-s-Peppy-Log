# Peptide Log

Offline installable web app (PWA) for Android Chrome. Your data stays on your phone in IndexedDB. Nothing is uploaded.

Starts with four peptides: TB-500, BPC-157, GHK-Cu and KPV. Set each vial size, the bac water you add and your own doses under the Peptides tab, then add a schedule so doses show on the Today card.

Files: `index.html`, `styles.css`, `seed.js`, `info.js`, `library.js`, `db.js`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`.

## Hosting
Needs HTTPS to install. Put these files at the root of a GitHub repo, then Settings > Pages > Deploy from branch `main` / root. The app lives at `https://<user>.github.io/<repo>/`. Open that address in Chrome on the phone, then menu > Install app.

When changing any file, bump `VERSION` in `sw.js` so installed phones pick up the update.

## Back up
The app reminds you weekly. Settings > Save backup file, then send it to Drive or email. Settings > Choose file restores it.
