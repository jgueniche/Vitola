/**
 * The two variables every referential page depends on.
 *
 * Read through functions rather than at module load: `next.config.ts` asserts
 * their presence at BUILD time (see the note there), and a module-level throw
 * here would fire during collection of that very config, turning a legible
 * message into a stack trace.
 */

function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is missing. The referential cannot be read without it — see .env.example.`,
    )
  }
  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL')
}

export function supabasePublishableKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
}
