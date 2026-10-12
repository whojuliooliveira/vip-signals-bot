import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const projectRef = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SECRET_API_KEY;
const migrationsDir = join(process.cwd(), "supabase", "migrations");

if (!projectRef) {
  console.error("SUPABASE_PROJECT_REF não configurado.");
  process.exit(1);
}

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN ou SUPABASE_SECRET_API_KEY não configurado.");
  process.exit(1);
}

const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const query = await readFile(join(migrationsDir, file), "utf8");
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`Falha na migration ${file} (${response.status}): ${body}`);
    process.exit(1);
  }

  console.log(`Migration aplicada: ${file}`);
}
