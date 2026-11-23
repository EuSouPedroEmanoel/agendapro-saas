import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Heart,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import "./styles.css";
import "./login.css";
import "./access.css";
type Service = {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
  active: boolean;
};
type Appointment = {
  id: number;
  client_name: string;
  client_contact: string;
  service_id: number;
  service_name: string;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "completed" | "canceled";
};
type Insight = {
  id: number;
  title: string;
  summary: string;
  category: string;
  probability: number;
  reviewed: boolean;
};
type Av = {
  weekday: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
};
type View =
  | "dashboard"
  | "agenda"
  | "services"
  | "availability"
  | "insights"
  | "plans"
  | "login"
  | "public";
const api = async <T,>(path: string, opts?: RequestInit) => {
  const token = localStorage.getItem("agendapro_session");
  const r = await fetch("/api" + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-session": token } : {}),
      ...(opts?.headers || {}),
    },
    ...opts,
  });
  if (!r.ok) throw new Error((await r.json()).error || "Algo deu errado");
  return r.json() as Promise<T>;
};
const slots = ["09:00", "10:00", "11:30", "14:00", "15:30", "17:00"];
const localTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
const localDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
  }).format(new Date(iso));
const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "agenda", label: "Minha agenda", icon: CalendarDays },
  { id: "services", label: "Serviços", icon: Sparkles },
  { id: "availability", label: "Disponibilidade", icon: Clock3 },
  { id: "insights", label: "Jev Insights", icon: Zap },
  { id: "plans", label: "Planos e contrato", icon: FileText },
];
const paths: Record<View, string> = { dashboard: "/app", agenda: "/app/agenda", services: "/app/servicos", availability: "/app/disponibilidade", insights: "/app/insights", plans: "/app/planos", login: "/entrar", public: "/reservar" };
function App() {
  const authenticated = Boolean(localStorage.getItem("agendapro_session"));
  const location = useLocation();
  const navigate = useNavigate();
  const rawView = (Object.entries(paths).find(([, path]) => path === location.pathname)?.[0] as View | undefined) || (authenticated ? "dashboard" : "login");
  const view: View = !authenticated && rawView !== "public" ? "login" : rawView;
  const go = (next: View) => navigate(paths[next]);
  const [services, setServices] = useState<Service[]>([]),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [availability, setAvailability] = useState<Av[]>([]),
    [insights, setInsights] = useState<Insight[]>([]),
    [modal, setModal] = useState(false),
    [toast, setToast] = useState("");
  const companyName =
    localStorage.getItem("agendapro_company") || "Minha empresa";
  const reduced = useReducedMotion();
  const notify = (x: string) => {
    setToast(x);
    setTimeout(() => setToast(""), 2900);
  };
  const load = async () => {
    try {
      const [a, b, c, d] = await Promise.all([
        api<Service[]>("/services"),
        api<Appointment[]>("/appointments"),
        api<Av[]>("/availability"),
        api<Insight[]>("/insights"),
      ]);
      setServices(a);
      setAppointments(b);
      setAvailability(c);
      setInsights(d);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao carregar");
    }
  };
  useEffect(() => {
    if (authenticated) load();
  }, []);
  const signOut = () => {
    localStorage.removeItem("agendapro_session");
    localStorage.removeItem("agendapro_company");
    go("login");
    setServices([]);
    setAppointments([]);
    setAvailability([]);
    setInsights([]);
    notify("Você saiu da empresa");
  };
  const page = useMemo(
    () =>
      view === "dashboard" ? (
        <Dashboard
          appointments={appointments}
          services={services}
          go={go}
        />
      ) : view === "agenda" ? (
        <Agenda appointments={appointments} reload={load} notify={notify} />
      ) : view === "services" ? (
        <Services services={services} reload={load} notify={notify} />
      ) : view === "availability" ? (
        <Availability items={availability} reload={load} notify={notify} />
      ) : view === "insights" ? (
        <Insights items={insights} reload={load} notify={notify} />
      ) : view === "plans" ? (
        <Plans go={go} notify={notify} />
      ) : view === "login" ? (
        <Login go={go} notify={notify} />
      ) : (
        <Public
          services={services}
          appointments={appointments}
          reload={load}
          notify={notify}
        />
      ),
    [view, services, appointments, availability, insights],
  );
  return (
    <main className="app">
      <aside>
        <button className="brand" onClick={() => go("dashboard")}>
          ✦ <span>AgendaPro</span>
        </button>
        <p className="tag">sua agenda, seu ritmo.</p>
        <nav>
          {nav.map((x) => {
            const Icon = x.icon;
            return (
              <button
                className={view === x.id ? "active" : ""}
                onClick={() => go(x.id)}
                key={x.id}
              >
                <Icon size={18} />
                <span>{x.label}</span>
                {x.id === "insights" && <i>beta</i>}
              </button>
            );
          })}
        </nav>
        <div className="aside-bottom">
          {authenticated ? (
            <button onClick={signOut}>
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          ) : (
            <button onClick={() => go("login")}>
              <Settings size={18} />
              <span>Entrar</span>
            </button>
          )}
          <button className="public" onClick={() => go("public")}>
            Ver página pública ↗
          </button>
          <div className="profile">
            <b>{companyName[0]?.toUpperCase()}</b>
            <div>
              <strong>{companyName}</strong>
              <small>
                {authenticated ? "Conta da empresa" : "Demonstração"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">SEGUNDA, 23 DE NOVEMBRO</p>
            <h1>
              {view === "dashboard"
                ? `Oi, ${companyName} ✦`
                : view === "public"
                  ? `Agendar com ${companyName}`
                  : view === "insights"
                    ? "Jev Insights"
                    : view === "login"
                      ? "Entrar"
                      : nav.find((x) => x.id === view)?.label}
            </h1>
          </div>
          {authenticated && !["public", "plans", "login"].includes(view) && (
            <button className="primary" onClick={() => setModal(true)}>
              <Plus size={18} /> Novo agendamento
            </button>
          )}
        </header>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {page}
          </motion.div>
        </AnimatePresence>
      </section>
      <AnimatePresence>
        {modal && (
          <Modal
            services={services}
            close={() => setModal(false)}
            reload={load}
            notify={notify}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Check size={18} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
function Dashboard({
  appointments,
  services,
  go,
}: {
  appointments: Appointment[];
  services: Service[];
  go: (x: View) => void;
}) {
  const today = appointments.filter(
    (a) => localDay(a.starts_at) === "23" && a.status !== "canceled",
  );
  return (
    <div className="grid">
      <section className="hero">
        <div>
          <p className="eyebrow">SEU RITMO HOJE</p>
          <h2>
            Deixa a agenda
            <br />
            tocar sozinha.
          </h2>
          <p>
            Você tem <b>{today.length} atendimentos</b> hoje. Respira, está tudo
            sob controle.
          </p>
          <button className="soft" onClick={() => go("agenda")}>
            Abrir agenda
          </button>
        </div>
        <div className="doodle">
          ✦<em>♥</em>
        </div>
      </section>
      <section className="stats">
        <Stat
          title="Hoje"
          value={`${today.length} reservas`}
          icon={<CalendarDays />}
        />
        <Stat title="Receita prevista" value="R$ 265" icon={<Sparkles />} />
        <Stat title="Horários livres" value="4 slots" icon={<Clock3 />} />
      </section>
      <section className="panel schedule">
        <div className="head">
          <div>
            <p className="eyebrow">AGENDA DE HOJE</p>
            <h2>Próximos atendimentos</h2>
          </div>
          <button onClick={() => go("agenda")}>Ver todos</button>
        </div>
        {today.map((a) => (
          <Row a={a} key={a.id} />
        ))}
      </section>
      <section className="panel mini">
        <p className="eyebrow">COMECE POR AQUI</p>
        <h2>Sua vitrine está quase pronta</h2>
        <div className="progress">
          <span />
        </div>
        <p>Cadastre seus serviços e compartilhe o seu link.</p>
        <button className="outline" onClick={() => go("public")}>
          Abrir página pública
        </button>
      </section>
      <section className="panel services-mini">
        <div className="head">
          <h2>Serviços ativos</h2>
          <button onClick={() => go("services")}>Gerenciar</button>
        </div>
        {services
          .filter((x) => x.active)
          .map((s) => (
            <div className="service-line" key={s.id}>
              <span>{s.name}</span>
              <b>{s.duration_minutes} min</b>
              <small>R$ {Number(s.price).toFixed(0)}</small>
            </div>
          ))}
      </section>
    </div>
  );
}
function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <span>{icon}</span>
      <small>{title}</small>
      <strong>{value}</strong>
    </div>
  );
}
function Row({ a }: { a: Appointment }) {
  return (
    <div className="row">
      <time>
        {localTime(a.starts_at)}
        <small>{a.duration_minutes} min</small>
      </time>
      <b className="avatar">{a.client_name[0]}</b>
      <div>
        <strong>{a.client_name}</strong>
        <small>{a.service_name}</small>
      </div>
      <i>confirmado</i>
    </div>
  );
}
function Agenda({
  appointments,
  reload,
  notify,
}: {
  appointments: Appointment[];
  reload: () => void;
  notify: (x: string) => void;
}) {
  const [day, setDay] = useState("23");
  const list = appointments.filter(
    (a) => localDay(a.starts_at) === day && a.status !== "canceled",
  );
  const update = async (id: number, status: string) => {
    await api(`/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    reload();
    notify(
      status === "completed"
        ? "Atendimento concluído"
        : "Reserva cancelada e horário liberado",
    );
  };
  return (
    <div className="agenda">
      <div className="days">
        {["22", "23", "24", "25", "26", "27", "28"].map((d, i) => (
          <button
            onClick={() => setDay(d)}
            className={d === day ? "on" : ""}
            key={d}
          >
            <small>
              {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][i]}
            </small>
            <b>{d}</b>
          </button>
        ))}
      </div>
      <section className="panel timeline">
        <div className="head">
          <div>
            <p className="eyebrow">NOVEMBRO 2026</p>
            <h2>{day} de novembro</h2>
          </div>
          <i>{list.length} reservas</i>
        </div>
        {slots.map((t) => {
          const a = list.find((x) => localTime(x.starts_at) === t);
          return (
            <div className="slot" key={t}>
              <time>{t}</time>
              {a ? (
                <div className="booking">
                  <b className="avatar">{a.client_name[0]}</b>
                  <div>
                    <strong>{a.client_name}</strong>
                    <small>
                      {a.service_name} · {a.duration_minutes} min
                    </small>
                  </div>
                  <button onClick={() => update(a.id, "completed")}>
                    <Check size={16} />
                  </button>
                  <button onClick={() => update(a.id, "canceled")}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <span>horário livre</span>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
function Services({
  services,
  reload,
  notify,
}: {
  services: Service[];
  reload: () => void;
  notify: (x: string) => void;
}) {
  const [name, setName] = useState(""),
    [duration, setDuration] = useState(60),
    [price, setPrice] = useState(0);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    await api("/services", {
      method: "POST",
      body: JSON.stringify({ name, duration_minutes: duration, price }),
    });
    setName("");
    reload();
    notify("Novo serviço adicionado ✦");
  };
  const toggle = async (s: Service) => {
    await api(`/services/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !s.active }),
    });
    reload();
  };
  return (
    <div className="narrow">
      <div className="intro">
        <p>
          Monte seu cardápio de experiências. Só serviços ativos aparecem para
          os clientes.
        </p>
      </div>
      <form className="add-service" onSubmit={add}>
        <input
          placeholder="Novo serviço"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          value={duration}
          onChange={(e) => setDuration(+e.target.value)}
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(+e.target.value)}
        />
        <button className="primary">Adicionar</button>
      </form>
      <div className="service-list">
        {services.map((s) => (
          <article key={s.id}>
            <b>✦</b>
            <div>
              <h2>{s.name}</h2>
              <p>
                {s.duration_minutes} minutos · R${" "}
                {Number(s.price).toFixed(2).replace(".", ",")}
              </p>
            </div>
            <button
              className={s.active ? "switch on" : "switch"}
              onClick={() => toggle(s)}
            >
              <span />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
function Availability({
  items,
  reload,
  notify,
}: {
  items: Av[];
  reload: () => void;
  notify: (x: string) => void;
}) {
  const days = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  const save = async (a: Av, changes: Partial<Av>) => {
    try {
      await api(`/availability/${a.weekday}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      reload();
      notify("Horário atualizado ✦");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível atualizar");
    }
  };
  return (
    <div className="narrow">
      <p className="intro-copy">
        Defina os dias e horários da sua empresa. Clientes só conseguem reservar
        dentro dessas janelas.
      </p>
      <section className="panel availability">
        {items.map((a) => (
          <div key={a.weekday}>
            <button
              aria-label={`Alterar disponibilidade de ${days[a.weekday]}`}
              className={a.enabled ? "switch on" : "switch"}
              onClick={() => save(a, { enabled: !a.enabled })}
            >
              <span />
            </button>
            <strong>{days[a.weekday]}</strong>
            {a.enabled ? (
              <>
                <input
                  aria-label={`Início ${days[a.weekday]}`}
                  type="time"
                  value={a.start_time.slice(0, 5)}
                  onChange={(e) => save(a, { start_time: e.target.value })}
                />
                <small>até</small>
                <input
                  aria-label={`Fim ${days[a.weekday]}`}
                  type="time"
                  value={a.end_time.slice(0, 5)}
                  onChange={(e) => save(a, { end_time: e.target.value })}
                />
              </>
            ) : (
              <small>Indisponível</small>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
function Insights({
  items,
  reload,
  notify,
}: {
  items: Insight[];
  reload: () => void;
  notify: (x: string) => void;
}) {
  const review = async (i: Insight) => {
    await api(`/insights/${i.id}`, {
      method: "PATCH",
      body: JSON.stringify({ reviewed: !i.reviewed }),
    });
    reload();
    notify(i.reviewed ? "Insight reaberto" : "Insight marcado como revisado");
  };
  return (
    <div className="insights">
      <section className="insight-hero">
        <b>✦</b>
        <div>
          <p className="eyebrow">EXPERIMENTAL · REVISÃO HUMANA</p>
          <h2>
            Um olhar a mais
            <br />
            para o seu ritmo.
          </h2>
          <p>
            O Jev lê sinais da agenda e sugere prioridades. Ele nunca toma
            decisões nem mexe nas suas reservas.
          </p>
        </div>
      </section>
      <section className="insight-grid">
        {items.map((i, n) => (
          <article className={n === 0 ? "featured" : ""} key={i.id}>
            <i>{i.category}</i>
            <h3>{i.title}</h3>
            <p>{i.summary}</p>
            <strong>{i.probability}% de confiança</strong>
            <button onClick={() => review(i)}>
              {i.reviewed ? "Reabrir" : "Marcar como revisado"}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
function Plans({
  go,
  notify,
}: {
  go: (v: View) => void;
  notify: (x: string) => void;
}) {
  const [enterprise, setEnterprise] = useState(false);
  return (
    <div className="plans">
      <section className="plans-intro">
        <p className="eyebrow">PLANOS QUE CRESCEM COM VOCÊ</p>
        <h2>Escolha o ritmo do seu negócio.</h2>
        <p>
          O contrato é simples, transparente e sempre disponível para consulta
          pelo responsável da empresa.
        </p>
      </section>
      <div className="plan-grid">
        <article>
          <span>Free</span>
          <h3>R$ 0</h3>
          <p>Para começar a organizar sua agenda.</p>
          <ul>
            <li>Até 30 agendamentos por mês</li>
            <li>Página pública</li>
            <li>Gestão básica</li>
          </ul>
          <button
            className="outline"
            onClick={() => notify("Plano Free selecionado")}
          >
            Plano atual
          </button>
        </article>
        <article className="pro">
          <span>Pro ✦</span>
          <h3>
            R$ 19,90<small>/mês</small>
          </h3>
          <p>Para quem quer uma agenda sem limites.</p>
          <ul>
            <li>Agendamentos ilimitados</li>
            <li>Personalização do perfil</li>
            <li>Insights avançados</li>
          </ul>
          <button
            className="primary"
            onClick={() => notify("Assinatura Pro preparada")}
          >
            Assinar Pro
          </button>
        </article>
        <article className="enterprise">
          <span>Empresa</span>
          <h3>Vamos conversar</h3>
          <p>Para equipes, unidades e operações com mais controle.</p>
          <ul>
            <li>Vários profissionais</li>
            <li>Contrato empresarial</li>
            <li>Suporte prioritário</li>
          </ul>
          <button
            className="outline"
            onClick={() => setEnterprise(!enterprise)}
          >
            {enterprise ? "Fechar contrato" : "Ver contrato do plano"}
          </button>
        </article>
      </div>
      {enterprise && (
        <motion.section
          className="contract"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <p className="eyebrow">CONTRATO DO PLANO EMPRESA</p>
            <h2>AgendaPro para empresas</h2>
          </div>
          <dl>
            <dt>Contratante</dt>
            <dd>Empresa responsável pela operação e pelos dados inseridos.</dd>
            <dt>Vigência</dt>
            <dd>
              Mensal, com renovação automática e cancelamento a qualquer
              momento.
            </dd>
            <dt>Incluído</dt>
            <dd>
              Usuários por equipe, múltiplas agendas, suporte prioritário e
              implantação assistida.
            </dd>
            <dt>Privacidade</dt>
            <dd>
              Dados dos clientes permanecem sob controle da empresa;
              recomendações de IA são opcionais e revisáveis.
            </dd>
          </dl>
          <button className="primary" onClick={() => go("login")}>
            Entrar para gerenciar o contrato
          </button>
        </motion.section>
      )}
    </div>
  );
}
function Login({
  go,
  notify,
}: {
  go: (v: View) => void;
  notify: (x: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [companyName, setCompanyName] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ token: string; company: { name: string } }>(
        `/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          body: JSON.stringify(
            mode === "login"
              ? { email, password }
              : { companyName, name, email, password },
          ),
        },
      );
      localStorage.setItem("agendapro_session", data.token);
      localStorage.setItem("agendapro_company", data.company.name);
      notify(
        mode === "login"
          ? "Sessão iniciada ✦"
          : `Empresa ${data.company.name} criada ✦`,
      );
      go("dashboard");
      setTimeout(() => window.location.reload(), 350);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Não foi possível continuar");
    } finally {
      setBusy(false);
    }
  };
  const creating = mode === "register";
  return (
    <div className="login-wrap">
      <section className="login-story">
        <button className="login-brand" onClick={() => go("dashboard")}>
          ✦ AgendaPro
        </button>
        <div>
          <p className="eyebrow">SUA EMPRESA, SEU RITMO</p>
          <h1>
            Uma agenda que
            <br />
            <em>combina</em> com você.
          </h1>
          <p>
            Crie sua empresa, organize serviços e receba reservas em uma página
            só sua.
          </p>
        </div>
        <div className="login-proof">
          <span>✦</span>
          <p>“Finalmente uma agenda que dá vontade de abrir todo dia.”</p>
          <small>— Ana Rosa, Studio Aurora</small>
        </div>
        <div className="login-shapes">
          ✦ <span>♥</span>
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">✦</div>
        <p className="eyebrow">
          {creating ? "NOVA EMPRESA" : "BEM-VINDA DE VOLTA"}
        </p>
        <h2>{creating ? "Crie sua agenda" : "Entrar na sua agenda"}</h2>
        <p>
          {creating
            ? "Cada empresa tem seus próprios serviços, reservas e horários."
            : "Use seus dados para gerenciar sua empresa, agenda e plano."}
        </p>
        {creating && (
          <>
            <label>
              Nome da empresa
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex.: Studio Aurora"
                required
              />
            </label>
            <label>
              Seu nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como podemos te chamar?"
                required
              />
            </label>
          </>
        )}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo de 6 caracteres"
            minLength={6}
            required
          />
        </label>
        <button className="primary wide" disabled={busy}>
          {busy
            ? "Preparando sua agenda…"
            : creating
              ? "Criar empresa"
              : "Entrar"}{" "}
          <span>→</span>
        </button>
        <p className="new-account">
          {creating ? "Já possui uma conta? " : "Ainda não usa o AgendaPro? "}
          <button
            type="button"
            onClick={() => setMode(creating ? "login" : "register")}
          >
            {creating ? "Entrar" : "Criar empresa"}
          </button>
        </p>
      </form>
    </div>
  );
}
function Public({
  services,
  appointments,
  reload,
  notify,
}: {
  services: Service[];
  appointments: Appointment[];
  reload: () => void;
  notify: (x: string) => void;
}) {
  const [selected, setSelected] = useState(
      services.find((s) => s.active)?.id || 0,
    ),
    [time, setTime] = useState(""),
    [name, setName] = useState(""),
    [contact, setContact] = useState("");
  const booked = (x: string) =>
    appointments.some(
      (a) =>
        localDay(a.starts_at) === "25" &&
        localTime(a.starts_at) === x &&
        a.status !== "canceled",
    );
  const submit = async () => {
    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          client_name: name,
          client_contact: contact,
          service_id: selected,
          starts_at: "2026-11-25T" + time + ":00-03:00",
        }),
      });
      reload();
      notify("Reserva confirmada ✦");
      setName("");
      setContact("");
      setTime("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro");
    }
  };
  return (
    <div className="public-page">
      <section className="public-profile">
        <b>A</b>
        <p className="eyebrow">AGENDA ONLINE</p>
        <h2>Ana Rosa</h2>
        <p>Beleza, cor e coragem para você se sentir do seu jeito.</p>
      </section>
      <section className="booking-form">
        <Step n="01" title="Escolha um serviço">
          <div className="choices">
            {services
              .filter((s) => s.active)
              .map((s) => (
                <button
                  className={s.id === selected ? "selected" : ""}
                  onClick={() => setSelected(s.id)}
                  key={s.id}
                >
                  <b>{s.name}</b>
                  <small>
                    {s.duration_minutes} min · R$ {Number(s.price).toFixed(0)}
                  </small>
                </button>
              ))}
          </div>
        </Step>
        <Step n="02" title="Escolha o horário">
          <p className="date">Quarta, 25 de novembro</p>
          <div className="time-grid">
            {slots.map((t) => (
              <button
                disabled={booked(t)}
                className={time === t ? "selected" : ""}
                key={t}
                onClick={() => setTime(t)}
              >
                {booked(t) ? "ocupado" : t}
              </button>
            ))}
          </div>
        </Step>
        <Step n="03" title="Seus dados">
          <label>
            Como podemos te chamar?
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </label>
          <label>
            WhatsApp ou e-mail
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Seu melhor contato"
            />
          </label>
          <button className="primary wide" onClick={submit}>
            Confirmar agendamento <Heart size={17} />
          </button>
        </Step>
      </section>
    </div>
  );
}
function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="step">
      <b>{n}</b>
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
function Modal({
  services,
  close,
  reload,
  notify,
}: {
  services: Service[];
  close: () => void;
  reload: () => void;
  notify: (x: string) => void;
}) {
  const [name, setName] = useState(""),
    [contact, setContact] = useState(""),
    [service, setService] = useState(services[0]?.id || 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          client_name: name,
          client_contact: contact,
          service_id: service,
          starts_at: "2026-11-23T17:00:00-03:00",
        }),
      });
      reload();
      close();
      notify("Agendamento criado com sucesso ✦");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro");
    }
  };
  return (
    <motion.div
      className="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={close}
    >
      <motion.form
        className="modal"
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <button type="button" className="close" onClick={close}>
          <X />
        </button>
        <p className="eyebrow">NOVA RESERVA</p>
        <h2>Adicionar à agenda</h2>
        <label>
          Nome
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Contato
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
          />
        </label>
        <label>
          Serviço
          <select value={service} onChange={(e) => setService(+e.target.value)}>
            {services
              .filter((s) => s.active)
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <button className="primary wide">Criar agendamento</button>
      </motion.form>
    </motion.div>
  );
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
