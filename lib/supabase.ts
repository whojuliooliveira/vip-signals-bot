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
