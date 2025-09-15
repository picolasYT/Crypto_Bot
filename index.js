import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import P from "pino"
import fetch from "node-fetch"
import cron from "node-cron"
import qrcode from "qrcode-terminal"   // 👈 para mostrar QR en consola

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
    version
  })

  sock.ev.on("creds.update", saveCreds)

  // 👇 Manejo del QR
  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update
    if (qr) {
      qrcode.generate(qr, { small: true }) // muestra el QR en la terminal
    }
    if (connection === "open") {
      console.log("✅ Bot conectado a WhatsApp")
    }
    if (connection === "close") {
      console.log("❌ Conexión cerrada, intentando reconectar...")
      startBot()
    }
  })

  // 📊 Función para obtener precios
  async function getCryptoPrices() {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true"
    const res = await fetch(url)
    const data = await res.json()

    return `📊 Reporte Cripto\n
🪙 Bitcoin (BTC): $${data.bitcoin.usd} (${data.bitcoin.usd_24h_change.toFixed(2)}%)
🪙 Ethereum (ETH): $${data.ethereum.usd} (${data.ethereum.usd_24h_change.toFixed(2)}%)
🪙 Solana (SOL): $${data.solana.usd} (${data.solana.usd_24h_change.toFixed(2)}%)`
  }

  // ⏰ Envío automático diario a las 16:00
  cron.schedule("10 13 * * *", async () => {
    const chatId = "5492974054231@s.whatsapp.net" // 👈 tu número/grupo
    const message = await getCryptoPrices()
    await sock.sendMessage(chatId, { text: message })
    console.log("Reporte enviado ✅")
  })
}

startBot()
