# 🎱 Hdasebingo — Telegram Bot + Mini App

A fully functional Bingo game for Telegram with a beautiful Mini App interface.

## 🏗️ Stack

| Layer | Tech |
|-------|------|
| Bot | Grammy.js (TypeScript) |
| API | Express.js (TypeScript) |
| Mini App | React + Vite + Tailwind |
| Database | Supabase (PostgreSQL + Realtime) |
| Deploy | PM2 + Nginx on Contabo VPS |

## 📁 Structure

```
hdasebingo/
├── bot/          # Telegram Bot (Grammy.js)
├── api/          # REST API (Express)
├── miniapp/      # React Mini App
├── supabase/     # DB migrations
└── ecosystem.config.js  # PM2 config
```

## 🚀 Setup

### 1. Supabase Setup
1. Go to [supabase.com](https://supabase.com) and create a project
2. Go to SQL Editor, paste and run `supabase/migrations/001_initial.sql`
3. In Supabase Dashboard → Realtime → enable for `called_numbers`, `rooms`, `room_players` tables
4. Copy your **Project URL** and **anon key**

### 2. Telegram Bot Setup
1. Message [@BotFather](https://t.me/BotFather)
2. `/newbot` → get your **BOT_TOKEN**
3. `/setmenubutton` → set your Mini App URL
4. `/setcommands` → set:
```
start - Welcome message
newgame - Create a bingo room
join - Join a room (usage: /join CODE)
startgame - Start the game (host only)
help - Help and rules
```

### 3. Install & Build Bot
```bash
cd bot
cp .env.example .env
# Edit .env with your values
npm install
npm run build
```

### 4. Install & Build API
```bash
cd api
cp .env.example .env
# Edit .env with your values
npm install
npm run build
```

### 5. Install & Build Mini App
```bash
cd miniapp
cp .env.example .env
# Edit .env with your values
npm install
npm run build
```

### 6. Deploy on Contabo VPS

#### Install dependencies on VPS:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2
sudo apt-get install -y nginx
```

#### Upload project to VPS:
```bash
rsync -avz ./ user@your-vps-ip:/var/www/hdasebingo/
```

#### Start with PM2:
```bash
cd /var/www/hdasebingo
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Nginx config (`/etc/nginx/sites-available/hdasebingo`):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Mini App
    location /miniapp/ {
        alias /var/www/hdasebingo/miniapp/dist/;
        try_files $uri $uri/ /miniapp/index.html;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Bot webhook (optional)
    location /bot/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

#### Enable HTTPS (required for Mini App):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 🎮 How to Play

1. Start bot: `/start`
2. Create room: `/newgame` → share the 6-letter code
3. Friends join: `/join ABC123`
4. Host starts: `/startgame`
5. Host presses **🎲 Call Next Number**
6. Players mark numbers on their card in the Mini App
7. Complete a row/column/diagonal → press **🏆 BINGO!**
