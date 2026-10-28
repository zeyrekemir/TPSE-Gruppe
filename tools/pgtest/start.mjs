// Starts a temporary PostgreSQL 17 on port 54329 (data is deleted on exit).
// Then, in backend/:  ROBOTS_TEST_DATABASE_URL=postgresql+psycopg://robots:robots-test@localhost:54329/robots_test pytest
import { rmSync } from 'node:fs'
import EmbeddedPostgres from 'embedded-postgres'

// A run that was killed (not stopped with Ctrl+C) leaves its data behind; it is throwaway, start clean.
rmSync('./data', { recursive: true, force: true })

const pg = new EmbeddedPostgres({
  databaseDir: './data',
  user: 'robots',
  password: 'robots-test',
  port: 54329,
  persistent: false,
  // Windows system locales such as "Turkish_Türkiye.1254" are rejected by initdb.
  initdbFlags: ['--locale=C', '--encoding=UTF8'],
})
await pg.initialise()
await pg.start()
await pg.createDatabase('robots_test')
console.log('PG READY on port 54329')

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 1 << 30)
