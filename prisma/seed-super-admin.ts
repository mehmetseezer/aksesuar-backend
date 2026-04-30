import * as mariadb from 'mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbUrl = process.env.DATABASE_URL!.replace('mysql://', 'mariadb://');
  const pool = mariadb.createPool(dbUrl);
  const conn = await pool.getConnection();

  try {
    const password_hash = await bcrypt.hash('password', 10);
    const existing = await conn.query('SELECT id FROM system_admins WHERE email = "admin@nexus.com"');
    
    if (existing.length > 0) {
      await conn.query('UPDATE system_admins SET password_hash = ?, name = ? WHERE email = ?', [password_hash, 'Super Admin', 'admin@nexus.com']);
    } else {
      await conn.query('INSERT INTO system_admins (email, name, password_hash, updated_at) VALUES (?, ?, ?, NOW())', ['admin@nexus.com', 'Super Admin', password_hash]);
    }
    console.log('Super Admin seeded successfully');
  } catch (err) {
    console.error('Error seeding super admin:', err);
  } finally {
    await conn.release();
    await pool.end();
  }
}

main();
