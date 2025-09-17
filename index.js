// index.js
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import P from "pino"
import fetch from "node-fetch"
import cron from "node-cron"
import qrcode from "qrcode-terminal"
import QuickChart from "quickchart-js"
import { exec } from "child_process"

let horarioReporte = "29 16 * * *" // por defecto: todos los días 16:29
let monedas = [
  { id: "bitcoin",  name: "Bitcoin (BTC)"  },
  { id: "ethereum", name: "Ethereum (ETH)" },
  { id: "solana",   name: "Solana (SOL)"   },
]
let alertas = [] // lista de alertas activas
const OWNER = "5492974054231@s.whatsapp.net" // 👈 tu número, solo vos podés usar .update y .restart

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

  // 📊 Reporte general en texto
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

  // 📈 Generar gráfico con rango dinámico
  async function buildChartBuffer(coinId, displayName, range = "7d") {
    let days = 7
    let interval = "daily"

    if (range.toLowerCase().endsWith("d")) {
      days = parseInt(range)
    }

    // usar hourly en rangos cortos
    if (days <= 7) interval = "hourly"
    else interval = "daily"

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
    const res = await fetch(url)
    const data = await res.json()

    const prices = (data?.prices || []).map(p => p[1])
    const labels = (data?.prices || []).map(p => {
      const d = new Date(p[0])
      return days <= 7
        ? `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:00`
        : `${d.getDate()}/${d.getMonth() + 1}`
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
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: false, // no empieza en 0 → evita gráfico plano
            ticks: { callback: v => "$" + v.toLocaleString() }
          }
        }
      }
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

🔹 .cripto → Reporte general
🔹 .btc 1d / 7d / 30d / 100d → Precio + gráfico BTC
🔹 .eth 1d / 7d / 30d → Precio + gráfico ETH
🔹 .sol 1d / 7d / 30d → Precio + gráfico SOL
🔹 .sethora HH:MM → Cambia el horario automático
🔹 .setmonedas lista → Cambia monedas seguidas
🔹 .alerta <moneda> <precio> → Crea alerta
🔹 .update → Actualiza bot desde GitHub (solo admin)
🔹 .restart → Reinicia bot (solo admin)
🔹 .menu → Este menú

━━━━━━━━━━━━━━━━━━━
💡 *Tu asistente cripto en WhatsApp*
━━━━━━━━━━━━━━━━━━━
☆ {ℙ𝕚𝕔𝕠𝕝𝕒𝕤-𝐌𝐃} ☆
`
  await sock.sendMessage(chatId, { text: menuText })
}

      // 📌 .cripto
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

      // 📌 .update (solo OWNER)
      if (body.startsWith(".update") && chatId === OWNER) {
        await sock.sendMessage(chatId, { text: "⏳ Actualizando bot desde GitHub..." })
        exec("git pull && npm install", (error, stdout, stderr) => {
          if (error) {
            sock.sendMessage(chatId, { text: `❌ Error:\n${error.message}` })
            return
          }
          sock.sendMessage(chatId, { text: `✅ Update completo:\n${stdout}` })
          process.exit(0) // reinicia bot
        })
      }

      // 📌 .restart (solo OWNER)
      if (body.startsWith(".restart") && chatId === OWNER) {
        await sock.sendMessage(chatId, { text: "♻️ Reiniciando bot..." })
        process.exit(0)
      }

    } catch (err) {
      console.error("❌ Error procesando mensaje:", err.message)
    }
  })

  // ⏰ Cronjob con horario configurable
  cron.schedule(horarioReporte, async () => {
    const chatId = OWNER
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
        alertas = alertas.filter(a => a !== alerta)
      }
    }
  })
}

startBot()