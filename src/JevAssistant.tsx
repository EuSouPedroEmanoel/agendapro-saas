import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Send, Sparkles, X, Zap } from "lucide-react";
import "./jev-assistant.css";

type Service = { id:number; name:string; duration_minutes:number; price:number; active:boolean };
type Availability = { weekday:number; enabled:boolean; start_time:string; end_time:string };
type Appointment = { id:number; client_name:string; client_contact:string; service_id:number; service_name:string; duration_minutes:number; starts_at:string; ends_at:string; status:string };
type Company = { name:string; slug:string };
type Props = { mode:"company"|"client"; company:Company|null; services:Service[]; availability:Availability[]; appointments:Appointment[]; onRefresh:()=>void|Promise<void>; onBooked?:(date:string)=>void|Promise<void> };
type Message = { role:"jev"|"user"; text:string };
type IntentResult = { intent:{choice:"manage_hours"|"cancel_booking"|"book_appointment"|"other";confidence:number}; scheduleAction?:{choice:"open"|"close"|"unknown";confidence:number}; service?:{id:number|null;choice:string;confidence:number}; datePresent?:boolean; dateConfidence?:number; timePresent?:boolean; timeConfidence?:number; model:string };
type BookingDraft = { serviceId?:number; date?:string; time?:string; clientName?:string; contact?:string; confidence?:number; awaiting?:"service"|"date"|"time"|"name"|"contact" };
type Proposal =
  | { kind:"availability"; weekday:number; enabled:boolean; start_time:string; end_time:string; summary:string; confidence:number }
  | { kind:"cancel"; appointmentId:number; summary:string; confidence:number }
  | { kind:"booking"; serviceId:number; date:string; time:string; clientName:string; contact:string; summary:string; confidence:number };

const DAY_NAMES=["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const dateISO=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const todayISO=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
const parseDate=(text:string):string|undefined=>{
  const value=normalize(text), today=todayISO(), base=new Date(`${today}T12:00:00-03:00`);
  const offset=value.match(/\bdepois de amanha\b/) ? 2 : value.match(/\bamanha\b/) ? 1 : value.match(/\bhoje\b/) ? 0 : undefined;
  if(offset!==undefined){base.setDate(base.getDate()+offset);return dateISO(base)}
  const explicit=value.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
  if(explicit){let year=explicit[3]?Number(explicit[3]):Number(today.slice(0,4));if(year<100)year+=2000;const d=new Date(year,Number(explicit[2])-1,Number(explicit[1]),12);if(d.getFullYear()!==year||d.getMonth()!==Number(explicit[2])-1||d.getDate()!==Number(explicit[1]))return undefined;return dateISO(d)}
  const iso=value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso)return iso[1];
  const weekday=DAY_NAMES.findIndex(day=>value.includes(normalize(day)));if(weekday>=0){const current=base.getDay();let days=(weekday-current+7)%7;if(days===0)days=7;base.setDate(base.getDate()+days);return dateISO(base)}
  return undefined;
};
const parseTime=(text:string,allowBareHour=false):string|undefined=>{
  const value=normalize(text).replace(/\b\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?\b/g," ");
  let m=value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);if(m)return `${m[1].padStart(2,"0")}:${m[2]}`;
  m=value.match(/\b(?:as?|horario|hora)\s*([01]?\d|2[0-3])\s*h?\b|\b([01]?\d|2[0-3])\s*h(?:([0-5]\d))?\b/);
  if(!m){if(allowBareHour||/\b(amanha|hoje|depois de amanha)\b/.test(value)){const bare=value.match(/\b([01]?\d|2[0-3])\b/);if(bare)return `${bare[1].padStart(2,"0")}:00`}return undefined}const hour=m[1]||m[2],minute=m[3]||"00";return `${hour.padStart(2,"0")}:${minute}`;
};
const dateLabel=(date:string)=>date.split("-").reverse().join("/");
const request=async<T,>(path:string,body?:unknown,method=body?"POST":"GET"):Promise<T>=>{
  const token=localStorage.getItem("agendapro_session");
  const response=await fetch(`/api${path}`,{method,headers:{"Content-Type":"application/json",...(token?{"x-session":token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error((await response.json()).error||"Não consegui concluir essa ação.");
  return response.json() as Promise<T>;
};

export default function JevAssistant({mode,company,services,availability,appointments,onRefresh,onBooked}:Props){
  const [open,setOpen]=useState(false),[text,setText]=useState(""),[busy,setBusy]=useState(false);
  const [messages,setMessages]=useState<Message[]>([{role:"jev",text:mode==="company"?"Oi! Sou o Jev. Posso ajustar seus dias e horários, criar reservas ou cancelar uma existente. Vou mostrar a ação antes de executá-la.":"Oi! Sou o Jev. Posso ajudar a encontrar um horário e fazer sua reserva. Diga o serviço, dia e horário que prefere."}]);
  const [draft,setDraft]=useState<BookingDraft|null>(null),[proposal,setProposal]=useState<Proposal|null>(null);
  const endRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth",block:"end"})},[messages,proposal,open]);
  const say=(role:Message["role"],message:string)=>setMessages(current=>[...current,{role,text:message}]);
  const serviceFrom=(value:string)=>services.find(service=>normalize(value).includes(normalize(service.name)));
  const weekdayFrom=(value:string)=>DAY_NAMES.findIndex(day=>normalize(value).includes(normalize(day)));
  const contactFrom=(value:string)=>{
    const email=value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];if(email)return email;
    const withoutDates=value.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?\b/g," ");
    return withoutDates.match(/(?:\+?\d[\d() .-]{7,}\d)/)?.[0];
  };
  const nameFrom=(value:string,selectedServiceId?:number)=>{
    const match=value.match(/\b(?:meu nome [ée]|me chamo|sou)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3})/iu);
    if(match?.[1]){
      const nameWords=match[1].split(/\s+/),stopAt=nameWords.findIndex(word=>/^(e|quero|agendar|marcar|reservar|para|pra|hoje|amanha|as|às|servico|corte|barba)$/iu.test(word));
      const selectedName=nameWords.slice(0,stopAt<0?nameWords.length:stopAt).join(" ");
      if(selectedName)return selectedName;
    }
    let remaining=value;
    const chosenService=services.find(item=>item.id===selectedServiceId);
    for(const service of (chosenService?[chosenService,...services.filter(item=>item.id!==chosenService.id)]:services)){
      const escaped=service.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      remaining=remaining.replace(new RegExp(escaped,"giu")," ");
    }
    const contact=contactFrom(remaining);if(contact)remaining=remaining.replace(contact," ");
    remaining=remaining.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi," ")
      .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?\b/g," ")
      .replace(/\b\d{1,2}(?::[0-5]\d|h[0-5]\d)?\s*h?\b/gi," ")
      .replace(/\b(?:hoje|amanha|depois de amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|corte|masculino|barba|completa|cabelo|quero|agendar|marcar|reservar|horario|atendimento|para|pra|as|às|a|de|do|da|e|um|uma|meu|nome|me|chamo|sou|servico)\b/gi," ")
      .replace(/[,:;—–+/]/g," ");
    const words=remaining.trim().split(/\s+/).filter(Boolean);
    if(words.length<1||words.length>4||words.some(word=>!/^[\p{L}][\p{L}'-]*$/u.test(word)))return undefined;
    return words.join(" ");
  };
  const cleanContact=(value:string)=>value.trim();
  const interpret=async(value:string)=>request<IntentResult>("/jev/interpret",{message:value,mode,companySlug:company?.slug},"POST");
  const nextQuestion=(value:BookingDraft):BookingDraft["awaiting"]=>!value.serviceId?"service":!value.date?"date":!value.time?"time":!value.clientName?"name":!value.contact?"contact":undefined;
  const askFor=(field:BookingDraft["awaiting"])=>(
    field==="service"?`Qual serviço você quer? ${services.map(item=>item.name).join(", ")||"A empresa ainda não cadastrou serviços."}`:
    field==="date"?"Para qual dia? Pode dizer hoje, amanhã, um dia da semana ou uma data como 28/11.":
    field==="time"?"Que horas você prefere? Por exemplo, 14:30.":
    field==="name"?"Qual nome devo colocar na reserva?":
    field==="contact"?"Qual WhatsApp ou e-mail para contato?":""
  );

  const prepareBooking=async(value:BookingDraft)=>{
    const awaiting=nextQuestion(value);
    if(awaiting){const next={...value,awaiting};setDraft(next);say("jev",askFor(awaiting));return}
    const service=services.find(item=>item.id===value.serviceId);if(!service||!value.date||!value.time||!value.clientName||!value.contact){setDraft(null);say("jev","Não consegui entender todos os dados. Comece com “quero agendar” e me diga o serviço, dia, horário, nome e contato.");return}
    if(value.date<todayISO()){setDraft({...value,date:undefined,awaiting:"date"});say("jev","Essa data já passou. Qual outro dia você prefere?");return}
    const weekday=new Date(`${value.date}T12:00:00-03:00`).getDay(),hours=availability.find(item=>item.weekday===weekday);
    const startMinute=Number(value.time.slice(0,2))*60+Number(value.time.slice(3)),endMinute=startMinute+service.duration_minutes;
    if(!hours?.enabled||startMinute<Number(hours.start_time.slice(0,2))*60+Number(hours.start_time.slice(3,5))||endMinute>Number(hours.end_time.slice(0,2))*60+Number(hours.end_time.slice(3,5))){setDraft({...value,awaiting:"time"});say("jev","Esse horário fica fora do expediente. Escolha um horário dentro da disponibilidade mostrada na página.");return}
    try{
      let occupied:{starts_at:string;ends_at:string;status?:string}[]=[];
      if(mode==="company")occupied=(await request<Appointment[]>("/appointments")).filter(item=>item.status==="confirmed");
      else if(company?.slug)occupied=await request<{starts_at:string;ends_at:string}[]>(`/public/companies/${company.slug}/appointments?day=${value.date}`);
      const start=new Date(`${value.date}T${value.time}:00-03:00`),end=new Date(start.getTime()+service.duration_minutes*60000);
      const collision=occupied.find(item=>(!item.status||item.status==="confirmed")&&new Date(item.starts_at)<end&&new Date(item.ends_at)>start);
      if(collision){
        const formatTime=(instant:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(instant));
        setDraft({...value,awaiting:"time"});say("jev",`Esse horário conflita com uma reserva das ${formatTime(collision.starts_at)} às ${formatTime(collision.ends_at)}. Diga outro horário e eu verifico novamente.`);return
      }
      const summary=`${service.name} · ${dateLabel(value.date)} às ${value.time} · ${value.clientName} · ${value.contact}`;
      setProposal({kind:"booking",serviceId:service.id,date:value.date,time:value.time,clientName:value.clientName,contact:value.contact,summary,confidence:value.confidence??0.7});setDraft(null);
      say("jev",`Conferi serviço, data, duração e disponibilidade. Confirme para eu criar esta reserva: ${summary}.`);
    }catch(error){setDraft({...value,awaiting:"time"});say("jev",error instanceof Error?error.message:"Não consegui verificar a agenda agora.")}
  };

  const handleText=async(raw:string)=>{
    const value=raw.trim();if(!value||busy)return;
    say("user",value);setText("");setBusy(true);
    try{
      if(proposal){say("jev","Confirme ou descarte a ação sugerida nos botões acima antes de pedir outra alteração.");return}
      const normalized=normalize(value);
      let decision:IntentResult|undefined;
      if(!draft){
        decision=await interpret(value);
        if(decision.intent.choice==="other"||decision.intent.confidence<0.45){say("jev",mode==="company"?"Não entendi com segurança. Posso ajustar expediente, criar uma reserva ou cancelar uma reserva; tente explicar com outras palavras.":"Não entendi se você quer fazer uma reserva. Diga o serviço, dia e horário que prefere.");return}
        if(mode==="client"&&decision.intent.choice!=="book_appointment"){say("jev","Por aqui posso ajudar a reservar um horário. Diga o serviço, dia e horário que prefere.");return}
      }
      if(mode==="company"&&!draft){
        if(decision?.intent.choice==="manage_hours"){
          const weekday=weekdayFrom(value);
          if(weekday<0){say("jev","Entendi que quer mudar o expediente. Qual dia da semana devo alterar?");return}
          const action=decision.scheduleAction?.choice;
          if(action!=="open"&&action!=="close"){say("jev",`Entendi o dia ${DAY_NAMES[weekday]}, mas preciso saber se devo abrir ou fechar esse dia.`);return}
          const enabled=action==="open";const existing=availability.find(item=>item.weekday===weekday);
          const range=normalized.match(/(?:das?|de)\s*(\d{1,2})(?::([0-5]\d))?\s*(?:h)?\s*(?:as?|ate|-)\s*(\d{1,2})(?::([0-5]\d))?\s*(?:h)?/);
          const start=range?`${range[1].padStart(2,"0")}:${range[2]||"00"}`:existing?.start_time.slice(0,5)||"09:00";
          const end=range?`${range[3].padStart(2,"0")}:${range[4]||"00"}`:existing?.end_time.slice(0,5)||"18:00";
          if(enabled&&!range&&!existing?.enabled){say("jev",`Qual faixa de horário devo abrir toda ${DAY_NAMES[weekday]}? Exemplo: “abrir ${DAY_NAMES[weekday]} das 09:00 às 13:00”.`);return}
          const summary=enabled?`Abrir toda ${DAY_NAMES[weekday]} das ${start} às ${end} (toda semana)`:`Fechar toda ${DAY_NAMES[weekday]} (toda semana). Reservas existentes continuam na agenda.`;
          setProposal({kind:"availability",weekday,enabled,start_time:start,end_time:end,summary,confidence:Math.min(decision.intent.confidence,decision.scheduleAction?.confidence??0)});say("jev",`O Jev entendeu isso como uma mudança semanal (${Math.round(decision.intent.confidence*100)}% de confiança). Confirme para aplicar: ${summary}.`);return;
        }
        if(decision?.intent.choice==="cancel_booking"){
          const active=appointments.filter(item=>item.status==="confirmed");const timeValue=parseTime(value),dateValue=parseDate(value),id=Number(value.match(/#(\d+)/)?.[1]);
          let candidates=active.filter(item=>!id||item.id===id);
          if(timeValue)candidates=candidates.filter(item=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(item.starts_at))===timeValue);
          if(dateValue)candidates=candidates.filter(item=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(item.starts_at))===dateValue);
          const nameHint=normalized.replace(/\b(cancelar|cancele|desmarcar|desmarque|remover|reserva|agendamento|horario|de|do|da|para|o|a)\b/g," ").replace(/#\d+|\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?|\b\d{1,2}:\d{2}\b/g," ").trim();
          if(nameHint.length>2)candidates=candidates.filter(item=>normalize(item.client_name).includes(nameHint)||normalize(item.service_name).includes(nameHint));
          if(candidates.length===1){const item=candidates[0];const when=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(new Date(item.starts_at));setProposal({kind:"cancel",appointmentId:item.id,summary:`${item.client_name} · ${item.service_name} · ${when}`,confidence:decision.intent.confidence});say("jev",`O Jev classificou como cancelamento (${Math.round(decision.intent.confidence*100)}% de confiança). Encontrei: ${item.client_name}, ${item.service_name}, ${when}. Confirme para cancelar.`);return}
          say("jev",candidates.length?"Encontrei mais de uma reserva. Informe o nome do cliente, horário ou número da reserva.":"Não encontrei uma reserva confirmada com esses dados. Diga “cancelar reserva de [nome]” ou informe o horário.");return;
        }
      }
      const bookingIntent=draft!==null||decision?.intent.choice==="book_appointment";
      if(!bookingIntent){say("jev",mode==="company"?"Posso abrir ou fechar o expediente semanal, criar uma reserva ou cancelar uma reserva. Diga, por exemplo, “abrir sábado das 09 às 13” ou “cancelar reserva de Ana”.":"Diga o serviço, dia e horário que prefere. Depois peço seu nome e contato e mostro a reserva para confirmar.");return}
      let next:BookingDraft=draft?{...draft,confidence:draft.confidence??decision?.intent.confidence}:{confidence:decision?.intent.confidence};
      const knownService=serviceFrom(value);if(knownService)next.serviceId=knownService.id;
      if(!next.serviceId&&decision?.service?.id&&decision.service.confidence>=0.6)next.serviceId=decision.service.id;
      const candidateDate=parseDate(value),candidateTime=parseTime(value,draft?.awaiting==="time");
      if(draft?.awaiting==="date"&&candidateDate)next.date=candidateDate;else next.date=next.date||(decision?.datePresent?candidateDate:undefined);
      if(draft?.awaiting==="time"&&candidateTime)next.time=candidateTime;else next.time=next.time||(decision?.timePresent?candidateTime:undefined);
      const contact=contactFrom(value);if(contact&&!next.contact)next.contact=cleanContact(contact);
      const initialName=nameFrom(value,next.serviceId);if(initialName&&!next.clientName)next.clientName=initialName;
      if(draft?.awaiting==="name"&&!next.clientName)next.clientName=contact?value.replace(contact,"").trim():value.trim();
      if(draft?.awaiting==="contact"&&!next.contact)next.contact=contact?cleanContact(contact):value.trim();
      await prepareBooking(next);
    }finally{setBusy(false)}
  };

  const execute=async()=>{
    if(!proposal)return;setBusy(true);
    try{
      if(proposal.kind==="availability"){
        await request(`/availability/${proposal.weekday}`,{enabled:proposal.enabled,start_time:proposal.start_time,end_time:proposal.end_time},"PATCH");
        await onRefresh();say("jev","Pronto! Atualizei o expediente da empresa. Os novos horários já podem ser reservados.");
      }else if(proposal.kind==="cancel"){
        const token=localStorage.getItem("agendapro_session");const response=await fetch(`/api/appointments/${proposal.appointmentId}`,{method:"PATCH",headers:{"Content-Type":"application/json",...(token?{"x-session":token}:{})},body:JSON.stringify({status:"canceled"})});
        if(!response.ok)throw new Error((await response.json()).error||"Não consegui cancelar essa reserva.");await onRefresh();say("jev","Reserva cancelada. O horário foi liberado.");
      }else{
        await request("/appointments",{client_name:proposal.clientName,client_contact:proposal.contact,service_id:proposal.serviceId,starts_at:`${proposal.date}T${proposal.time}:00-03:00`});
        if(mode==="company")await onRefresh();else await onBooked?.(proposal.date);say("jev","Reserva confirmada! A empresa já pode ver o horário na agenda.");
      }
      setProposal(null);setDraft(null);
    }catch(error){say("jev",error instanceof Error?error.message:"A ação não foi concluída. Confira os dados e tente novamente.")}finally{setBusy(false)}
  };

  const cancelProposal=()=>{setProposal(null);setDraft(null);say("jev","Certo, descartei a ação. Nada foi alterado.")};
  return <div className={`jev-assistant ${open?"is-open":""}`}>
    {open&&<section className="jev-panel" aria-label="Assistente Jev">
      <header className="jev-head"><span><b><Zap size={17}/></b><span><strong>Jev</strong><small>{mode==="company"?"Assistente da empresa":"Assistente de agendamento"}</small></span></span><button aria-label="Fechar Jev" onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <div className="jev-messages" aria-live="polite">{messages.map((item,index)=><div key={index} className={`jev-message ${item.role}`}>{item.role==="jev"&&<Sparkles size={14}/>}<p>{item.text}</p></div>)}
        {proposal&&<div className="jev-proposal"><strong>Prévia da ação · confiança estimada {Math.round(proposal.confidence*100)}%</strong><p>{proposal.summary}</p><div><button className="jev-confirm" disabled={busy} onClick={execute}><Check size={15}/> Confirmar</button><button className="jev-cancel" disabled={busy} onClick={cancelProposal}>Descartar</button></div></div>}
        {busy&&<div className="jev-thinking"><LoaderCircle size={15}/> Conferindo a agenda…</div>}<div ref={endRef}/>
      </div>
      <form className="jev-compose" onSubmit={event=>{event.preventDefault();void handleText(text)}}><input value={text} onChange={event=>setText(event.target.value)} placeholder={mode==="company"?"Ex.: abrir sábado das 9 às 13":"Ex.: quero corte amanhã às 14h"} aria-label="Mensagem para Jev"/><button type="submit" aria-label="Enviar mensagem" disabled={busy||!text.trim()}><Send size={17}/></button></form>
      <small className="jev-note">Classificação do Jev; dados pessoais ficam fora da análise. Você confirma antes de alterar a agenda.</small>
    </section>}
    <button className="jev-toggle" onClick={()=>setOpen(value=>!value)} aria-expanded={open}><span><Zap size={17}/></span>{open?"Fechar Jev":"Falar com Jev"}{open?<ChevronDown size={15}/>:<Sparkles size={15}/>}</button>
  </div>;
}
