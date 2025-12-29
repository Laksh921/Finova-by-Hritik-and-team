import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxosgmiburvilnyfttjv.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4b3NnbWlidXJ2aWxueWZ0dGp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzAwODU2MSwiZXhwIjoyMDgyNTg0NTYxfQ.Qct7Pn_Ig_St7q4XJAMxaqadiEtHUhR2lugPBkzAIuk';

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey);