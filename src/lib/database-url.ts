// Finds a plain postgres:// connection string. Hosting integrations name it
// differently: Neon sets DATABASE_URL (+ DATABASE_URL_UNPOOLED); Prisma
// Postgres may put a prisma+postgres:// address in DATABASE_URL and the
// plain one in POSTGRES_URL. The pg driver needs the plain one.

const isPlain = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//.test(v)

export function databaseUrl(opts: { direct?: boolean } = {}): string {
  const names = [...(opts.direct ? ['DATABASE_URL_UNPOOLED'] : []), 'DATABASE_URL', 'POSTGRES_URL']
  const found = names.map((n) => process.env[n]).find(isPlain)
  if (!found) throw new Error(`No postgres:// connection string in ${names.join(', ')}`)
  return found
}
