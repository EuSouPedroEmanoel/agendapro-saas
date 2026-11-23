import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL não definida. Configure o arquivo .env.");
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`
CREATE TABLE IF NOT EXISTS companies (id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT;
UPDATE companies SET slug=trim(both '-' from regexp_replace(lower(name),'[^a-z0-9]+','-','g')) || '-' || id WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique_idx ON companies(slug);
CREATE TABLE IF NOT EXISTS company_users (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, name TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0), price NUMERIC(10,2) NOT NULL CHECK(price >= 0), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS appointments (id SERIAL PRIMARY KEY, client_name TEXT NOT NULL, client_contact TEXT NOT NULL, service_id INTEGER REFERENCES services(id), starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','completed','canceled')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(ends_at > starts_at));
CREATE TABLE IF NOT EXISTS availability (id SERIAL PRIMARY KEY, weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6), enabled BOOLEAN NOT NULL DEFAULT TRUE, start_time TIME NOT NULL DEFAULT '09:00', end_time TIME NOT NULL DEFAULT '18:00');
CREATE TABLE IF NOT EXISTS jev_assessments (id SERIAL PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, category TEXT NOT NULL, probability INTEGER NOT NULL CHECK(probability BETWEEN 0 AND 100), reviewed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO companies(id,name) VALUES(1,'Studio Aurora') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('companies','id'), GREATEST((SELECT max(id) FROM companies), 1));
ALTER TABLE services ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE availability ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE jev_assessments ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE availability DROP CONSTRAINT IF EXISTS availability_weekday_key;
UPDATE services SET company_id=1 WHERE company_id IS NULL;
UPDATE appointments SET company_id=1 WHERE company_id IS NULL;
UPDATE availability SET company_id=1 WHERE company_id IS NULL;
UPDATE jev_assessments SET company_id=1 WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS availability_company_weekday_idx ON availability(company_id,weekday);
CREATE INDEX IF NOT EXISTS appointments_company_time_idx ON appointments(company_id,starts_at);
`);
const {
  rows: [count],
} = await client.query(
  "SELECT count(*)::int AS count FROM services WHERE company_id=1",
);
if (count.count === 0) {
  await client.query(
    "INSERT INTO services(company_id,name,duration_minutes,price) VALUES(1,'Corte com estilo',60,85),(1,'Coloração criativa',120,180),(1,'Consultoria de visual',30,45)",
  );
  await client.query(
    "INSERT INTO availability(company_id,weekday,enabled,start_time,end_time) SELECT 1,day,day between 1 and 5,'09:00','18:00' FROM generate_series(0,6) day ON CONFLICT (company_id,weekday) DO NOTHING",
  );
  const { rows: s } = await client.query(
    "SELECT id,name,duration_minutes FROM services WHERE company_id=1 ORDER BY id",
  );
  await client.query(
    "INSERT INTO appointments(company_id,client_name,client_contact,service_id,starts_at,ends_at,status) VALUES(1,$1,$2,$3,$4,$5,'confirmed'),(1,$6,$7,$8,$9,$10,'confirmed')",
    [
      "Bruna Melo",
      "(11) 98888-2211",
      s[1].id,
      "2026-11-23T10:00:00-03:00",
      "2026-11-23T12:00:00-03:00",
      "Lia Santos",
      "lia@email.com",
      s[0].id,
      "2026-11-23T14:00:00-03:00",
      "2026-11-23T15:00:00-03:00",
    ],
  );
  await client.query(
    "INSERT INTO jev_assessments(company_id,title,summary,category,probability) VALUES(1,'Lia pode precisar de um lembrete','A reserva é em breve e o contato parece incompleto para uma confirmação rápida.','Risco de ausência',72),(1,'Quinta-feira tem espaço','Há quatro horários livres. Talvez seja um bom dia para divulgar encaixes.','Agenda',61),(1,'Dados minimizados','Insights usam contexto da agenda sem enviar nome, e-mail ou telefone dos clientes.','Privacidade',100)",
  );
}
console.log("Banco AgendaPro pronto.");
await client.end();
