import { NextResponse } from "next/server";
import { hasSupabase, supabaseSelect } from "../../../lib/supabase";

export async function GET() {
  try {
    const heartbeat = hasSupabase()
      ? await supabaseSelect<{ created_at: string }>("schedule_keys", "select=created_at&id=eq.worker-heartbeat")
      : [];
    return NextResponse.json({ ok: true, workerLastSeen: heartbeat[0]?.created_at || null });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao verificar o sistema.",
    }, { status: 500 });
  }
}
