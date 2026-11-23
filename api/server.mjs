import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

dotenv.config();
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL não definida. Configure o arquivo .env.");
const scrypt = promisify(scryptCallback);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const sessions = new Map();
app.use(cors());
app.use(express.json());

const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
};
const passwordMatches = async (password, stored) => {
  const [salt, savedHash] = stored.split(":");
  const derived = Buffer.from(await scrypt(password, salt, 64));
  const saved = Buffer.from(savedHash, "hex");
  return saved.length === derived.length && timingSafeEqual(saved, derived);
};
const createSession = async (account) => {
  const token = randomBytes(32).toString("hex");
  const session = {
    companyId: account.company_id,
    name: account.company_name,
    email: account.email,
  };
  sessions.set(token, session);
  await pool.query("insert into auth_sessions(token,company_id) values($1,$2) on conflict (token) do update set company_id=excluded.company_id", [token, account.company_id]);
  return {
    token,
    company: { id: account.company_id, name: account.company_name, slug: account.company_slug, publicUrl: `/p/${account.company_slug}` },
  };
};
const sessionFor = async req => { const token=req.header("x-session"); const memory=sessions.get(token); if(memory)return memory; if(!token)return undefined; const row=(await pool.query("select s.company_id,c.name from auth_sessions s join companies c on c.id=s.company_id where s.token=$1",[token])).rows[0]; if(!row)return undefined; const session={companyId:row.company_id,name:row.name}; sessions.set(token,session); return session };
const optionalCompany = async req => (await sessionFor(req))?.companyId || 1;
const requireCompany = async (req, res, next) => {
  const session = await sessionFor(req);
  if (!session)
    return res
      .status(401)
      .json({ error: "Entre ou crie uma empresa para acessar esta área." });
  req.companyId = session.companyId;
  next();
};

const redactPrivateDetails = (value) => value
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contato removido]")
  .replace(/(?:\+?\d[\d().\s-]{7,}\d)/g, "[contato removido]");
const jevChoice = (value, allowed) => {
  const choice = String(value?.choice || "other").toLowerCase();
  const confidence = Number(value?.confidence);
  return {
    choice: allowed.includes(choice) ? choice : "other",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
};

app.post("/api/jev/interpret", async (req, res) => {
  const key = process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY;
  if (!key) return res.status(503).json({ error: "Configure JEV_API_KEY no .env e reinicie a API." });
  const { message, mode } = req.body || {};
  if (typeof message !== "string" || !message.trim() || message.length > 1200 || !["company", "client"].includes(mode)) {
    return res.status(400).json({ error: "Mensagem inválida para o Jev." });
  }

  let companyId;
  if (mode === "company") {
    const session = await sessionFor(req);
    if (!session) return res.status(401).json({ error: "Entre na conta da empresa para usar o Jev." });
    companyId = session.companyId;
  } else {
    const slug = String(req.body.companySlug || "");
    const company = (await pool.query("select id from companies where slug=$1", [slug])).rows[0];
    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
    companyId = company.id;
  }

  const [serviceRows, clientRows] = await Promise.all([
    pool.query("select name from services where company_id=$1 and active=true", [companyId]),
    pool.query("select distinct client_name from appointments where company_id=$1 and client_name is not null", [companyId]),
  ]);
  let safeMessage = redactPrivateDetails(message.trim());
  safeMessage = safeMessage
    .replace(/\b(?:meu nome [ée]|me chamo|sou)\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}/giu, "[nome removido]");
  const firstPart = safeMessage.match(/^\s*([^,;]{1,50})\s*,/u)?.[1]?.trim();
  if (firstPart) {
    const firstNormalized = firstPart.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const knownTerms = new Set(["quero", "agendar", "marcar", "reservar", "corte", "masculino", "barba", "completa", "manha", "tarde", "noite", "hoje", "amanha", "domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"]);
    for (const row of serviceRows.rows) for (const word of row.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\W+/)) knownTerms.add(word);
    if (!firstNormalized.split(/\s+/).some(word => knownTerms.has(word)) && !/\d/.test(firstPart)) {
      safeMessage = safeMessage.replace(firstPart, "[nome removido]");
    }
  }
  for (const row of clientRows.rows) {
    if (row.client_name && row.client_name.length > 2) {
      safeMessage = safeMessage.replace(new RegExp(row.client_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[cliente]");
    }
  }
  const knownUtteranceWords = new Set([
    "quero", "queria", "gostaria", "desejo", "preciso", "pode", "por", "favor", "agendar", "marcar", "reservar", "reserva", "criar", "fazer", "novo", "nova", "atendimento", "horario", "hora", "hoje", "amanha", "depois", "dia", "dias", "domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "as", "às", "h", "das", "de", "do", "da", "dos", "das", "para", "pra", "em", "no", "na", "com", "e", "um", "uma", "o", "a", "meu", "nome", "me", "chamo", "sou", "cancelar", "cancele", "desmarcar", "desmarque", "remover", "abrir", "reabrir", "fechar", "bloquear", "disponivel", "indisponivel", "expediente", "cadastrar", "descadastrar", "ativar", "desativar", "desabilitar", "corte", "masculino", "barba", "completa", "cabelo", "e", "pezinho", "degrade", "degradê", "cortar", "cortei", "aparar", "bigode", "maquina", "navalha", "servico", "serviços", "barbeiro", "manha", "tarde", "noite", "pedir", "quais", "qual", "pelo", "mesmo", "dia", "entre", "ate", "às", "ate", "tem", "livre", "livres", "horarios", "mudanca", "semana", "semanal", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado", "sabado"
  ]);
  for (const row of serviceRows.rows) {
    for (const word of row.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\W+/)) knownUtteranceWords.add(word);
  }
  const possibleNames = [...safeMessage.matchAll(/[\p{L}][\p{L}'-]*/gu)].map(match => match[0]);
  for (const word of new Set(possibleNames)) {
    const normalizedWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (word.length > 1 && !knownUtteranceWords.has(normalizedWord)) {
      safeMessage = safeMessage.replace(new RegExp(`(?<![\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu"), "[nome removido]");
    }
  }

  const questions = {
    intent: {
      type: "choice",
      instructions: "Classifique a intenção principal da mensagem para o sistema AgendaPro. Escolha other quando houver ambiguidade.",
      criteria: {
        manage_hours: "Alterar o expediente recorrente da empresa, abrindo ou fechando um dia da semana.",
        cancel_booking: "Cancelar uma reserva confirmada existente (somente empresa).",
        book_appointment: "Solicitar uma nova reserva para um serviço e horário.",
        other: "Pergunta, mensagem ambígua ou intenção não suportada.",
      },
    },
  };
  if (mode === "client") {
    const serviceCriteria = Object.fromEntries(serviceRows.rows.map((row, index) => [`service_${index}`, row.name]));
    serviceCriteria.none = "Nenhum serviço citado com clareza ou ainda não foi informado.";
    questions.service = {
      type: "choice",
      instructions: "Identifique qual serviço cadastrado a pessoa quer. Use correspondência semântica por significado; por exemplo, 'masculino' corresponde a 'Corte masculino' quando essa opção estiver disponível. Se houver mais de uma opção plausível, prefira none.",
      criteria: serviceCriteria,
    };
    questions.date = {
      type: "noul",
      instructions: `A mensagem contém uma data pretendida para a reserva? Considere amanhã = ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 86400000))}, hoje = ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}.`,
    };
    questions.time = {
      type: "noul",
      instructions: "A mensagem contém um horário pretendido para a reserva? Formatos válidos incluem '14h', 'às 14' e '14 amanhã'.",
    };
  }
  if (mode === "company") questions.schedule_action = {
    type: "choice",
    instructions: "Quando a intenção for manage_hours, identifique se deve abrir ou fechar o dia recorrente.",
    criteria: { open: "Abrir ou habilitar a disponibilidade do dia.", close: "Fechar ou desabilitar a disponibilidade do dia.", unknown: "A ação de abertura ou fechamento não está clara." },
  };

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.JEV_MODEL || "jev-latest",
        state: { role: mode === "company" ? "company owner" : "public customer", utterance: safeMessage, available_services: serviceRows.rows.map(row => row.name) },
        questions,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return res.status(502).json({ error: "A chave do Jev foi recusada. Confira JEV_API_KEY no .env." });
      return res.status(502).json({ error: "O serviço Jev não respondeu agora. Tente novamente em instantes." });
    }
    const payload = await response.json();
    const answers = payload.answers || payload.result?.answers || {};
    const intent = jevChoice(answers.intent, ["manage_hours", "cancel_booking", "book_appointment", "other"]);
    const scheduleAction = mode === "company" ? jevChoice(answers.schedule_action, ["open", "close", "unknown"]) : undefined;
    const service = mode === "client" ? jevChoice(answers.service, [...serviceRows.rows.map((_, index) => `service_${index}`), "none"]) : undefined;
    const serviceIndex = service?.choice.startsWith("service_") ? Number(service.choice.slice("service_".length)) : -1;
    const dateProbability = Number(answers.date?.noul);
    const timeProbability = Number(answers.time?.noul);
    res.json({ intent, ...(scheduleAction ? { scheduleAction } : {}), ...(mode === "client" ? {
      service: { id: serviceIndex >= 0 ? serviceRows.rows[serviceIndex]?.id : null, choice: service?.choice || "none", confidence: service?.confidence || 0 },
      datePresent: Number.isFinite(dateProbability) && dateProbability >= 0.65,
      dateConfidence: Number.isFinite(dateProbability) ? dateProbability : 0,
      timePresent: Number.isFinite(timeProbability) && timeProbability >= 0.65,
      timeConfidence: Number.isFinite(timeProbability) ? timeProbability : 0,
    } : {}), model: payload.model || process.env.JEV_MODEL || "jev-latest" });
  } catch {
    res.status(502).json({ error: "Não consegui acessar o Jev agora. Tente novamente em instantes." });
  }
});

app.get("/api/health", async (_, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: "Banco indisponível" });
  }
});
const makeSlug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48) || 'empresa';
app.get('/api/public/companies/:slug', async (req,res) => {
  const company=(await pool.query('select id,name,slug from companies where slug=$1',[req.params.slug])).rows[0];
  if(!company)return res.status(404).json({error:'Empresa não encontrada.'});
  const [services,availability]=await Promise.all([
    pool.query('select id,name,duration_minutes,price,active from services where company_id=$1 and active=true order by id',[company.id]),
    pool.query('select weekday,enabled,start_time,end_time from availability where company_id=$1 order by weekday',[company.id]),
  ]);
  res.json({...company,services:services.rows,availability:availability.rows});
});
app.get('/api/public/companies/:slug/appointments', async (req,res) => {
  const company=(await pool.query('select id from companies where slug=$1',[req.params.slug])).rows[0];
  if(!company)return res.status(404).json({error:'Empresa não encontrada.'});
  const day=req.query.day;
  if(!day || !/^\d{4}-\d{2}-\d{2}$/.test(day))return res.status(400).json({error:'Informe uma data válida.'});
  const q=await pool.query("select starts_at,ends_at from appointments where company_id=$1 and status='confirmed' and (starts_at at time zone 'America/Sao_Paulo')::date=$2::date",[company.id,day]);
  res.json(q.rows);
});
app.post("/api/auth/register", async (req, res) => {
  const { companyName, name, email, password } = req.body;
  if (!companyName || !name || !email || !password)
    return res
      .status(400)
      .json({ error: "Preencha empresa, nome, e-mail e senha." });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "A senha precisa ter ao menos 6 caracteres." });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const company = (
      await client.query(
        "insert into companies(name,slug) values($1,$2) returning id,name,slug",
        [companyName.trim(), `${makeSlug(companyName)}-${randomBytes(3).toString('hex')}`],
      )
    ).rows[0];
    const passwordHash = await hashPassword(password);
    const account = (
      await client.query(
        "insert into company_users(company_id,name,email,password_hash) values($1,$2,lower($3),$4) returning id,company_id,name,email",
        [company.id, name.trim(), email.trim(), passwordHash],
      )
    ).rows[0];
    await client.query(
      "insert into availability(company_id,weekday,enabled,start_time,end_time) select $1, day, day between 1 and 5, '09:00', '18:00' from generate_series(0,6) day",
      [company.id],
    );
    await client.query("commit");
    res.status(201).json(await createSession({ ...account, company_name: company.name, company_slug: company.slug }));
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505")
      return res
        .status(409)
        .json({ error: "Já existe uma conta com este e-mail." });
    res.status(500).json({ error: "Não foi possível criar a empresa." });
  } finally {
    client.release();
  }
});
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const account = (
    await pool.query(
      "select u.*,c.name company_name,c.slug company_slug from company_users u join companies c on c.id=u.company_id where u.email=lower($1)",
      [email || ""],
    )
  ).rows[0];
  if (
    !account ||
    !(await passwordMatches(password || "", account.password_hash))
  )
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  res.json(await createSession(account));
});
app.get("/api/auth/me", requireCompany, async (req,res) => {
  const company=(await pool.query('select name,slug from companies where id=$1',[req.companyId])).rows[0];
  if(!company)return res.status(404).json({error:'Empresa não encontrada.'});
  res.json({company});
});

app.get("/api/services", async (req, res) =>
  res.json(
    (
      await pool.query(
        "select id,name,duration_minutes,price,active from services where company_id=$1 order by id",
        [await optionalCompany(req)],
      )
    ).rows,
  ),
);
app.post("/api/services", requireCompany, async (req, res) => {
  const { name, duration_minutes, price } = req.body;
  if (!name || !duration_minutes)
    return res.status(400).json({ error: "Nome e duração são obrigatórios" });
  const q = await pool.query(
    "insert into services(company_id,name,duration_minutes,price) values($1,$2,$3,$4) returning id,name,duration_minutes,price,active",
    [req.companyId, name, duration_minutes, price || 0],
  );
  res.status(201).json(q.rows[0]);
});
app.patch("/api/services/:id", requireCompany, async (req, res) => {
  const q = await pool.query(
    "update services set active=$1 where id=$2 and company_id=$3 returning id,name,duration_minutes,price,active",
    [req.body.active, req.params.id, req.companyId],
  );
  if (!q.rows[0])
    return res.status(404).json({ error: "Serviço não encontrado." });
  res.json(q.rows[0]);
});
app.get("/api/appointments", requireCompany, async (req, res) =>
  res.json(
    (
      await pool.query(
        "select a.*,s.name service_name,s.duration_minutes from appointments a join services s on s.id=a.service_id where a.company_id=$1 order by a.starts_at",
        [req.companyId],
      )
    ).rows,
  ),
);
app.post("/api/appointments", async (req, res) => {
  const { client_name, client_contact, service_id, starts_at } = req.body;
  if (!client_name || !client_contact || !service_id || !starts_at)
    return res.status(400).json({ error: "Preencha os dados da reserva" });
  const service = (
    await pool.query(
      "select s.*,c.id company_id from services s join companies c on c.id=s.company_id where s.id=$1 and s.active=true",
      [service_id],
    )
  ).rows[0];
  if (!service) return res.status(400).json({ error: "Serviço indisponível" });
  const start = new Date(starts_at);
  if(Number.isNaN(start.getTime()) || start <= new Date())return res.status(400).json({error:"Escolha um horário futuro válido."});
  const end = new Date(start.getTime() + service.duration_minutes * 60000);
  const companyId=service.company_id;
  const conflict = (
    await pool.query(
      "select id from appointments where company_id=$1 and status='confirmed' and starts_at < $3 and ends_at > $2",
      [companyId, start, end],
    )
  ).rowCount;
  if (conflict)
    return res
      .status(409)
      .json({ error: "Este horário acabou de ser reservado" });
  const weekday=new Date(start.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'})).getDay();
  const hours=(await pool.query('select enabled,start_time,end_time from availability where company_id=$1 and weekday=$2',[companyId,weekday])).rows[0];
  const startHm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(start);
  const endHm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(end);
  if(!hours?.enabled || startHm<hours.start_time.slice(0,5) || endHm>hours.end_time.slice(0,5))return res.status(400).json({error:'Esse horário está fora da disponibilidade da empresa.'});
  const q = await pool.query(
    "insert into appointments(company_id,client_name,client_contact,service_id,starts_at,ends_at) values($1,$2,$3,$4,$5,$6) returning *",
    [companyId, client_name, client_contact, service_id, start, end],
  );
  res.status(201).json(q.rows[0]);
});
app.patch("/api/appointments/:id", requireCompany, async (req, res) => {
  const q = await pool.query(
    "update appointments set status=$1 where id=$2 and company_id=$3 returning *",
    [req.body.status, req.params.id, req.companyId],
  );
  if (!q.rows[0])
    return res.status(404).json({ error: "Reserva não encontrada." });
  res.json(q.rows[0]);
});
app.get("/api/availability", requireCompany, async (req, res) =>
  res.json(
    (
      await pool.query(
        "select weekday,enabled,start_time,end_time from availability where company_id=$1 order by weekday",
        [req.companyId],
      )
    ).rows,
  ),
);
app.patch("/api/availability/:weekday", requireCompany, async (req, res) => {
  const current = (
    await pool.query(
      "select * from availability where weekday=$1 and company_id=$2",
      [req.params.weekday, req.companyId],
    )
  ).rows[0];
  if (!current)
    return res.status(404).json({ error: "Disponibilidade não encontrada." });
  const enabled = req.body.enabled ?? current.enabled;
  const start_time = req.body.start_time ?? current.start_time;
  const end_time = req.body.end_time ?? current.end_time;
  if (start_time >= end_time)
    return res
      .status(400)
      .json({ error: "O término deve ser depois do início." });
  const q = await pool.query(
    "update availability set enabled=$1,start_time=$2,end_time=$3 where weekday=$4 and company_id=$5 returning weekday,enabled,start_time,end_time",
    [enabled, start_time, end_time, req.params.weekday, req.companyId],
  );
  res.json(q.rows[0]);
});
app.get("/api/insights", requireCompany, async (req, res) =>
  res.json(
    (
      await pool.query(
        "select id,title,summary,category,probability,reviewed from jev_assessments where company_id=$1 order by id",
        [req.companyId],
      )
    ).rows,
  ),
);
app.patch("/api/insights/:id", requireCompany, async (req, res) =>
  res.json(
    (
      await pool.query(
        "update jev_assessments set reviewed=$1 where id=$2 and company_id=$3 returning id,title,summary,category,probability,reviewed",
        [req.body.reviewed, req.params.id, req.companyId],
      )
    ).rows[0],
  ),
);
app.listen(process.env.PORT || 3001, () =>
  console.log(`API AgendaPro em http://localhost:${process.env.PORT || 3001}`),
);
