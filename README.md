# Crypto_Bot
**BOT para WT creado por Picolas**


# 📊 Crypto-Bot WhatsApp

Un bot de WhatsApp hecho en **Node.js** usando la librería [Baileys](https://github.com/WhiskeySockets/Baileys).  
Se conecta a tu cuenta mediante **QR** y envía automáticamente un **reporte diario de criptomonedas** (Bitcoin, Ethereum, Solana, etc.) con datos en tiempo real desde la API de [CoinGecko](https://www.coingecko.com/).

---

## 🚀 Características

- 🔗 Conexión a WhatsApp mediante **QR** (se guarda la sesión en `/auth`).
- 📈 Consulta precios y variaciones 24h de criptomonedas en **tiempo real**.
- ⏰ Envío **automático** todos los días a la hora que vos definas (ejemplo: 16:29).
- 📲 Envío a un chat individual o grupo de WhatsApp (con el `chatId`).
- ⚡ Fácil de extender para responder a **comandos manuales** (ej: `.reporte`).

---

## 📂 Estructura del proyecto

crypto-bot/
├─ index.js # Código principal del bot
├─ package.json # Configuración del proyecto y dependencias
├─ package-lock.json
└─ auth/ # Carpeta que se genera sola con la sesión de WhatsApp

yaml
Copiar código

---

## 🛠️ Instalación y uso

1. Clonar este repositorio:
   ```bash
   git clone https://github.com/picolasYT/Crypto_Bot.git
   cd Crypto_Bot
Instalar dependencias:

bash
Copiar código
npm install
Ejecutar el bot:

bash
Copiar código
npm start
Escanear el QR que aparece en consola desde WhatsApp →
Menú → Dispositivos vinculados → Vincular un dispositivo.

⚙️ Configuración
Cambiar el horario del reporte en index.js editando la línea:

js
Copiar código
cron.schedule("29 16 * * *", async () => {
Ejemplo:

"0 9 * * *" → todos los días a las 09:00

"30 18 * * *" → todos los días a las 18:30

Reemplazar el número/grupo destino en la variable chatId:

js
Copiar código
const chatId = "549xxxxxxxxx@s.whatsapp.net"
📊 Ejemplo de reporte
bash
Copiar código
📊 Reporte Cripto

🪙 Bitcoin (BTC): $26,000 (+1.5%)
🪙 Ethereum (ETH): $1,800 (-0.8%)
🪙 Solana (SOL): $23 (+3.2%)
📌 Requisitos
Node.js v18 o superior

Una cuenta de WhatsApp activa

Conexión a internet

🤝 Contribuciones
¡Las PRs son bienvenidas! 🎉
Podés mejorar el bot agregando más criptos, respuestas a comandos o exportación de reportes.

📜 Licencia
Este proyecto es open source bajo la licencia MIT.
