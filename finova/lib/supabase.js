import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxosgmiburvilnyfttjv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4b3NnbWlidXJ2aWxueWZ0dGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMDg1NjEsImV4cCI6MjA4MjU4NDU2MX0.Mh-KWxoSq92E5a32iz5K5EhQwXNqpVNV1GJv5J33O5o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);