const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");

const root = process.cwd();
const archive = path.join(root, "arc-secure.zip");
const output = path.join(root, "dist");

if (!fs.existsSync(archive)) throw new Error("arc-secure.zip is missing from the repository root.");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const zip = new AdmZip(archive);
for (const entry of zip.getEntries()) {
  const target = path.resolve(output, entry.entryName);
  if (target !== output && !target.startsWith(output + path.sep)) {
    throw new Error("Unsafe ZIP entry path: " + entry.entryName);
  }
  if (entry.isDirectory) {
    fs.mkdirSync(target, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
}

// Public browser configuration is injected at build time. Never place Groq,
// Supabase service-role, JWT, or other server secrets in these variables.
const projectId = process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID";
const config = {
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || "YOUR_FIREBASE_API_KEY",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || (projectId + ".firebaseapp.com"),
    projectId,
    appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID"
  },
  supabaseUrl: process.env.SUPABASE_URL || "https://YOUR_REF.supabase.co",
  supabaseAnon: process.env.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY"
};
fs.writeFileSync(path.join(output, "config.js"),
  "window.ARC_CONFIG = " + JSON.stringify(config, null, 2) + ";\n");

// The archive's meta CSP is retained, but permit Firebase Auth's Google API
// endpoints in the same policy so the browser client can authenticate.
const htmlPath = path.join(output, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace(
  /connect-src 'self'[^;]*;/,
  "connect-src 'self' https:\/\/*.supabase.co https:\/\/*.googleapis.com https:\/\/*.firebaseapp.com https:\/\/identitytoolkit.googleapis.com https:\/\/securetoken.googleapis.com;"
);
fs.writeFileSync(htmlPath, html);

console.log("ARC AI static site extracted to dist/. Configure Firebase and Supabase public client variables in Vercel before enabling sign-in.");
