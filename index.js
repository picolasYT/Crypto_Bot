// index.js
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import P from "pino"
import fetch from "node-fetch"
import cron from "node-cron"
import qrcode from "qrcode-terminal"
import QuickChart from "quickchart-js"

let horarioReporte = "13 10 * * *" // por defecto: todos los días 13:10
let monedas = [
  { id: "bitcoin",  name: "Bitcoin (BTC)"  },
  { id: "ethereum", name: "Ethereum (ETH)" },
  { id: "solana",   name: "Solana (SOL)"   },
]
let alertas = [] // array para guardar alertas activas

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
    version
  })

  sock.ev.on("creds.update", saveCreds)

  // Manejo de conexión + QR
  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("✅ Bot conectado a WhatsApp")
    if (connection === "close") {
      console.log("⚠️ Conexión cerrada, reintentando...")
      startBot()
    }
  })

  // 📊 Texto del reporte general
  async function getCryptoPricesText() {
    const ids = monedas.map(m => m.id).join(",")
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    const res = await fetch(url)
    const data = await res.json()

    const date = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    let msg = `📊 *Reporte Cripto* (${date})\n\n`
    for (const m of monedas) {
      if (!data[m.id]) continue
      const usd = data[m.id].usd.toLocaleString("en-US")
      const change = data[m.id].usd_24h_change.toFixed(2)
      const trend = change >= 0 ? "📈" : "📉"
      msg += `🪙 *${m.name}*\n💲 $${usd}  |  ${trend} ${change}% (24h)\n\n`
    }
    return msg
  }

  // 📈 Gráfico dinámico con rango (1d, 7d, 30d)
  async function buildChartBuffer(coinId, displayName, range = "7d") {
    let days = 7
    if (range.toLowerCase() === "1d") days = 1
    if (range.toLowerCase() === "30d") days = 30

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    const res = await fetch(url)
    const data = await res.json()

    const prices = (data?.prices || []).map(p => p[1])
    const labels = (data?.prices || []).map(p => {
      const d = new Date(p[0])
      return `${d.getDate()}/${d.getMonth() + 1}`
    })

    const config = {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: prices,
          label: `${displayName} (${range})`,
          borderColor: "rgb(75,192,192)",
          fill: false,
          tension: 0.25,
        }]
      },
      options: { plugins: { legend: { display: false } } }
    }

    const qc = new QuickChart()
    qc.setConfig(config)
    qc.setWidth(800)
    qc.setHeight(400)
    return await qc.toBinary()
  }

  const sleep = (ms) => new Promise(res => setTimeout(res, ms))

  // 🚀 Enviar reporte completo (texto + gráficas)
  async function sendReport(chatId, sockInstance) {
    try {
      const text = await getCryptoPricesText()
      await sockInstance.sendMessage(chatId, { text })

      for (const m of monedas) {
        try {
          const img = await buildChartBuffer(m.id, m.name, "7d")
          await sockInstance.sendMessage(chatId, { image: img, caption: m.name })
          await sleep(800)
        } catch (e) {
          console.error(`❌ Error gráfico ${m.name}:`, e.message)
        }
      }

      console.log("✅ Reporte enviado a", chatId)
    } catch (err) {
      console.error("❌ Error en sendReport:", err.message)
    }
  }

  // ⚙️ Escuchar mensajes (comandos)
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const m = messages[0]
      if (!m.message || !m.key.remoteJid) return
      const chatId = m.key.remoteJid
      const body = m.message.conversation || m.message.extendedTextMessage?.text || ""

      // 📌 .menu
      if (body.startsWith(".menu")) {
        const menuText = `
╭━━━〔📊 *Crypto-Bot WhatsApp* 📊〕━━━╮

⚙️ *Comandos disponibles:*

🔹 .cripto  
   → Reporte actual con todas las monedas.

🔹 .btc 7d | .eth 30d | .sol 1d  
   → Precio + gráfico de la moneda elegida (1d, 7d o 30d).

🔹 .sethora HH:MM  
   → Cambia el horario del reporte automático.

🔹 .setmonedas lista  
   → Cambia las monedas que sigue el bot.

🔹 .alerta <moneda> <precio>  
   → Crea una alerta de precio.

🔹 .menu  
   → Muestra este menú.

━━━━━━━━━━━━━━━━━━━
💡 *Tu asistente cripto en WhatsApp*
╰━━━━━━━━━━━━━━━━━━━╯
`
        await sock.sendMessage(chatId, { text: menuText })
      }

      // 📌 .cripto → reporte general
      if (body.startsWith(".cripto")) {
        await sendReport(chatId, sock)
      }

      // 📌 .btc / .eth / .sol con rango
      if (body.startsWith(".btc") || body.startsWith(".eth") || body.startsWith(".sol")) {
        const args = body.split(" ")
        const range = args[1] || "7d"
        let coinId = "bitcoin", coinName = "Bitcoin (BTC)"
        if (body.startsWith(".eth")) { coinId = "ethereum"; coinName = "Ethereum (ETH)" }
        if (body.startsWith(".sol")) { coinId = "solana"; coinName = "Solana (SOL)" }

        const img = await buildChartBuffer(coinId, coinName, range)
        await sock.sendMessage(chatId, { image: img, caption: `📊 ${coinName} últimos ${range}` })
      }

      // 📌 .sethora
      if (body.startsWith(".sethora")) {
        const hora = body.split(" ")[1]
        if (hora && /^\d{1,2}:\d{2}$/.test(hora)) {
          const [h, min] = hora.split(":")
          horarioReporte = `${min} ${h} * * *`
          await sock.sendMessage(chatId, { text: `✅ Horario cambiado a ${hora}` })
        }
      }

      // 📌 .setmonedas
      if (body.startsWith(".setmonedas")) {
        const lista = body.split(" ")[1]
        if (lista) {
          monedas = lista.split(",").map(id => ({
            id: id.trim().toLowerCase(),
            name: id.trim().toUpperCase()
          }))
          await sock.sendMessage(chatId, { text: `✅ Monedas actualizadas: ${lista}` })
        }
      }

      // 📌 .alerta
      if (body.startsWith(".alerta")) {
        const args = body.split(" ")
        const coin = args[1]?.toLowerCase()
        const price = parseFloat(args[2])
        if (!coin || isNaN(price)) {
          await sock.sendMessage(chatId, { text: "⚠️ Uso: .alerta <moneda> <precio>\nEj: .alerta btc 30000" })
        } else {
          alertas.push({ chatId, coin, price })
          await sock.sendMessage(chatId, { text: `✅ Alerta creada para ${coin.toUpperCase()} en $${price}` })
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err.message)
    }
  })

  // ⏰ Cronjob con horario configurable
  cron.schedule(horarioReporte, async () => {
    const chatId = "5492974054231@s.whatsapp.net" // tu número/grupo
    await sendReport(chatId, sock)
  })

  // 🚨 Chequeo de alertas cada 5 minutos
  cron.schedule("*/5 * * * *", async () => {
    if (alertas.length === 0) return
    const ids = [...new Set(alertas.map(a => a.coin))].join(",")
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    const res = await fetch(url)
    const data = await res.json()

    for (const alerta of [...alertas]) {
      const current = data[alerta.coin]?.usd
      if (!current) continue
      if (current <= alerta.price) {
        await sock.sendMessage(alerta.chatId, { text: `🚨 ALERTA: ${alerta.coin.toUpperCase()} bajó a $${current} (límite: ${alerta.price})` })
        alertas = alertas.filter(a => a !== alerta) // borrar alerta disparada
      }
    }
  })
}

startBot()
