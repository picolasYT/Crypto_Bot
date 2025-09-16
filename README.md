# 🤖 Crypto_Bot
**Bot de WhatsApp creado por [Picolas](https://github.com/picolasYT)**  

---

# 📊 Crypto-Bot WhatsApp

Un bot para **WhatsApp** desarrollado en **Node.js** con la librería [Baileys](https://github.com/WhiskeySockets/Baileys).  
Se conecta a tu cuenta mediante **QR** y envía automáticamente un **reporte diario de criptomonedas** (Bitcoin, Ethereum, Solana, etc.) con datos en tiempo real gracias a la API pública de [CoinGecko](https://www.coingecko.com/).  

También responde a **comandos manuales**, lo que lo hace flexible y fácil de usar directamente desde WhatsApp.

---

## 🚀 Funcionalidades principales

- 🔗 Conexión mediante **QR** (se guarda la sesión en `/auth` para no tener que vincular cada vez).  
- 📈 Consulta precios y variaciones de criptomonedas en **tiempo real**.  
- ⏰ Envío **automático** todos los días a la hora configurada (ejemplo: 16:29).  
- 🪙 Soporte para múltiples monedas (BTC, ETH, SOL, y más).  
- 📲 Envío a un chat individual o grupo de WhatsApp mediante su `chatId`.  
- ⚡ Extensible: responde a comandos como `.cripto`, `.menu`, `.btc 7d`, `.alerta btc 30000`, etc.  

---

## 📂 Estructura del proyecto

crypto-bot/
├─ index.js # Código principal del bot
├─ package.json # Configuración del proyecto y dependencias
├─ package-lock.json
└─ auth/ # Carpeta autogenerada con la sesión de WhatsApp

yaml
Copiar código

---

## 🛠️ Instalación y uso en Termux

Ejecutá este comando en Termux para instalar dependencias, clonar el repo y arrancar el bot de una sola vez:

```bash
termux-setup-storage && apt update -y && apt upgrade -y && pkg install -y nodejs git ffmpeg imagemagick tmux && git clone https://github.com/picolasYT/Crypto_Bot.git && cd Crypto_Bot && npm install && npm start
Manual
Clonar este repositorio:

bash
Copiar código
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
Cambiar horario del reporte automático en index.js:

js
Copiar código
cron.schedule("29 16 * * *", async () => {
Ejemplos:

"0 9 * * *" → todos los días a las 09:00

"30 18 * * *" → todos los días a las 18:30

Cambiar número/grupo destino editando chatId:

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
(debajo del texto, el bot también puede enviar gráficas con histórico de precios)

📌 Requisitos
Node.js v18 o superior

Cuenta de WhatsApp activa

Conexión a internet

🤝 Contribuciones
¡Las PRs y mejoras son bienvenidas! 🎉
Podés agregar nuevas monedas, alertas de precios, comandos personalizados o integraciones con otras plataformas.

📜 Licencia
Este proyecto es open source bajo la licencia MIT.
