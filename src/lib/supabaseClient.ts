import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. ' +
      'Скопируйте .env.example в .env и подставьте значения из Supabase (Project Settings → API).',
  );
}

// В клиент попадает только анонимный (public) ключ: он безопасен по дизайну,
// потому что все права доступа проверяет RLS на стороне базы.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
