import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()
const { Client } = pg
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida. Configure o arquivo .env.')
const client = new Client({connectionString:process.env.DATABASE_URL})
await client.connect()
await client.query(`
CREATE TABLE IF NOT EXISTS services (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0), price NUMERIC(10,2) NOT NULL CHECK(price >= 0), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS appointments (
 id SERIAL PRIMARY KEY, client_name TEXT NOT NULL, client_contact TEXT NOT NULL, service_id INTEGER REFERENCES services(id), starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','completed','canceled')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS appointments_time_idx ON appointments(starts_at);
CREATE TABLE IF NOT EXISTS availability (id SERIAL PRIMARY KEY, weekday INTEGER UNIQUE NOT NULL CHECK(weekday BETWEEN 0 AND 6), enabled BOOLEAN NOT NULL DEFAULT TRUE, start_time TIME NOT NULL DEFAULT '09:00', end_time TIME NOT NULL DEFAULT '18:00');
CREATE TABLE IF NOT EXISTS jev_assessments (id SERIAL PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, category TEXT NOT NULL, probability INTEGER NOT NULL CHECK(probability BETWEEN 0 AND 100), reviewed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`)
const {rows:[count]}=await client.query('SELECT count(*)::int AS count FROM services')
if(count.count===0){
 await client.query(`INSERT INTO services (name,duration_minutes,price) VALUES ('Corte com estilo',60,85),('Coloração criativa',120,180),('Consultoria de visual',30,45)`)
 await client.query(`INSERT INTO availability (weekday,enabled,start_time,end_time) VALUES (0,false,'09:00','18:00'),(1,true,'09:00','18:00'),(2,true,'09:00','18:00'),(3,true,'09:00','18:00'),(4,true,'09:00','18:00'),(5,true,'09:00','18:00'),(6,false,'09:00','18:00')`)
 const {rows:s}=await client.query('SELECT id,name,duration_minutes FROM services ORDER BY id')
 await client.query(`INSERT INTO appointments(client_name,client_contact,service_id,starts_at,ends_at,status) VALUES ($1,$2,$3,$4,$5,'confirmed'),($6,$7,$8,$9,$10,'confirmed')`,['Bruna Melo','(11) 98888-2211',s[1].id,'2026-11-23T10:00:00-03:00','2026-11-23T12:00:00-03:00','Lia Santos','lia@email.com',s[0].id,'2026-11-23T14:00:00-03:00','2026-11-23T15:00:00-03:00'])
 await client.query(`INSERT INTO jev_assessments(title,summary,category,probability) VALUES ('Lia pode precisar de um lembrete','A reserva é em breve e o contato parece incompleto para uma confirmação rápida.','Risco de ausência',72),('Quinta-feira tem espaço','Há quatro horários livres. Talvez seja um bom dia para divulgar encaixes.','Agenda',61),('Dados minimizados','Insights usam contexto da agenda sem enviar nome, e-mail ou telefone dos clientes.','Privacidade',100)`)
}
console.log('Banco AgendaPro pronto.')
await client.end()
