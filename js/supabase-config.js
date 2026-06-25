// =====================================================================
// SUPABASE CONFIGURATION
// =====================================================================
// These two values are safe to ship in a public/static frontend:
//   - the Project URL is public
//   - the publishable (anon) key only allows what your Row Level Security
//     policies allow. Never put the SECRET key or DB password here.
//
// The supabase-js library is loaded from a CDN in the HTML <head> before
// this file, so the global `supabase` object exists here.
// =====================================================================

const SUPABASE_URL = "https://bgcacnbyrbpctpmfevno.supabase.co";
const SUPABASE_KEY = "sb_publishable_nCoVV1ZUWNpAecD1fNz23A_6FE1nHKg";

// Create one shared client for the whole app.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
