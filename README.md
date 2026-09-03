# WhatsApp Backup — frontend

Visor web Angular de solo lectura para el servicio local WhatsApp Backup. Es un proyecto completamente independiente: no importa Python, no accede a PostgreSQL ni lee archivos o secretos del backend. Toda integración ocurre por REST y Server-Sent Events.

## Requisitos y ejecución

- Node.js 22 o superior
- Backend Flask ejecutándose por separado en `http://127.0.0.1:5000`

```powershell
npm install
npm start
```

Abre `http://localhost:4200`. También puedes usar `npx ng serve` o, si Angular CLI está instalado globalmente, `ng serve`.

## Configuración

La URL se define una sola vez en `src/environments/environment.ts`:

```ts
apiBaseUrl: 'http://127.0.0.1:5000/api/v1'
```

El frontend consume el contrato `/health`, `/session`, `/session/pair`, `/session/qr`, `/session/qr/image`, `/sync/status`, `/chats`, `/chats/:id`, `/chats/:id/messages`, `/media/:id`, sus rutas `file`/`thumbnail`, y `/events/stream`. La paginación histórica usa `limit`, `before_timestamp` y `before_id`; no usa offset.

El backend debe permitir CORS desde `http://localhost:4200`. Un fallo de CORS o un backend detenido se presenta como estado offline; este repositorio no modifica la configuración Flask.

## Arquitectura

- `core/api`: cliente HTTP y URL centralizada.
- `core/models`: interfaces de sesión, chats, mensajes, multimedia y sincronización.
- `core/services`: adaptadores REST sin estado local autoritativo.
- `core/events`: conexión EventSource y eventos tipados.
- `core/guards`: verificación remota antes de entrar al dashboard.
- `features/pairing`: flujo de QR y reconexión.
- `features/dashboard`: sidebar virtualizada, conversación, mensajes y visor multimedia.
- `shared`: avatar determinístico, utilidades seguras y pipes.

La lista de chats usa Angular CDK Virtual Scroll. Cada conversación solicita 200 mensajes, agrega páginas anteriores mediante cursor keyset y restaura el scroll después del prepend. Los eventos SSE actualizan mensajes, multimedia y previews sin recargar toda la aplicación.

El guard permite el dashboard en modo backend `--local` cuando `/health` confirma base de datos disponible y WhatsApp deshabilitado. En modo normal, exige `connected` o `viewer_allowed` desde `/session`. Abrir `/dashboard/:chatId` restaura directamente la conversación indicada.

## Seguridad

La UI no usa `innerHTML`, no ejecuta contenido recibido y limita enlaces construidos por el frontend a HTTP/HTTPS. No guarda estados de vinculación, credenciales ni claves en `localStorage`. El backend siempre es la fuente de verdad.

## Verificación

```powershell
npm run build
npm test -- --watch=false
```

La validación con chats y multimedia reales requiere que el backend esté activo y vinculado. No hay mocks en el runtime; los datos de producción provienen exclusivamente de la API Flask.
