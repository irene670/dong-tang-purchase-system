import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/postgres';

export const pool = new pg.Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = {
  async sql(strings, ...values) {
    // Transform tagged template to pg parameter format ($1, $2, ...)
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        query += '$' + (i + 1);
      }
    }

    const client = await pool.connect();
    try {
      const res = await client.query(query, values);
      return res.rows;
    } finally {
      client.release();
    }
  }
};

// Auto run migrations
export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.info('Running database migrations...');
    
    // Create migrations tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        run_at timestamptz DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, '../netlify/database/migrations');
    if (fs.existsSync(migrationsDir)) {
      const folders = fs.readdirSync(migrationsDir)
        .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
        .sort();

      for (const folder of folders) {
        const check = await client.query('SELECT name FROM schema_migrations WHERE name = $1', [folder]);
        if (check.rows.length === 0) {
          console.info(`Applying migration: ${folder}`);
          const sqlFile = path.join(migrationsDir, folder, 'migration.sql');
          if (fs.existsSync(sqlFile)) {
            const sqlContent = fs.readFileSync(sqlFile, 'utf8');
            
            await client.query('BEGIN');
            try {
              await client.query(sqlContent);
              await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [folder]);
              await client.query('COMMIT');
              console.info(`Successfully applied migration: ${folder}`);
            } catch (err) {
              await client.query('ROLLBACK');
              console.error(`Failed to apply migration: ${folder}`, err);
              throw err;
            }
          }
        }
      }
    }

    // Apply local user authentication table migration
    const userMigrationCheck = await client.query("SELECT name FROM schema_migrations WHERE name = 'local_users_auth'");
    if (userMigrationCheck.rows.length === 0) {
      console.info('Applying local user authentication schema...');
      const sqlFile = path.join(__dirname, 'init_users_table.sql');
      if (fs.existsSync(sqlFile)) {
        const sqlContent = fs.readFileSync(sqlFile, 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sqlContent);
          await client.query("INSERT INTO schema_migrations (name) VALUES ('local_users_auth')");
          await client.query('COMMIT');
          console.info('Successfully applied local user authentication schema.');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('Failed to apply local user authentication schema', err);
          throw err;
        }
      }
    }

    console.info('All database migrations completed successfully.');
  } catch (error) {
    console.error('Database migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}
