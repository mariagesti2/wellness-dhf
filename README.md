# Wellness & RPE · Junior DHF

App para el control diario de **wellness** (5 preguntas, 0–5) y **RPE** (gym, entreno, partido · RPE 1–10 × minutos = carga) del equipo.

- **Jugadoras**: instalan la app en el móvil, reciben un aviso a las 8:00 para el wellness y otro al acabar cada sesión para el RPE. Ven su propia evolución.
- **Preparador/a físico/a**: ve el estado del equipo cada día (con alertas), la evolución de cada jugadora (índice wellness, las 5 preguntas, carga diaria y semanal, ACWR), descarga **un Excel por jugadora con gráficos** o un Excel de todo el equipo, y configura el horario de sesiones y partidos.

Todo es **gratis**: Firebase (plan Spark) guarda los datos y envía los avisos; GitHub aloja la app y lanza los avisos cada 10 minutos. No hace falta tarjeta de crédito ni usar la terminal.

> **Pruébala antes de montar nada:** abre `index.html` (o la vista previa) sin configurar Firebase y arrancará en *modo demo* con datos inventados.

---

## Montaje paso a paso (≈ 30–40 min, una sola vez)

### 1. Crear el proyecto de Firebase
1. Entra en <https://console.firebase.google.com> con una cuenta de Google del club → **Crear un proyecto** (p. ej. `wellness-dhf`). Puedes desactivar Google Analytics.
2. En la página del proyecto pulsa el icono **`</>` (Web)** → apodo `wellness` → **Registrar app** (no marques Hosting).
3. Te enseña un bloque `const firebaseConfig = { apiKey: ..., ... }`. **Copia esos 6 valores** dentro de `js/config.js`, en el apartado `firebase`.

### 2. Activar el inicio de sesión
**Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar → Guardar.**

### 3. Crear la base de datos
1. **Compilación → Firestore Database → Crear base de datos** → ubicación `eur3 (europe)` o `europe-southwest1 (Madrid)` → modo producción.
2. Pestaña **Reglas**: borra lo que hay, pega el contenido de `firestore.rules` y **Publicar**.
3. Pestaña **Datos** → **Iniciar colección** `config` → ID de documento `admins` → campo `emails`, tipo **array**, y añade los emails del cuerpo técnico **en minúsculas** (p. ej. `preparador@gmail.com`). Guardar.

### 4. Clave para notificaciones
1. ⚙️ **Configuración del proyecto → Cloud Messaging → Certificados push web → Generar par de claves**.
2. Copia la clave y pégala en `js/config.js` → `vapidKey`.

### 5. Clave secreta para el envío de avisos
⚙️ **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se descarga un archivo `.json`. **No lo subas a GitHub ni lo compartas**; lo usarás en el paso 7.

### 6. Publicar la app en GitHub Pages
1. Crea cuenta en <https://github.com> si no tienes. **New repository** → nombre `wellness-dhf` → **Public** → Create.
2. **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta (incluida la carpeta `.github`; si tu ordenador la oculta, en Mac pulsa `Cmd+Shift+.` en Finder). **Commit changes**.
3. **Settings → Pages → Branch: `main` / `(root)` → Save.** En 1–2 min la app estará en `https://TU-USUARIO.github.io/wellness-dhf/`.
4. En Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `TU-USUARIO.github.io`.

> El código es público, pero los **datos no**: están en Firebase y las reglas solo dejan que cada jugadora vea los suyos y el cuerpo técnico los de todas.

### 7. Activar los avisos automáticos
1. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret** → nombre `FIREBASE_SERVICE_ACCOUNT` → pega **todo el contenido** del `.json` del paso 5 → Add secret.
2. Pestaña **Actions** → si lo pide, *I understand… enable them*. Abre **Avisos wellness y RPE → Run workflow** para probarlo. En el registro verás cuántas jugadoras tienen los avisos activados.

A partir de ahí se ejecuta solo cada 10 minutos: avisa del wellness a la hora fijada y del RPE *x* minutos después de acabar cada sesión, **solo a quien todavía no lo ha rellenado**.

### 8. Configurar el horario (preparador/a)
Entra en la app con un email que esté en `config/admins` (crea la cuenta eligiendo *Soy del cuerpo técnico*) → pestaña **Horario**: sesiones fijas semanales (gym/entreno), partidos y sesiones puntuales, festivos, hora del wellness y retraso del aviso de RPE.

### 9. Pasar el enlace al equipo
Cada jugadora abre el enlace, **crea su cuenta** eligiendo su nombre de la lista y:
- **Android (Chrome):** menú ⋮ → *Instalar aplicación*. Luego, dentro de la app, *Activar notificaciones*.
- **iPhone (Safari, iOS 16.4 o superior):** botón Compartir → *Añadir a pantalla de inicio* → **abrir la app desde ese icono** → *Activar notificaciones*. (En iPhone los avisos solo funcionan con la app instalada así.)

En la pestaña Equipo el preparador ve una 🔔 junto a cada jugadora que tiene los avisos activados.

---

## Qué mide

| Dato | Cómo se calcula |
|---|---|
| **Índice wellness (%)** | (sueño + humor + (5−estrés) + (5−dolor) + (5−fatiga)) / 25 × 100. 100 % = perfecto. |
| **Alertas** | estrés, dolor o fatiga ≥ 4; sueño o humor ≤ 1; o índice < 50 %. |
| **Carga de sesión (UA)** | RPE × minutos (sRPE de Foster). |
| **Carga 7d** | suma de las cargas de los últimos 7 días. |
| **ACWR** | carga de 7 días / media semanal de las últimas 4 semanas. Zona habitual 0,8–1,3; > 1,5 riesgo. Aparece cuando hay ≥ 3 semanas de datos. |

## Excel
- **Por jugadora** (botón *⬇ Excel* en su ficha): hojas *Wellness*, *RPE*, *Carga diaria* y *Semanal*, con gráficos de Excel nativos (índice wellness, las 5 preguntas, carga diaria y semanal, ACWR y wellness medio semanal).
- **Equipo** (botón *⬇ Excel equipo*): hoja resumen, una hoja con gráficos por jugadora y las tablas completas de wellness y RPE.

## Archivos
| Archivo | Para qué |
|---|---|
| `js/config.js` | **Lo único que tienes que editar** (Firebase, clave VAPID, plantilla). |
| `index.html`, `css/`, `js/` | La app. |
| `firebase-messaging-sw.js`, `manifest.webmanifest`, `icons/` | Instalación en el móvil y notificaciones. |
| `firestore.rules` | Reglas de seguridad de la base de datos. |
| `.github/workflows/avisos.yml`, `scripts/` | El programador de avisos. |

## Límites a tener en cuenta
- GitHub ejecuta los avisos programados "cada 10 min" pero a veces con 5–15 min de retraso; el wellness puede llegar a las 8:05–8:20.
- En repositorios públicos, GitHub pausa las tareas programadas si el repositorio no tiene ningún cambio en 60 días; te avisa por email y se reactiva con un clic en **Actions**.
- Plan gratuito de Firebase: 50.000 lecturas y 20.000 escrituras al día, más que de sobra para 25 jugadoras.
