import { createBrowserClient } from '@supabase/ssr'

// Note: For full type safety, generate types from your Supabase project:
// npx supabase gen types typescript --project-id your-project-id > src/types/database.ts
// Then import and use: createBrowserClient<Database>(...)

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
