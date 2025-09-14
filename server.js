import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DATA_PATH = path.join(__dirname, 'data', 'db.json');
function loadDB(){
  if(!fs.existsSync(DATA_PATH)){
    const seed = {
      meta: { version: "1.0.0", last_update: new Date().toISOString() },
      users: [
        { id: "u1", username: "superadmin", role: "Super Admin" },
        { id: "u2", username: "chefA", role: "ChefAgence" },
        { id: "u3", username: "caisse1", role: "Caissier" },
        { id: "u4", username: "terrain1", role: "AgentTerrain" }
      ],
      settings: {
        sms: { provider: "Twilio", sender: "COFIN", apiKey: "", template: "[COFIN] Code: {{code}} pour {{purpose}}" },
        otp: { length: 6, ttl: 180, enable_open: true, enable_cash: true, enable_field: true, cc: "+242" }
      },
      accounts: { pending: [], active: [] },
      operations: [],
      journal: [],
      otps: {},
      audit: []
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}
function saveDB(db){ fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2)); }
function logAudit(db, user, action, details){ db.audit.unshift({ at: new Date().toISOString(), user, action, details }); }

function normalizePhone(cc, input){
  let p = (input||'').trim();
  if(p.startsWith(cc)) return p;
  if(p.startsWith('+')) return p; // assume already intl elsewhere
  if(p.startsWith('0')) p = p.slice(1);
  return cc + p;
}

// Auth (mock)
app.post('/api/auth/login', (req,res)=>{
  const { username } = req.body;
  const db = loadDB();
  const user = db.users.find(u=>u.username===username);
  if(!user) return res.status(401).json({error:"Utilisateur inconnu"});
  res.json({ token: "mock-"+nanoid(8), user });
});

// Settings
app.get('/api/settings', (req,res)=>{ const db=loadDB(); res.json(db.settings); });
app.put('/api/settings/otp', (req,res)=>{
  const db=loadDB(); db.settings.otp = { ...db.settings.otp, ...req.body }; saveDB(db);
  res.json(db.settings.otp);
});
app.put('/api/settings/sms', (req,res)=>{
  const db=loadDB(); db.settings.sms = { ...db.settings.sms, ...req.body }; saveDB(db);
  res.json(db.settings.sms);
});

// OTP
app.post('/api/otp/send', (req,res)=>{
  const db=loadDB();
  const { phone, purpose } = req.body;
  const cfg = db.settings.otp;
  if(!cfg['enable_'+purpose]) return res.status(400).json({error:"OTP désactivé pour "+purpose});
  const len = cfg.length || 6;
  const code = Array.from({length:len}).map(()=>Math.floor(Math.random()*10)).join('');
  const cc = db.settings.otp.cc || "+242";
  const norm = normalizePhone(cc, phone);
  const txnId = nanoid(12);
  db.otps[txnId] = { code, phone: norm, purpose, expireAt: Date.now() + (cfg.ttl||180)*1000, verified:false };
  logAudit(db, "system", "otp_send", { txnId, phone: norm, purpose });
  saveDB(db);
  // In real-world, call SMS provider here.
  res.json({ ok:true, txnId, phone: norm, codeDemo: code }); // expose code for demo
});

app.post('/api/otp/verify', (req,res)=>{
  const db=loadDB();
  const { txnId, code } = req.body;
  const rec = db.otps[txnId];
  if(!rec) return res.status(404).json({error:"OTP introuvable"});
  if(Date.now()>rec.expireAt) return res.status(400).json({error:"OTP expiré"});
  if(rec.code!==code) return res.status(400).json({error:"Code incorrect"});
  rec.verified = true;
  logAudit(db, "system", "otp_verify", { txnId });
  saveDB(db);
  res.json({ ok:true });
});

// Accounts: create pending
app.post('/api/accounts', (req,res)=>{
  const db=loadDB();
  const { nom, tel, type, createdBy } = req.body;
  if(!nom || !tel || !type) return res.status(400).json({error:"Champs requis"});
  const cc = db.settings.otp.cc || "+242";
  const acc = { id: nanoid(10), nom, tel: normalizePhone(cc, tel), type, status: "PENDING", createdBy, createdAt: new Date().toISOString() };
  db.accounts.pending.push(acc);
  logAudit(db, createdBy||"unknown", "account_open_created", { acc });
  saveDB(db);
  res.json(acc);
});

app.get('/api/accounts', (req,res)=>{
  const db=loadDB();
  const { status } = req.query;
  if(status==="ACTIVE") return res.json(db.accounts.active);
  if(status==="PENDING") return res.json(db.accounts.pending);
  res.json({ pending: db.accounts.pending, active: db.accounts.active });
});

// Accounts: approve (chef d'agence) -> send otp then verify externally
app.post('/api/accounts/:id/approve', (req,res)=>{
  const db=loadDB();
  const { id } = req.params;
  const { approvedBy } = req.body;
  const acc = db.accounts.pending.find(a=>a.id===id);
  if(!acc) return res.status(404).json({error:"Demande introuvable"});
  // mark temp approved awaiting OTP verify
  acc.status = "AWAITING_OTP";
  logAudit(db, approvedBy||"chef", "account_approved_waiting_otp", { accId:id });
  saveDB(db);
  res.json({ ok:true, acc });
});

app.post('/api/accounts/:id/confirm', (req,res)=>{
  const db=loadDB();
  const { id } = req.params;
  const { otpTxnId, code, confirmedBy } = req.body;
  const otp = db.otps[otpTxnId];
  if(!otp || otp.code !== code || !otp.verified) return res.status(400).json({error:"OTP non vérifié"});
  const idx = db.accounts.pending.findIndex(a=>a.id===id);
  if(idx===-1) return res.status(404).json({error:"Demande introuvable"});
  const acc = db.accounts.pending[idx];
  acc.status = "ACTIVE";
  db.accounts.active.push(acc);
  db.accounts.pending.splice(idx,1);
  logAudit(db, confirmedBy||"chef", "account_open_confirmed", { accId:id });
  saveDB(db);
  res.json({ ok:true, acc });
});

app.post('/api/accounts/:id/reject', (req,res)=>{
  const db=loadDB();
  const { id } = req.params;
  const { rejectedBy, reason } = req.body;
  const idx = db.accounts.pending.findIndex(a=>a.id===id);
  if(idx===-1) return res.status(404).json({error:"Demande introuvable"});
  const acc = db.accounts.pending[idx];
  db.accounts.pending.splice(idx,1);
  logAudit(db, rejectedBy||"chef", "account_open_rejected", { accId:id, reason });
  saveDB(db);
  res.json({ ok:true });
});

// Operations (caisse/terrain)
app.post('/api/operations', (req,res)=>{
  const db=loadDB();
  const { agence, type, produit, montant, acteur, client } = req.body;
  if(!agence || !type || !produit || !montant || !acteur || !client) return res.status(400).json({error:"Champs requis"});
  const cc = db.settings.otp.cc || "+242";
  const normCli = normalizePhone(cc, client);
  const op = { id: nanoid(10), agence, date: new Date().toISOString().slice(0,10), type, produit, montant, acteur, client: normCli };
  db.operations.push(op);
  // accounting
  const map = {
    "Dépôt caisse": [
      {compte:"Caisse",debit:montant,credit:0,libelle:type},
      {compte:"Epargne",debit:0,credit:montant,libelle:type}
    ],
    "Retrait caisse": [
      {compte:"Epargne",debit:montant,credit:0,libelle:type},
      {compte:"Caisse",debit:0,credit:montant,libelle:type}
    ],
    "Recouvrement crédit": [
      {compte:"Caisse",debit:montant,credit:0,libelle:type},
      {compte:"Crédit",debit:0,credit:montant,libelle:type}
    ],
    "Contribution tontine": [
      {compte:"Caisse",debit:montant,credit:0,libelle:type},
      {compte:"Tontine",debit:0,credit:montant,libelle:type}
    ]
  };
  const entries = (map[type]||[]).map(e => ({ date: op.date, agence, ...e }));
  db.journal.push(...entries);
  logAudit(db, acteur, "operation_recorded", { op, entries });
  saveDB(db);
  res.json(op);
});

app.get('/api/operations', (req,res)=>{
  const db=loadDB(); res.json(db.operations);
});

// Accounting
app.get('/api/accounting/journal', (req,res)=>{
  const db=loadDB(); res.json(db.journal);
});
app.get('/api/accounting/balance', (req,res)=>{
  const db=loadDB();
  const tot = {};
  db.journal.forEach(j=>{
    tot[j.compte] = tot[j.compte] || { debit:0, credit:0 };
    tot[j.compte].debit += j.debit||0; tot[j.compte].credit += j.credit||0;
  });
  const rows = Object.entries(tot).map(([compte,v])=>({compte, ...v, solde: v.debit - v.credit }));
  res.json(rows);
});

// Audit
app.get('/api/audit', (req,res)=>{ const db=loadDB(); res.json(db.audit); });

// Static frontend
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log("COFIN-CO-M Total backend listening on "+PORT));
