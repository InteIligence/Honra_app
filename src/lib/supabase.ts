import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase — a porta única para o "cérebro" (base de dados + Porteiro).
 * As chaves vêm do ficheiro .env (EXPO_PUBLIC_*). Ver README-HONRA.md.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const temConfig = url.length > 0 && anon.length > 0;

if (!temConfig) {
  // Não rebenta — avisa no terminal para colares as chaves no .env.
  console.warn(
    '[Honra] Falta configurar o Supabase. Cria o .env com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (ver README-HONRA.md).'
  );
}

export const supabase = createClient(url || 'http://placeholder', anon || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
