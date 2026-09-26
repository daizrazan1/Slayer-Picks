import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(import.meta.dirname, "../.env.local");
const token = randomBytes(24).toString("hex");
const databaseUri = "postgresql://postgres.pztvixgyyxjkbobzdvvz:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres";

function reply(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

const server = createServer((req, res) => {
  if (req.headers.host !== `127.0.0.1:${server.address().port}`) {
    reply(res, 403, "Forbidden");
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    reply(res, 200, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Slayer Picks setup</title><style>
      body{font:17px system-ui,sans-serif;max-width:560px;margin:8vh auto;padding:0 20px;color:#172033}
      h1{font-size:30px}label{display:block;font-weight:650;margin:24px 0 8px}
      input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #9ba6b6;border-radius:8px}
      button{margin-top:28px;background:#172033;color:white;border:0;border-radius:8px;padding:13px 20px;font:inherit;cursor:pointer}
      p{line-height:1.5;color:#4b5563}small{display:block;margin-top:6px;color:#606b7a}
    </style><h1>Connect Slayer Picks</h1><p>Enter these on your computer. They are saved only in the private local settings file.</p>
    <form method="post" action="/"><input type="hidden" name="token" value="${token}">
    <label for="password">Supabase database password</label><input id="password" name="password" type="password" autocomplete="off" required>
    <small>This is the database password from Supabase, not your Supabase sign-in password.</small>
    <label for="groq">New Groq API key (optional for now)</label><input id="groq" name="groq" type="password" autocomplete="off">
    <small>Use a new key because the previous one was posted in chat.</small>
    <button type="submit">Save local settings</button></form></html>`);
    return;
  }

  if (req.method !== "POST" || req.url !== "/" || req.headers["content-type"] !== "application/x-www-form-urlencoded") {
    reply(res, 404, "Not found");
    return;
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 10000) req.destroy();
  });
  req.on("end", () => {
    const form = new URLSearchParams(body);
    const password = form.get("password") ?? "";
    const groq = form.get("groq") ?? "";
    if (form.get("token") !== token || !password || /[\r\n]/.test(password + groq)) {
      reply(res, 400, "Invalid form. Go back and try again.");
      return;
    }

    let current = readFileSync(file, "utf8");
    current = current.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUri.replace("[YOUR-PASSWORD]", encodeURIComponent(password))}`);
    if (groq) current = current.replace(/^GROQ_API_KEY=.*$/m, `GROQ_API_KEY=${groq}`);
    writeFileSync(file, current, { mode: 0o600 });
    reply(res, 200, "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Saved</title><h1>Settings saved</h1><p>You can return to Codex and say ready.</p></html>");
    server.close();
  });
});

server.listen(0, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${server.address().port}/ to enter your local settings.`);
});
