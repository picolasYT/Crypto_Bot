// index.js
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import P from "pino"
import fetch from "node-fetch"
import cron from "node-cron"
import qrcode from "qrcode-terminal"
import QuickChart from "quickchart-js"

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
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") {
      console.log("✅ Bot conectado a WhatsApp")
      // 🔎 Para probar YA MISMO, descomentá:
      // await sendDailyReport(sock)
    }
    if (connection === "close") {
      console.log("❌ Conexión cerrada, reintentando...")
      startBot()
    }
  })

  // ✅ Reporte en texto con precios actuales
  async function getCryptoPricesText() {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true"
    const res = await fetch(url)
    const data = await res.json()

    const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })

    return `📊 Reporte Cripto

🪙 Bitcoin (BTC): $${fmt(data.bitcoin.usd)} (${fmt(data.bitcoin.usd_24h_change)}%)
🪙 Ethereum (ETH): $${fmt(data.ethereum.usd)} (${fmt(data.ethereum.usd_24h_change)}%)
🪙 Solana (SOL): $${fmt(data.solana.usd)} (${fmt(data.solana.usd_24h_change)}%)`
  }

  // 🖼️ Genera un gráfico (PNG) de los últimos N días usando QuickChart
  async function buildChartBuffer(coinId, displayName, days = 30) {
    // 1) Traer históricos de CoinGecko con 1 punto por día
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    const res = await fetch(url)
    const data = await res.json()

    let prices = (data?.prices || []).map(p => Number(p[1]))
    let labels = (data?.prices || []).map(p => {
      const d = new Date(p[0])
      return `${d.getDate()}/${d.getMonth() + 1}`
    })

    // 2) Reducir puntos si son demasiados (>100)
    if (prices.length > 100) {
      const step = Math.ceil(prices.length / 100)
      prices = prices.filter((_, i) => i % step === 0)
      labels = labels.filter((_, i) => i % step === 0)
    }

    // 3) Config Chart.js
    const config = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: `${displayName} (USD) - Últimos ${days} días`,
          data: prices,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          borderColor: "rgba(75,192,192,1)"
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: `${displayName} - ${days} días` }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: false }
        }
      }
    }

    const qc = new QuickChart()
    qc.setConfig(config)
    qc.setWidth(950)
    qc.setHeight(420)
    qc.setBackgroundColor("transparent")

    // 4) Devolver PNG como buffer
    return await qc.toBinary()
  }

  const sleep = (ms) => new Promise(res => setTimeout(res, ms))

  // 🚀 Enviar el reporte completo (texto + gráficas)
  async function sendDailyReport(sockInstance) {
    const chatId = "5492974054231@s.whatsapp.net" // 👈 reemplazá por tu JID

    // 1) Texto
    const text = await getCryptoPricesText()
    await sockInstance.sendMessage(chatId, { text })

    // 2) Imágenes (BTC, ETH, SOL)
    const coins = [
      { id: "bitcoin",  name: "Bitcoin (BTC)"  },
      { id: "ethereum", name: "Ethereum (ETH)" },
      { id: "solana",   name: "Solana (SOL)"   },
    ]

    for (const c of coins) {
      try {
        const img = await buildChartBuffer(c.id, c.name, 30) // 30 días
        await sockInstance.sendMessage(chatId, {
          image: img,
          caption: c.name
        })
        await sleep(1000)
      } catch (e) {
        console.error(`Error gráfico ${c.name}:`, e?.message || e)
      }
    }

    console.log("✅ Reporte diario enviado (texto + gráficas)")
  }

  // ⏰ Programación diaria a las 16:29
  cron.schedule("14 20 * * *", async () => {
    try {
      await sendDailyReport(sock)
    } catch (e) {
      console.error("Error enviando reporte:", e?.message || e)
    }
  })
}

startBot()
