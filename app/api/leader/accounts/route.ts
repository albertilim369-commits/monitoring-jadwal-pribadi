import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import type { LeaderAccount, Profile } from "@/lib/types";

type LeaderContext =
  | {
      userId: string;
      profile: Profile;
      response?: never;
    }
  | {
      userId?: never;
      profile?: never;
      response: NextResponse;
    };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function loadProfile(userId: string) {
  if (!supabaseAdmin) return { profile: null, error: "Supabase admin belum siap." };

  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, email, role, created_at")
    .eq("user_id", userId)
    .single();

  if (!profileResult.error) {
    return { profile: profileResult.data as Profile, error: null };
  }

  if (!profileResult.error.message.includes("role")) {
    return { profile: null, error: profileResult.error.message };
  }

  const fallbackResult = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, email, created_at")
    .eq("user_id", userId)
    .single();

  if (fallbackResult.error || !fallbackResult.data) {
    return { profile: null, error: fallbackResult.error?.message || "Profil tidak ditemukan." };
  }

  const fallbackProfile = fallbackResult.data as Omit<Profile, "role">;
  return {
    profile: {
      ...fallbackProfile,
      role: fallbackProfile.username === "arnold" ? "leader" : "member"
    } satisfies Profile,
    error: null
  };
}

async function requireLeader(request: NextRequest): Promise<LeaderContext> {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return {
      response: errorResponse(
        "SUPABASE_SERVICE_ROLE_KEY belum ditambahkan di server. Tambahkan key itu di .env.local dan Vercel Environment Variables.",
        500
      )
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { response: errorResponse("Session tidak ditemukan. Login ulang dulu.", 401) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return { response: errorResponse("Session tidak valid. Login ulang dulu.", 401) };
  }

  const { profile, error: profileError } = await loadProfile(data.user.id);

  if (profileError || !profile) {
    return { response: errorResponse(profileError || "Profil tidak ditemukan.", 403) };
  }

  if (profile.role !== "leader" && profile.username !== "arnold") {
    return { response: errorResponse("Fitur ini hanya untuk akun leader.", 403) };
  }

  return { userId: data.user.id, profile };
}

async function loadProfiles(): Promise<Profile[]> {
  if (!supabaseAdmin) return [];

  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, email, role, created_at")
    .order("created_at", { ascending: false });

  if (!profileResult.error) {
    return (profileResult.data || []) as Profile[];
  }

  if (!profileResult.error.message.includes("role")) {
    throw new Error(profileResult.error.message);
  }

  const fallbackResult = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, email, created_at")
    .order("created_at", { ascending: false });

  if (fallbackResult.error) {
    throw new Error(fallbackResult.error.message);
  }

  return ((fallbackResult.data || []) as Array<Omit<Profile, "role">>).map((profile) => ({
    ...profile,
    role: profile.username === "arnold" ? "leader" : "member"
  }));
}

export async function GET(request: NextRequest) {
  const leader = await requireLeader(request);
  if (leader.response) return leader.response;

  if (!supabaseAdmin) {
    return errorResponse("Supabase admin belum siap.", 500);
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    return errorResponse(error.message, 500);
  }

  let profiles: Profile[] = [];
  try {
    profiles = await loadProfiles();
  } catch (profileError) {
    return errorResponse(profileError instanceof Error ? profileError.message : "Gagal memuat profil akun.", 500);
  }
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));

  const accounts: LeaderAccount[] = data.users.map((authUser) => {
    const profile = profileById.get(authUser.id);
    const username = profile?.username || authUser.email?.split("@")[0] || "tanpa-username";

    return {
      user_id: authUser.id,
      username,
      email: profile?.email || authUser.email || "",
      role: profile?.role || (username === "arnold" ? "leader" : "member"),
      created_at: profile?.created_at || authUser.created_at,
      last_sign_in_at: authUser.last_sign_in_at || null
    };
  });

  return NextResponse.json(
    { accounts },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function DELETE(request: NextRequest) {
  const leader = await requireLeader(request);
  if (leader.response) return leader.response;

  if (!supabaseAdmin) {
    return errorResponse("Supabase admin belum siap.", 500);
  }

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const targetUserId = typeof body?.userId === "string" ? body.userId : "";

  if (!targetUserId) {
    return errorResponse("Pilih akun yang ingin dihapus.", 400);
  }

  if (targetUserId === leader.userId) {
    return errorResponse("Akun yang sedang dipakai tidak bisa menghapus dirinya sendiri.", 400);
  }

  const { profile: targetProfile } = await loadProfile(targetUserId);
  if (targetProfile?.username === "arnold") {
    return errorResponse("Akun leader utama arnold tidak boleh dihapus.", 400);
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}
