# Raspberry Pi 4: встановлення і діагностика

Ціль: Raspberry Pi 4 Model B, Raspberry Pi OS 64-bit Bookworm/Trixie, користувач `admin`, адреса `192.168.2.193`, TV на HDMI0 (порт біля USB-C).

## Локальна інсталяція на Pi

Розпакуйте пакет у домашню або тимчасову папку, увійдіть через SSH як `admin` (не root), далі:

```bash
chmod +x scripts/*.sh
./scripts/install.sh
sudo reboot
```

Installer встановлює Python/openpyxl/qrcode, Chromium, Cage, PipeWire, шрифти; копіює файли до `/opt/lyceumtv`; зберігає живі налаштування й медіа. Увімкнені systemd-сервіси backend, kiosk і таймери watchdog/backup/mirror. Mirror за замовчуванням вимкнений у конфігурації. Початкові role-ключі генеруються випадково.

**Зміни завантаження:** desktop/login manager вимикається, встановлюється `multi-user.target`, tty1 віддається Cage. Desktop Autologin не потрібен. Installer додає `consoleblank=0`, `vt.global_cursor_default=0` та `video=HDMI-A-1:1920x1080@60` у `/boot/firmware/cmdline.txt` (або старий `/boot/cmdline.txt`). Перший display-backup зберігається після додавання параметрів consoleblank/cursor.

## Після перезавантаження

```bash
curl --fail --max-time 5 http://127.0.0.1:8080/api/health
systemctl is-active lyceumtv lyceumtv-kiosk lyceumtv-watchdog.timer
journalctl -u lyceumtv-kiosk -b -n 60 --no-pager
wpctl status
```

На TV перевірте розклад, назву та фото слайд-шоу, хвилину мовчання й звук. Для зміни аудіовиходу використайте `wpctl status`, потім `wpctl set-default ID` від користувача `admin`. Перевірте гучність телевізора. SSH-відповідь API не підтверджує наявність картинки або звуку.

Чорний екран: перевірте HDMI0, живлення 5.1V/3A, кабель і KMS. Перегляньте `/sys/class/drm/*HDMI*/status`, журнали кіоску та `vcgencmd get_throttled`. Для TV, що не підтримує 1080p60, змініть kernel video mode вручну і перезавантажте; повторний install повертає профіль 1080p60. Другий HDMI цей пакет не налаштовує.

## Повернення desktop

```bash
sudo /opt/lyceumtv/scripts/rollback-headless-kiosk.sh
sudo reboot
```

На OS Lite без установленого desktop повернеться текстова консоль. Скрипт не відновлює HDMI-режим: для цього скопіюйте `cmdline.txt.lyceumtv-rpi4.bak` поверх відповідного `cmdline.txt` і перезавантажте. Ніколи не видаляйте параметр `root=...` і не розбивайте kernel cmdline на кілька рядків.

## Додаткові мережеві функції

Для повітряних тривог потрібен власний токен alerts.in.ua в конфігурації; без нього автоматичні тривоги не працюють. Telegram, OTA, cloud mirror та синхронізація потребують налаштованих сервісів і доступу до них. Це не перевірено лише запуском локального backend.
