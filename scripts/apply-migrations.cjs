const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to apply migrations');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_assignment_migrations" (
        "name" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationNames = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migrationName of migrationNames) {
      const alreadyApplied = await client.query('SELECT 1 FROM "_assignment_migrations" WHERE "name" = $1', [
        migrationName,
      ]);

      if (alreadyApplied.rowCount > 0) {
        continue;
      }

      const sqlPath = path.join(migrationsDir, migrationName, 'migration.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_assignment_migrations" ("name") VALUES ($1)', [migrationName]);
        await client.query('COMMIT');
        console.log(`Applied migration ${migrationName}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
