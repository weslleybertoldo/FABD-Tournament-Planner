// admin-federations — endpoint dedicado pra gerenciar federations + organizers
// do FABD Tournament Planner. Substitui acesso cross-projeto via service_role
// que o Site FABD tinha (auditoria 09/05 — A3).
//
// Auth: shared secret via header `X-Admin-Secret`. Site FABD admin function
// guarda esse secret em env var. Compromisso do Site FABD limita atacante
// a estas operacoes (vs service_role full antes).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_SECRET = Deno.env.get("ADMIN_FEDERATIONS_SECRET");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!ADMIN_SECRET) {
  throw new Error("Missing ADMIN_FEDERATIONS_SECRET");
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// CORS — so aceita do Site FABD edge function (server-to-server, sem browser)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Comparacao em tempo constante pro shared secret
function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function sanitize(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  // Auth via shared secret
  const got = req.headers.get("x-admin-secret") || "";
  if (!ctEqual(got, ADMIN_SECRET!)) {
    return respond({ error: "Unauthorized" }, 401);
  }

  try {
    const { action, ...data } = await req.json();

    switch (action) {
      case "list_federations": {
        const { data: feds, error } = await sb.from("federations")
          .select("id,slug,name,short_name,state,city,primary_color,active,created_at")
          .order("short_name");
        if (error) throw error;
        return respond({ success: true, federations: feds });
      }

      case "add_federation": {
        const slug = sanitize(data.slug, 20).toLowerCase();
        const name = sanitize(data.name, 120);
        const short_name = sanitize(data.short_name, 20);
        const state = sanitize(data.state, 4).toUpperCase();
        const city = data.city ? sanitize(data.city, 80) : null;
        const primary_color = data.primary_color ? sanitize(data.primary_color, 9) : "#1E3A8A";
        if (!slug || !name || !short_name || !state) {
          return respond({ error: "Campos obrigatorios: slug, name, short_name, state" }, 400);
        }
        if (!/^[a-z0-9-]{2,20}$/.test(slug)) {
          return respond({ error: "Slug invalido" }, 400);
        }
        const { data: fed, error } = await sb.from("federations")
          .insert({ slug, name, short_name, state, city, primary_color })
          .select().single();
        if (error) {
          if ((error as { code?: string }).code === "23505") return respond({ error: "Slug ja existe" }, 409);
          throw error;
        }
        return respond({ success: true, federation: fed });
      }

      case "update_federation": {
        const id = data.id;
        if (!id) return respond({ error: "ID obrigatorio" }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof data.name === "string") patch.name = sanitize(data.name, 120);
        if (typeof data.short_name === "string") patch.short_name = sanitize(data.short_name, 20);
        if (typeof data.state === "string") patch.state = sanitize(data.state, 4).toUpperCase();
        if (typeof data.city === "string") patch.city = sanitize(data.city, 80);
        if (typeof data.primary_color === "string") patch.primary_color = sanitize(data.primary_color, 9);
        if (typeof data.active === "boolean") patch.active = data.active;
        const { error } = await sb.from("federations").update(patch).eq("id", id);
        if (error) throw error;
        return respond({ success: true });
      }

      case "list_organizers": {
        const { data: orgs, error } = await sb.from("organizers")
          .select("email,name,role,active,state,federation_id,created_at,last_login_at,federations(slug,short_name)")
          .order("federation_id,email");
        if (error) throw error;
        return respond({ success: true, organizers: orgs });
      }

      case "add_organizer": {
        const email = sanitize(data.email, 120).toLowerCase();
        const name = sanitize(data.name, 80);
        const role = ["super_admin", "admin", "organizer"].includes(data.role) ? data.role : "organizer";
        const federation_id = role === "super_admin" ? null : data.federation_id;
        const state = data.state ? sanitize(data.state, 4).toUpperCase() : null;
        if (!email || !email.includes("@") || !name) return respond({ error: "Email e nome obrigatorios" }, 400);
        if (role !== "super_admin" && !federation_id) return respond({ error: "Federacao obrigatoria" }, 400);
        const { error } = await sb.from("organizers")
          .insert({ email, name, role, federation_id, state, active: true });
        if (error) {
          if ((error as { code?: string }).code === "23505") return respond({ error: "Email ja cadastrado" }, 409);
          throw error;
        }
        return respond({ success: true });
      }

      case "update_organizer": {
        const email = sanitize(data.email, 120).toLowerCase();
        if (!email) return respond({ error: "Email obrigatorio" }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof data.name === "string") patch.name = sanitize(data.name, 80);
        if (typeof data.active === "boolean") patch.active = data.active;
        if (["super_admin", "admin", "organizer"].includes(data.role)) {
          patch.role = data.role;
          if (data.role === "super_admin") patch.federation_id = null;
        }
        if (data.federation_id !== undefined) patch.federation_id = data.federation_id;
        const { error } = await sb.from("organizers").update(patch).eq("email", email);
        if (error) throw error;
        return respond({ success: true });
      }

      case "delete_organizer": {
        const email = sanitize(data.email, 120).toLowerCase();
        if (!email) return respond({ error: "Email obrigatorio" }, 400);
        const { error } = await sb.from("organizers").delete().eq("email", email);
        if (error) throw error;
        return respond({ success: true });
      }

      default:
        return respond({ error: "Acao desconhecida" }, 400);
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error("[admin-federations] erro:", e.stack || e.message);
    } else {
      console.error("[admin-federations] erro:", e);
    }
    return respond({ error: "Erro interno" }, 500);
  }
});
