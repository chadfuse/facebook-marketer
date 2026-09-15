const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      supabaseClient = createClient(url, key);
      return supabaseClient;
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e.message);
    }
  }
  return null;
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
}

/**
 * Fetch a document by key from the Supabase store table
 */
async function fetchSupabaseDoc(key) {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('fb_marketer_store')
      .select('data')
      .eq('key', key)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // PGRST116 is row not found
        console.warn(`Supabase fetch warning for key "${key}":`, error.message);
      }
      return null;
    }

    return data ? data.data : null;
  } catch (err) {
    console.error(`Supabase fetch error for key "${key}":`, err.message);
    return null;
  }
}

/**
 * Upsert a document by key to the Supabase store table
 */
async function saveSupabaseDoc(key, docData) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('fb_marketer_store')
      .upsert({
        key,
        data: docData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) {
      console.error(`Supabase save error for key "${key}":`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Supabase save error for key "${key}":`, err.message);
    return false;
  }
}

module.exports = {
  getSupabaseClient,
  isSupabaseConfigured,
  fetchSupabaseDoc,
  saveSupabaseDoc
};
