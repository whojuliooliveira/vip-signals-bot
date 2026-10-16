const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabase() {
  return Boolean(supabaseUrl && serviceKey);
}

export async function supabaseSelect<T>(table: string, query = "select=*") {
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase não configurado.");
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: supabaseHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase select ${table}: ${await response.text()}`);
  return await response.json() as T[];
}

export async function supabaseSelectAll<T>(table: string, query = "select=*", pageSize = 1000) {
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase não configurado.");
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      headers: {
        ...supabaseHeaders(),
        Range: `${offset}-${offset + pageSize - 1}`,
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase select ${table}: ${await response.text()}`);
    const page = await response.json() as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function supabaseUpsert<T extends Record<string, unknown>>(table: string, rows: T[], conflict = "id") {
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase não configurado.");
  if (!rows.length) return;
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Supabase upsert ${table}: ${await response.text()}`);
}

export async function supabaseDelete(table: string, query: string) {
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase não configurado.");
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=minimal",
    },
  });
  if (!response.ok) throw new Error(`Supabase delete ${table}: ${await response.text()}`);
}

function supabaseHeaders() {
  return {
    apikey: serviceKey!,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}
