// Entry point for Supabase (Deno). Bundled with the game engine into ../index.ts.
import { handle, type Store } from './server.ts';
import { supabaseStore } from './supabaseStore.ts';

declare const Deno: any;
let store: Promise<Store> | null = null;
Deno.serve(async (req: Request) => {
  try {
    store ??= supabaseStore((k) => Deno.env.get(k));
    return await handle(req, await store);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: 'Something went wrong at the table. Please try again.' }), {
      status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }
});
