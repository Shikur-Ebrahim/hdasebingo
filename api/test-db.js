import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkSettings() {
  const { data, error } = await supabase.from('settings').select('*');
  console.log('Settings:', data, error);
}
checkSettings();
