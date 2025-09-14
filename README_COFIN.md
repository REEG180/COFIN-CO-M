# COFIN-CO-M — Plateforme de Microfinance

Bienvenue sur la plateforme **COFIN-CO-M**.  
Ce projet contient le **frontend** (interface utilisateur) et le **backend** (API + logique métier).  

---

## 📂 Contenu du projet
- **backend/** : Serveur Node.js (Express), avec API REST
  - OTP (vérification par SMS)
  - Ouverture de comptes (validation chef d’agence + confirmation OTP)
  - Caisse / Agent terrain (dépôt, retrait, recouvrement)
  - Comptabilité (journal, balance)
  - Audit (traçabilité des actions)
  - Fichier de données local : `backend/data/db.json`

- **frontend/** : Interface web en HTML/CSS/JS
  - Connexion (utilisateurs : superadmin, chefA, caisse1, terrain1)
  - Tableau de bord caisse (OTP)
  - Encaissement agent terrain (OTP)
  - Ouverture de comptes (avec OTP et validation hiérarchie)
  - Comptabilité (journal et balance)
  - Audit (actions des utilisateurs)
  - Paramètres OTP/SMS

---

## 🚀 Déploiement sur Render (hébergement gratuit)
1. Mets ce projet sur **GitHub** (voir tutoriel PDF).
2. Sur **Render**, clique **Nouveau + → Web Service**
3. Connecte ton dépôt GitHub `cofin-com`
4. Configure :
   - **Environnement** : Node
   - **Dossier racine (Root Directory)** : `backend`
   - **Commande de build** : `npm install`
   - **Commande de démarrage (Start Command)** : `npm start`
5. Clique **Deploy**

Après quelques minutes, tu auras ton lien web :  
👉 `https://cofin-com.onrender.com`

---

## 👤 Comptes de test
- **superadmin** → Super Admin  
- **chefA** → Chef d’agence  
- **caisse1** → Caissier  
- **terrain1** → Agent terrain  

---

## ⚠️ Notes importantes
- Les SMS OTP sont **simulés** : l’API renvoie `codeDemo` que tu peux saisir pour tester.  
- Tous les numéros de téléphone sont normalisés en **+242** (République du Congo).  
- Le backend et le frontend sont déjà connectés automatiquement.  

---

✅ Tu peux maintenant gérer ta microfinance avec **COFIN-CO-M** !  
