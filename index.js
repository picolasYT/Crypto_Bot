// index.js
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import P from "pino"
import fetch from "node-fetch"
import cron from "node-cron"
import qrcode from "qrcode-terminal"
import QuickChart from "quickchart-js"
import { exec } from "child_process"

/* ====== CONFIG ====== */
const OWNER = "5492974054231@s.whatsapp.net"   // <- TU JID
const TIMEZONE = "America/Argentina/Buenos_Aires"
const BRAND = "☆ {ℙ𝕚𝕔𝕠𝕝𝕒𝕤-𝐌𝐃} ☆"
/* ==================== */

let monedas = [
  { id: "bitcoin",  name: "Bitcoin (BTC)"  },
  { id: "ethereum", name: "Ethereum (ETH)" },
  { id: "solana",   name: "Solana (SOL)"   },
]

let alertas = []
let reportTask = null         // referencia al cron para reprogramar
let horarioReporte = "29 16 * * *" // por defecto 16:29 todos los días

// alias comunes -> ids de CoinGecko
const ID_ALIAS = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  xrp: "ripple",
  ada: "cardano",
  doge: "dogecoin",
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
    version
  })
  sock.ev.on("creds.update", saveCreds)

  // QR & reconexión
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") {
      console.log("✅ Bot conectado a WhatsApp")
      scheduleReport(horarioReporte, sock)
    }
    if (connection === "close") {
      console.log("⚠️ Conexión cerrada, reintentando...")
      startBot()
    }
  })

  /* =============== Utils =============== */
  const getTextFromMessage = (m) =>
    m?.message?.conversation
    || m?.message?.extendedTextMessage?.text
    || m?.message?.imageMessage?.caption
    || m?.message?.videoMessage?.caption
    || ""

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  function scheduleReport(expr, sockInstance) {
    try {
      if (reportTask) reportTask.stop()
      reportTask = cron.schedule(expr, async () => {
        await sendReport(OWNER, sockInstance)
      }, { timezone: TIMEZONE })
      console.log("⏰ Cron reprogramado:", expr, `(${TIMEZONE})`)
    } catch (e) {
      console.error("❌ Error programando cron:", e.message)
    }
  }
  /* ==================================== */

  // Texto del reporte (look más moderno + créditos)
  async function getCryptoPricesText() {
    const ids = monedas.map(m => m.id).join(",")
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    const res = await fetch(url)
    const data = await res.json()

    const date = new Date().toLocaleString("es-AR", { timeZone: TIMEZONE })
    let msg = `╭─────────────────────╮
│  📊 *Reporte Cripto*  │
╰─────────────────────╯
🕒 ${date}\n\n`

    for (const m of monedas) {
      if (!data[m.id]) continue
      const usd = Number(data[m.id].usd).toLocaleString("en-US")
      const chg = Number(data[m.id].usd_24h_change).toFixed(2)
      const trend = chg >= 0 ? "📈" : "📉"
      msg += `💠 *${m.name}*\n   💵 $${usd}  |  ${trend} ${chg}% (24h)\n\n`
    }

    msg += `━━━━━━━━━━━━━━━━━━━\n${BRAND}\n`
    return msg
  }

  // Gráfico simple (versión estable)
  async function buildChartBuffer(coinId, displayName, days = 7) {
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
          label: displayName,
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

  // Envío de reporte completo
  async function sendReport(chatId, sockInstance) {
    try {
      const text = await getCryptoPricesText()
      await sockInstance.sendMessage(chatId, { text })

      for (const m of monedas) {
        try {
          const img = await buildChartBuffer(m.id, m.name, 7)
          await sockInstance.sendMessage(chatId, { image: img, caption: m.name })
          await sleep(700)
        } catch (e) {
          console.error(`❌ Error gráfico ${m.name}:`, e.message)
        }
      }
      console.log("✅ Reporte enviado a", chatId)
    } catch (err) {
      console.error("❌ Error en sendReport:", err.message)
    }
  }

  // Comandos
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const m = messages[0]
      const chatId = m?.key?.remoteJid
      if (!chatId) return
      const bodyRaw = getTextFromMessage(m)
      const body = bodyRaw.trim()

      // normalizar
      const cmd = body.split(/\s+/)[0].toLowerCase()

      // .menu
      if (cmd === ".menu" || cmd === ".help") {
        const menuText = `
╭━━━〔📊 *Crypto-Bot WhatsApp* 📊〕━━━╮

⚙️ *Comandos disponibles:*
• .cripto → Reporte general
• .sethora HH:MM → Cambia el horario automático
• .setmonedas lista → e.g. ".setmonedas btc,eth,sol"
• .alerta <moneda> <precio> → e.g. ".alerta btc 30000"
• .update / .restart → Solo admin
• .menu → Este menú

━━━━━━━━━━━━━━━━━━━
${BRAND}
`
        await sock.sendMessage(chatId, { text: menuText })
        return
      }

      // .cripto
      if (cmd === ".cripto") {
        await sendReport(chatId, sock)
        return
      }

      // .sethora HH:MM  (reprograma *de verdad*)
      if (cmd === ".sethora") {
        const hhmm = body.split(/\s+/)[1]
        if (!/^\d{1,2}:\d{2}$/.test(hhmm)) {
          await sock.sendMessage(chatId, { text: "⚠️ Uso: *.sethora HH:MM*\nEj: *.sethora 18:45*" })
          return
        }
        const [hStr, mStr] = hhmm.split(":")
        const h = Number(hStr), mi = Number(mStr)
        if (h > 23 || mi > 59) {
          await sock.sendMessage(chatId, { text: "⚠️ Hora inválida. Usa formato 00–23:00–59." })
          return
        }
        horarioReporte = `${mi} ${h} * * *`
        scheduleReport(horarioReporte, sock)
        await sock.sendMessage(chatId, { text: `✅ Horario cambiado a *${hhmm}* (${TIMEZONE})` })
        return
      }

      // .setmonedas <lista>
      if (cmd === ".setmonedas") {
        const listStr = body.replace(/^\.setmonedas\s+/i, "")
        if (!listStr) {
          await sock.sendMessage(chatId, { text: "⚠️ Uso: *.setmonedas btc,eth,sol*" })
          return
        }
        const ids = [...new Set(listStr.split(/[,\s]+/).filter(Boolean).map(x => ID_ALIAS[x.toLowerCase()] || x.toLowerCase()))]
        if (ids.length === 0) {
          await sock.sendMessage(chatId, { text: "⚠️ No se detectaron monedas." })
          return
        }
        monedas = ids.map(id => {
          const sym = Object.keys(ID_ALIAS).find(k => ID_ALIAS[k] === id)
          const tag = sym ? sym.toUpperCase() : id.toUpperCase()
          return { id, name: `${tag}` }
        })
        await sock.sendMessage(chatId, { text: `✅ Monedas actualizadas: ${ids.join(", ")}` })
        return
      }

      // .alerta <moneda> <precio>
      if (cmd === ".alerta") {
        const parts = body.split(/\s+/)
        const coinArg = (parts[1] || "").toLowerCase()
        const price = parseFloat(parts[2])
        const id = ID_ALIAS[coinArg] || coinArg
        if (!id || Number.isNaN(price)) {
          await sock.sendMessage(chatId, { text: "⚠️ Uso: *.alerta <moneda> <precio>*\nEj: *.alerta btc 30000*" })
          return
        }
        alertas.push({ chatId, coin: id, price })
        await sock.sendMessage(chatId, { text: `✅ Alerta creada para *${coinArg.toUpperCase()}* en $${price}` })
        return
      }

      // ADMIN ONLY
      const sender = m?.key?.participant || chatId
      const isOwner = sender === OWNER || chatId === OWNER

      // .update
      if (cmd === ".update" && isOwner) {
        await sock.sendMessage(chatId, { text: "⏳ Actualizando bot desde GitHub..." })
        exec("git pull && npm install", (error, stdout, stderr) => {
          if (error) {
            sock.sendMessage(chatId, { text: `❌ Error:\n${error.message}` })
            return
          }
          sock.sendMessage(chatId, { text: `✅ Update completo:\n${stdout || "OK"}` })
          process.exit(0) // reinicia
        })
        return
      }

      // .restart
      if (cmd === ".restart" && isOwner) {
        await sock.sendMessage(chatId, { text: "♻️ Reiniciando bot..." })
        process.exit(0)
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err.message)
    }
  })

  // Chequeo de alertas cada 5 minutos
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
        await sock.sendMessage(alerta.chatId, { text: `🚨 ALERTA: *${alerta.coin.toUpperCase()}* bajó a *$${current}* (límite: $${alerta.price})` })
        alertas = alertas.filter(a => a !== alerta)
      }
    }
  })
}

startBot()