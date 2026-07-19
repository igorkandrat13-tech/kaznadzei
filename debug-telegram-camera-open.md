# Debug Session: telegram-camera-open

- Status: OPEN
- User symptom: в Telegram Web App сотрудника кнопка `Сделать фото` все еще открывает галерею вместо камеры; дополнительно нужно заменить комментарий под фото на редактирование названия фото.
- Scope: `client/src/OrderDetail.js`, `client/src/App.css`, маршруты Telegram для заявок на расходники.

## Hypotheses

1. `input[type=file][capture]` запускается через сценарий, который Telegram WebView трактует как обычный picker, а не camera intent.
2. Текущий DOM/label/input-pattern корректно рендерится в браузере, но Telegram WebView игнорирует `capture` для скрытых или стилизованных инпутов.
3. На событие клика влияет CSS/структура кнопки, и фактический таргет оказывается не тем `input`, который должен открывать камеру.
4. Telegram WebView на конкретном устройстве не поддерживает `capture`, и нужен отдельный `getUserMedia()` camera-flow вместо нативного file input.
5. После предыдущих правок осталась несовместимость в state/UI модели фото-заявок, но она не является первопричиной именно открытия галереи вместо камеры.

## Evidence Plan

- Добавить минимальную инструментализацию на клиенте вокруг нажатия кнопок `Сделать фото`/`Добавить из галереи`, выбора файла и доступности `mediaDevices`.
- Добавить debug-логирование признаков среды Telegram Web App, `capture`-ветки и результатов выбора файла.
- После получения логов от пользователя определить, достаточно ли нативного `capture` или нужен отдельный camera-flow через `getUserMedia()`.

## Progress Log

- Session initialized.
- Added client-side runtime instrumentation around camera/gallery controls.
- User reported that verification requires deployment to the test VM before logs can be collected from Telegram Web App.
