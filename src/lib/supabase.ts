import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://udtmabrnhxnuvruuidfc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkdG1hYnJuaHhudXZydXVpZGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMTMzMzIsImV4cCI6MjA2NjY4OTMzMn0.HL5j-DoeevWiKdc-fzFc_WGQfyQ3-hvHTBJg9CS5ba8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey); 