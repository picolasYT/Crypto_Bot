// index.js
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import P from "pino"
import fetch from "node-fetch"
import cron from "node-cron"
import qrcode from "qrcode-terminal"
import QuickChart from "quickchart-js"
import { exec } from "child_process"

/* ===== CONFIG ===== */
const OWNER = "5492974054231@s.whatsapp.net"
const TIMEZONE = "America/Argentina/Buenos_Aires"
const BRAND = "☆ {ℙ𝕚𝕔𝕠𝕝𝕒𝕤-𝐌𝐃} ☆"
/* ================== */

let monedas = [
  { id: "bitcoin", name: "Bitcoin (BTC)" },
  { id: "ethereum", name: "Ethereum (ETH)" },
  { id: "solana", name: "Solana (SOL)" },
]

let alertas = []
let reportTask = null
let horarioReporte = "29 16 * * *"

// alias comunes
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
    version,
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
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    m?.message?.imageMessage?.caption ||
    m?.message?.videoMessage?.caption ||
    ""

  function scheduleReport(expr, sockInstance) {
    if (reportTask) reportTask.stop()
    reportTask = cron.schedule(
      expr,
      async () => {
        await sendReport(OWNER, sockInstance)
      },
      { timezone: TIMEZONE }
    )
    console.log("⏰ Cron reprogramado:", expr, `(${TIMEZONE})`)
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  /* ==================================== */

  // 📊 Reporte en texto
  async function getCryptoPricesText() {
    const ids = monedas.map((m) => m.id).join(",")
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    const res = await fetch(url)
    const data = await res.json()

    const date = new Date().toLocaleString("es-AR", { timeZone: TIMEZONE })
    let msg = `📊 *Reporte Cripto* (${date})\n\n`
    for (const m of monedas) {
      if (!data[m.id]) continue
      const usd = Number(data[m.id].usd).toLocaleString("en-US")
      const chg = Number(data[m.id].usd_24h_change).toFixed(2)
      const trend = chg >= 0 ? "📈" : "📉"
      msg += `${m.name.padEnd(14)} $${usd}  |  ${trend} ${chg}% (24h)\n`
    }
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n      el credito\n  ${BRAND}\n━━━━━━━━━━━━━━━━━━━━━━`
    return msg
  }

  // 📈 Gráfico simple
  async function buildChartBuffer(coinId, displayName, days = 7) {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    const res = await fetch(url)
    const data = await res.json()

    const prices = (data?.prices || []).map((p) => p[1])
    const labels = (data?.prices || []).map((p) => {
      const d = new Date(p[0])
      return `${d.getDate()}/${d.getMonth() + 1}`
    })

    const config = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: prices,
            label: displayName,
            borderColor: "rgb(75,192,192)",
            fill: false,
            tension: 0.25,
          },
        ],
      },
      options: { plugins: { legend: { display: false } } },
    }

    const qc = new QuickChart()
    qc.setConfig(config)
    qc.setWidth(800)
    qc.setHeight(400)
    return await qc.toBinary()
  }

  // 🚀 Enviar reporte completo
  async function sendReport(chatId, sockInstance) {
    const text = await getCryptoPricesText()
    await sockInstance.sendMessage(chatId, { text })

    for (const m of monedas) {
      try {
        const img = await buildChartBuffer(m.id, m.name, 7)
        await sockInstance.sendMessage(chatId, {
          image: img,
          caption: m.name,
        })
        await sleep(800)
      } catch (e) {
        console.error(`❌ Error gráfico ${m.name}:`, e.message)
      }
    }
  }

  // ⚙️ Comandos
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const m = messages[0]
      const chatId = m?.key?.remoteJid
      if (!chatId) return
      const body = getTextFromMessage(m).trim()
      const cmd = body.split(/\s+/)[0].toLowerCase()

      /* ===== MENÚ ===== */
      if (cmd === ".menu") {
        const menuText = `
╭━━━〔 📊 Crypto-Bot WhatsApp 〕━━━╮

.cripto        Ver reporte general
               Ej: .cripto

.precio        Precio rápido de una moneda
               Ej: .precio btc

.sethora       Cambiar horario del reporte
               Ej: .sethora 18:45

.setmonedas    Actualizar monedas seguidas
               Ej: .setmonedas btc,eth,sol

.alerta        Crear alerta de precio
               Ej: .alerta btc 30000

.alertas       Listar alertas activas
.deletealerta  Eliminar alerta de una moneda
               Ej: .deletealerta btc

.tiktok        Descargar video de TikTok
               Ej: .tiktok https://www.tiktok.com/...

.yt            Descargar video de YouTube
               Ej: .yt https://youtu.be/abc123

.ping          Test de conexión
.update        Actualizar el bot (solo admin)
.restart       Reiniciar el bot (solo admin)

━━━━━━━━━━━━━━━━━━━━━━
📌 Siguiendo: ${monedas.length} monedas
🔔 Alertas activas: ${alertas.length}
━━━━━━━━━━━━━━━━━━━━━━
        el credito
  ${BRAND}
━━━━━━━━━━━━━━━━━━━━━━
`
        await sock.sendMessage(chatId, { text: menuText })
        return
      }

      /* ===== COMANDOS ===== */
      if (cmd === ".cripto") return await sendReport(chatId, sock)

      if (cmd === ".precio") {
        const coinArg = body.split(/\s+/)[1]?.toLowerCase()
        const id = ID_ALIAS[coinArg] || coinArg
        if (!id) return await sock.sendMessage(chatId, { text: "⚠️ Uso: .precio <moneda>\nEj: .precio btc" })

        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
        const res = await fetch(url)
        const data = await res.json()
        if (!data[id]) return await sock.sendMessage(chatId, { text: `❌ No se encontró info para ${coinArg}` })

        const usd = data[id].usd.toLocaleString("en-US")
        const chg = data[id].usd_24h_change.toFixed(2)
        const trend = chg >= 0 ? "📈" : "📉"
        await sock.sendMessage(chatId, { text: `💰 ${coinArg.toUpperCase()} → $${usd} | ${trend} ${chg}% (24h)` })
        return
      }

      if (cmd === ".sethora") {
        const hhmm = body.split(/\s+/)[1]
        if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return await sock.sendMessage(chatId, { text: "⚠️ Uso: .sethora HH:MM" })
        const [h, mi] = hhmm.split(":")
        horarioReporte = `${mi} ${h} * * *`
        scheduleReport(horarioReporte, sock)
        return await sock.sendMessage(chatId, { text: `✅ Horario cambiado a ${hhmm}` })
      }

      if (cmd === ".setmonedas") {
        const listStr = body.replace(/^\.setmonedas\s+/i, "")
        const ids = listStr.split(/[,\s]+/).filter(Boolean).map((x) => ID_ALIAS[x.toLowerCase()] || x.toLowerCase())
        monedas = ids.map((id) => ({ id, name: id.toUpperCase() }))
        return await sock.sendMessage(chatId, { text: `✅ Monedas actualizadas: ${ids.join(", ")}` })
      }

      if (cmd === ".alerta") {
        const [_, coinArg, priceStr] = body.split(/\s+/)
        const id = ID_ALIAS[coinArg] || coinArg
        const price = parseFloat(priceStr)
        if (!id || isNaN(price)) return await sock.sendMessage(chatId, { text: "⚠️ Uso: .alerta <moneda> <precio>" })
        alertas.push({ chatId, coin: id, price })
        return await sock.sendMessage(chatId, { text: `✅ Alerta creada para ${coinArg.toUpperCase()} en $${price}` })
      }

      if (cmd === ".alertas") {
        if (alertas.length === 0) return await sock.sendMessage(chatId, { text: "🔔 No tenés alertas activas." })
        let txt = "🔔 *Alertas activas:*\n\n"
        alertas.forEach((a, i) => {
          txt += `${i + 1}. ${a.coin.toUpperCase()} → $${a.price}\n`
        })
        return await sock.sendMessage(chatId, { text: txt })
      }

      if (cmd === ".deletealerta") {
        const coinArg = body.split(/\s+/)[1]?.toLowerCase()
        if (!coinArg) return await sock.sendMessage(chatId, { text: "⚠️ Uso: .deletealerta <moneda>" })
        const id = ID_ALIAS[coinArg] || coinArg
        const before = alertas.length
        alertas = alertas.filter((a) => a.coin !== id)
        const diff = before - alertas.length
        return await sock.sendMessage(chatId, { text: diff > 0 ? `✅ Alerta(s) de ${coinArg.toUpperCase()} eliminada(s).` : `❌ No había alertas de ${coinArg.toUpperCase()}.` })
      }

      if (cmd === ".ping") {
        return await sock.sendMessage(chatId, { text: "🏓 Pong! ✅" })
      }

      if (cmd === ".tiktok") {
        const urlTik = body.split(/\s+/)[1]
        if (!urlTik) return await sock.sendMessage(chatId, { text: "⚠️ Uso: .tiktok <url>" })
        try {
          const api = `https://tikwm.com/api/?url=${encodeURIComponent(urlTik)}`
          const res = await fetch(api)
          const data = await res.json()
          if (!data?.data?.play) return await sock.sendMessage(chatId, { text: "❌ No pude descargar el video." })
          const videoUrl = data.data.play
          await sock.sendMessage(chatId, { video: { url: videoUrl }, caption: "📥 Video de TikTok descargado ✅" })
        } catch (err) {
          console.error("❌ Error TikTok:", err.message)
          await sock.sendMessage(chatId, { text: "❌ Error al descargar el video." })
        }
      }

      if (cmd === ".yt") {
        const urlYt = body.split(/\s+/)[1]
        if (!urlYt) return await sock.sendMessage(chatId, { text: "⚠️ Uso: .yt <url>" })
        try {
          const api = `https://api.akuari.my.id/downloader/youtube?url=${encodeURIComponent(urlYt)}`
          const res = await fetch(api)
          const data = await res.json()
          if (!data?.video || !data.video[0]?.url) return await sock.sendMessage(chatId, { text: "❌ No pude descargar el video de YouTube." })
          const videoUrl = data.video[0].url
          await sock.sendMessage(chatId, { video: { url: videoUrl }, caption: "📥 Video de YouTube descargado ✅" })
        } catch (err) {
          console.error("❌ Error YouTube:", err.message)
          await sock.sendMessage(chatId, { text: "❌ Error al descargar el video de YouTube." })
        }
      }

      // Solo OWNER
      const sender = m?.key?.participant || chatId
      const isOwner = sender === OWNER || chatId === OWNER

      if (cmd === ".update" && isOwner) {
        await sock.sendMessage(chatId, { text: "⏳ Actualizando bot desde GitHub..." })
        exec("git pull && npm install", (error, stdout) => {
          if (error) {
            sock.sendMessage(chatId, { text: `❌ Error en update:\n${error.message}` })
            return
          }
          sock.sendMessage(chatId, { text: `✅ Update completo:\n${stdout || "OK"}` })

          // Reiniciar con npm start
          exec("npm start", (err, out) => {
            if (err) console.error("❌ Error al reiniciar:", err.message)
            console.log(out || "Bot reiniciado con npm start ✅")
          })

          process.exit(0)
        })
      }

      if (cmd === ".restart" && isOwner) {
        await sock.sendMessage(chatId, { text: "♻️ Reiniciando bot..." })
        process.exit(0)
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err.message)
    }
  })

  // 🚨 Chequeo de alertas cada 5 min
  cron.schedule("*/5 * * * *", async () => {
    if (alertas.length === 0) return
    const ids = [...new Set(alertas.map((a) => a.coin))].join(",")
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    const res = await fetch(url)
    const data = await res.json()

    for (const alerta of [...alertas]) {
      const current = data[alerta.coin]?.usd
      if (!current) continue
      if (current <= alerta.price) {
        await sock.sendMessage(alerta.chatId, { text: `🚨 ALERTA: ${alerta.coin.toUpperCase()} bajó a $${current} (límite $${alerta.price})` })
        alertas = alertas.filter((a) => a !== alerta)
      }
    }
  })
}

startBot()
