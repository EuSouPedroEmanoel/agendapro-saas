import express from 'express'
import cors from 'cors'
import pg from 'pg'
import dotenv from 'dotenv'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

dotenv.config()
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida. Configure o arquivo .env.')
const scrypt = promisify(scryptCallback)
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const app = express()
const sessions = new Map()
app.use(cors()); app.use(express.json())

const hashPassword = async password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}` }
const passwordMatches = async (password, stored) => { const [salt, savedHash] = stored.split(':'); const derived = Buffer.from(await scrypt(password, salt, 64)); const saved = Buffer.from(savedHash, 'hex'); return saved.length === derived.length && timingSafeEqual(saved, derived) }
const createSession = account => { const token = randomBytes(32).toString('hex'); sessions.set(token, { companyId: account.company_id, name: account.company_name, email: account.email }); return { token, company: { id: account.company_id, name: account.company_name } } }
const optionalCompany = req => sessions.get(req.header('x-session'))?.companyId || 1
const requireCompany = (req, res, next) => { const session = sessions.get(req.header('x-session')); if (!session) return res.status(401).json({ error: 'Entre ou crie uma empresa para acessar esta área.' }); req.companyId = session.companyId; next() }

app.get('/api/health', async (_, res) => { try { await pool.query('select 1'); res.json({ ok: true }) } catch { res.status(503).json({ ok: false, error: 'Banco indisponível' }) } })
app.post('/api/auth/register', async (req, res) => {
  const { companyName, name, email, password } = req.body
  if (!companyName || !name || !email || !password) return res.status(400).json({ error: 'Preencha empresa, nome, e-mail e senha.' })
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' })
  const client = await pool.connect()
  try {
    await client.query('begin')
    const company = (await client.query('insert into companies(name) values($1) returning id,name', [companyName.trim()])).rows[0]
    const passwordHash = await hashPassword(password)
    const account = (await client.query('insert into company_users(company_id,name,email,password_hash) values($1,$2,lower($3),$4) returning id,company_id,name,email', [company.id, name.trim(), email.trim(), passwordHash])).rows[0]
    await client.query("insert into availability(company_id,weekday,enabled,start_time,end_time) select $1, day, day between 1 and 5, '09:00', '18:00' from generate_series(0,6) day", [company.id])
    await client.query('commit'); res.status(201).json(createSession({ ...account, company_name: company.name }))
  } catch (error) { await client.query('rollback'); if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' }); res.status(500).json({ error: 'Não foi possível criar a empresa.' }) } finally { client.release() }
})
app.post('/api/auth/login', async (req, res) => { const { email, password } = req.body; const account = (await pool.query('select u.*,c.name company_name from company_users u join companies c on c.id=u.company_id where u.email=lower($1)', [email || ''])).rows[0]; if (!account || !(await passwordMatches(password || '', account.password_hash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' }); res.json(createSession(account)) })

app.get('/api/services', async (req, res) => res.json((await pool.query('select id,name,duration_minutes,price,active from services where company_id=$1 order by id', [optionalCompany(req)])).rows))
app.post('/api/services', requireCompany, async (req, res) => { const { name, duration_minutes, price } = req.body; if (!name || !duration_minutes) return res.status(400).json({ error: 'Nome e duração são obrigatórios' }); const q = await pool.query('insert into services(company_id,name,duration_minutes,price) values($1,$2,$3,$4) returning id,name,duration_minutes,price,active', [req.companyId, name, duration_minutes, price || 0]); res.status(201).json(q.rows[0]) })
app.patch('/api/services/:id', requireCompany, async (req, res) => { const q = await pool.query('update services set active=$1 where id=$2 and company_id=$3 returning id,name,duration_minutes,price,active', [req.body.active, req.params.id, req.companyId]); if (!q.rows[0]) return res.status(404).json({ error: 'Serviço não encontrado.' }); res.json(q.rows[0]) })
app.get('/api/appointments', requireCompany, async (req, res) => res.json((await pool.query('select a.*,s.name service_name,s.duration_minutes from appointments a join services s on s.id=a.service_id where a.company_id=$1 order by a.starts_at', [req.companyId])).rows))
app.post('/api/appointments', async (req, res) => { const { client_name, client_contact, service_id, starts_at } = req.body; const companyId = optionalCompany(req); if (!client_name || !client_contact || !service_id || !starts_at) return res.status(400).json({ error: 'Preencha os dados da reserva' }); const service = (await pool.query('select * from services where id=$1 and company_id=$2 and active=true', [service_id, companyId])).rows[0]; if (!service) return res.status(400).json({ error: 'Serviço indisponível' }); const start = new Date(starts_at); const end = new Date(start.getTime() + service.duration_minutes * 60000); const conflict = (await pool.query("select id from appointments where company_id=$1 and status in ('confirmed','completed') and starts_at < $3 and ends_at > $2", [companyId, start, end])).rowCount; if (conflict) return res.status(409).json({ error: 'Este horário acabou de ser reservado' }); const q = await pool.query('insert into appointments(company_id,client_name,client_contact,service_id,starts_at,ends_at) values($1,$2,$3,$4,$5,$6) returning *', [companyId, client_name, client_contact, service_id, start, end]); res.status(201).json(q.rows[0]) })
app.patch('/api/appointments/:id', requireCompany, async (req, res) => { const q = await pool.query('update appointments set status=$1 where id=$2 and company_id=$3 returning *', [req.body.status, req.params.id, req.companyId]); if (!q.rows[0]) return res.status(404).json({ error: 'Reserva não encontrada.' }); res.json(q.rows[0]) })
app.get('/api/availability', requireCompany, async (req, res) => res.json((await pool.query('select weekday,enabled,start_time,end_time from availability where company_id=$1 order by weekday', [req.companyId])).rows))
app.patch('/api/availability/:weekday', requireCompany, async (req, res) => res.json((await pool.query('update availability set enabled=$1 where weekday=$2 and company_id=$3 returning weekday,enabled,start_time,end_time', [req.body.enabled, req.params.weekday, req.companyId])).rows[0]))
app.get('/api/insights', requireCompany, async (req, res) => res.json((await pool.query('select id,title,summary,category,probability,reviewed from jev_assessments where company_id=$1 order by id', [req.companyId])).rows))
app.patch('/api/insights/:id', requireCompany, async (req, res) => res.json((await pool.query('update jev_assessments set reviewed=$1 where id=$2 and company_id=$3 returning id,title,summary,category,probability,reviewed', [req.body.reviewed, req.params.id, req.companyId])).rows[0]))
app.listen(process.env.PORT || 3001, () => console.log(`API AgendaPro em http://localhost:${process.env.PORT || 3001}`))
