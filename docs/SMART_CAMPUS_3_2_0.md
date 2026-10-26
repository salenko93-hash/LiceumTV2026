# LyceumTV 3.2.4 — Smart Campus

## Що додає 3.2.4

### XLSX Import Center

Control Center приймає `.xlsx` через браузер. Імпорт має дві фази:

1. **Preview / validation** — файл тимчасово зберігається в `data/imports/staging/`, парситься і перевіряється.
2. **Apply** — тільки після підтвердження адміністратора створюється `pre-xlsx-import` backup і JSON замінюється в `data/default/` та `data/current/`.

Після Apply ціль автоматично локально закріплюється й не перезаписується наступним GitHub sync.

Доступні цілі:

- `schedule_numerator`
- `schedule_denominator`
- `shelter_numerator`
- `shelter_denominator`

Парсер очікує структуру, сумісну з робочими таблицями 10–11 класів: клас у колонці A, час у B, шість блоків днів із номером уроку / предметом / кабінетом / викладачем. Заголовки днів визначаються автоматично.

### Mobile Schedule / PWA

URL:

```text
http://<RPI-IP>:8080/mobile/
```

Мобільна сторінка:

- вибір класу 10-А … 11-Г;
- сьогодні / завтра;
- чисельник / знаменник;
- локальні заміни;
- дзвінки;
- оголошення;
- PWA service worker.

API:

```text
GET /api/mobile/schedule?class=10-А&date=2026-10-09
```

### QR

QR-код генерується локально на Raspberry Pi:

```text
GET /api/qr.svg?text=http://192.168.2.193:8080/mobile/
```

Зовнішній QR-сервіс не використовується.

### Multi-TV Manager

TV-клієнт реєструється heartbeat-запитом. ID екрана передається у URL:

```text
http://192.168.2.193:8080/?screen=hall-main
```

Основний kiosk за замовчуванням запускається як:

```text
main-hall
```

Control Center показує:

- ONLINE / OFFLINE;
- IP;
- версію клієнта;
- profile;
- час останнього heartbeat.

Команди `reload`, `restart`, `wake` ставляться в чергу і виконуються клієнтом після наступного heartbeat. У браузерному TV-клієнті `restart` означає повне перезавантаження сторінки; перезапуск самого Raspberry Pi не виконується цією командою.

### Telegram Monitoring

Налаштовується тільки через Control Center:

- Bot token;
- Chat ID;
- увімкнення/вимкнення;
- команди;
- поріг температури;
- screen offline timeout.

Підтримані команди:

```text
/status
/screens
/sync
/restart
```

Команди приймаються тільки від заданого Chat ID. Bot token не повертається через dashboard API після збереження.

Автоматичні повідомлення:

- екран перейшов ONLINE/OFFLINE;
- температура Raspberry Pi перевищила поріг;
- помилка sync;
- OTA / restart з Control Center.

## Залежності

`install.sh` встановлює:

```text
python3-openpyxl
python3-qrcode
```

Вони потрібні відповідно для XLSX Import Center та локального SVG QR.

## Дані, що зберігаються при оновленні

```text
data/config.json
data/runtime.json
data/control.json
data/calendar_override.json
data/bells_override.json
data/screens.json
data/imports/
data/current/
data/previous/
data/backups/
data/logs/
```

## Сумісність

3.2.4 зберігає:

- Adaptive TV 1920×1080;
- 1/2-рядкові назви предметів;
- однорядкові ПІБ викладачів;
- знаменник із останнього XLSX;
- чисельник від 01.09.2026;
- UID 81 alerts.in.ua;
- тривогу / укриття / хвилину мовчання;
- погоду;
- заміни, оголошення, календар і дзвінки;
- backup/restore;
- OTA;
- Cage + Chromium kiosk;
- watchdog.
