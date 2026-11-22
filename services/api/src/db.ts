import knex, { type Knex } from "knex";

const db: Knex = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "medicore",
    user: process.env.DB_USER || "medicore",
    password: process.env.DB_PASSWORD
  },
  pool: {
    min: 0,
    max: 10
  }
});

export default db;
