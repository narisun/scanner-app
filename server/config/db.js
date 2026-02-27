const { Pool } = require('pg');

// Create a new pool using the connection string from the environment variables
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Export the pool so other modules (like routes) can use it to query the database
module.exports = pool;