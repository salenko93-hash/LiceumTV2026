# Адмінка LyceumTV 3.0

Адреса: `http://IP_PI:8080/admin`

Початковий ключ: `lyceumtv-admin`.

Адмінка зберігає:
- alerts.in.ua UID/endpoint/token;
- TRIVOGA enable/volume;
- дату старту чисельника;
- GitHub/NAS Manifest URL;
- Google Apps Script URL;
- інтервал синхронізації;
- погоду, координати та інтервал оновлення;
- оголошення на перервах;
- хвилину мовчання: enable/time/volume;
- screen profile;
- тривалість екрану відбою;
- admin key.

Token alerts.in.ua та admin key не повертаються через публічний `/api/state`.
`data/config.json` створюється локально та виключений з Git.
