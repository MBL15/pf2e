# Глубины

Веб-приложение для настольных сессий **Pathfinder 2e**: генератор подземелий, карта с туманом войны, жетоны героев и врагов, профили персонажей, партии с кодом приглашения. Данные сессии хранятся в SQLite на сервере.

## Быстрый старт (локально)

**Требования:** Python 3.10+

```bash
git clone https://github.com/MBL15/pf2e.git
cd pf2e
python -m server.main
```

Откройте [http://127.0.0.1:8765](http://127.0.0.1:8765)

> Не открывайте `index.html` через `file://` — без сервера API и база не работают.

При первом запуске создаётся `data/glubiny.sqlite`.  


## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `HOST` | `127.0.0.1` | Адрес привязки. Для LAN/интернета: `0.0.0.0` |
| `PORT` | `8765` | Порт HTTP |
| `HTTPS` | — | `1` — cookie сессии с флагом `Secure` (нужен TLS) |
| `TRUST_PROXY` | — | `1` — IP клиента из `X-Forwarded-For` / `X-Real-IP` (за nginx/Caddy) |

Пример для разработки в LAN:

```bash
HOST=0.0.0.0 PORT=8765 python -m server.main
```

Windows (PowerShell):

```powershell
$env:HOST="0.0.0.0"; python -m server.main
```

Скопируйте `.env.example` → `.env` и отредактируйте при необходимости.

## Docker

```bash
docker compose up -d --build
```

Приложение: [http://localhost:8765](http://localhost:8765)  
База SQLite в volume `glubiny-data` (данные сохраняются между перезапусками).

С HTTPS за reverse proxy:

```bash
HTTPS=1 TRUST_PROXY=1 docker compose up -d --build
```

## Продакшен (VPS)

Рекомендуемая схема: **TLS на reverse proxy**, приложение слушает localhost или Docker.

1. Клонируйте репозиторий на сервер (`/opt/pf2e`).
2. Запустите через Docker **или** systemd (пример: `deploy/glubiny.service`).
3. Поставьте **Caddy** или **nginx** перед приложением.

### Caddy (пример)

Отредактируйте домен в `deploy/Caddyfile`, затем:

```bash
docker compose up -d --build
# Caddy на хосте проксирует на 127.0.0.1:8765
caddy run --config deploy/Caddyfile
```

В `docker-compose.yml` или systemd задайте `HTTPS=1` и `TRUST_PROXY=1`.

### nginx (фрагмент)

```nginx
server {
    listen 443 ssl;
    server_name glubiny.example.com;

    location / {
        proxy_pass http://127.0.0.1:8765;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Файрвол

Откройте только **443** (HTTPS) наружу. Порт **8765** держите на localhost или внутренней сети Docker.

## Релиз на GitHub

```bash
git tag v1.1.0
git push origin v1.1.0
```

На [GitHub → Releases](https://github.com/MBL15/pf2e/releases) создайте release от тега с инструкцией по запуску.

## npm-скрипты

```bash
npm start          # python -m server.main
```
