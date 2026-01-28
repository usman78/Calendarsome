const { Pool } = require('pg');
const config = require('../config');

// Create connection pool
// Vercel provides POSTGRES_URL automatically
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false // Required for Vercel/Neon
    }
});

// Helper to convert SQLite '?' params to Postgres '$1, $2' syntax
function convertSql(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
}

// Wrapper for db.run (INSERT, UPDATE, DELETE)
function runAsync(sql, params = []) {
    return new Promise(async (resolve, reject) => {
        try {
            const pgSql = convertSql(sql);
            const client = await pool.connect();
            try {
                const result = await client.query(pgSql, params);

                // Map Postgres result to SQLite format
                // SQLite returns { id: lastID, changes: changes }
                // Postgres INSERT returns rows if RETURNING is used, but we need to simulate SQLite behavior
                // For INSERT, we can't easily get lastID without RETURNING id in the SQL
                // This is a limitation. We might need to modify the SQL for INSERTs.

                let id = null;
                if (result.command === 'INSERT' && result.rows.length > 0) {
                    id = result.rows[0].id;
                }

                resolve({
                    id: id, // Only works if we append RETURNING id
                    changes: result.rowCount
                });
            } finally {
                client.release();
            }
        } catch (err) {
            console.error('Postgres Query Error:', err);
            reject(err);
        }
    });
}

// Wrapper for db.get (Select single row)
function getAsync(sql, params = []) {
    return new Promise(async (resolve, reject) => {
        try {
            const pgSql = convertSql(sql);
            const client = await pool.connect();
            try {
                const result = await client.query(pgSql, params);
                resolve(result.rows[0]);
            } finally {
                client.release();
            }
        } catch (err) {
            reject(err);
        }
    });
}

// Wrapper for db.all (Select multiple rows)
function allAsync(sql, params = []) {
    return new Promise(async (resolve, reject) => {
        try {
            const pgSql = convertSql(sql);
            const client = await pool.connect();
            try {
                const result = await client.query(pgSql, params);
                resolve(result.rows);
            } finally {
                client.release();
            }
        } catch (err) {
            reject(err);
        }
    });
}

// Special function to handle INSERTs with ID return
// We need to intercept INSERT queries and append "RETURNING id" if not present
const originalRunAsync = runAsync;
runAsync = function (sql, params = []) {
    if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
        sql += ' RETURNING id';
    }
    return originalRunAsync(sql, params);
};

module.exports = {
    pool,
    runAsync,
    getAsync,
    allAsync
};
