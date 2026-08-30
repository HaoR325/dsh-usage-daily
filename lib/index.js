import { createHash } from 'node:crypto'

export const name = 'ui-usage-daily'
export const inject = ['webServer', 'sessionQuery']

// DeepSeek rough pricing, USD per 1M tokens (overridable via env).
const PRICE = {
  input: Number(process.env.DSH_USAGE_INPUT_PER_M ?? 0.27),
  output: Number(process.env.DSH_USAGE_OUTPUT_PER_M ?? 1.10),
  cacheRead: Number(process.env.DSH_USAGE_CACHE_READ_PER_M ?? 0.07),
  cacheWrite: Number(process.env.DSH_USAGE_CACHE_WRITE_PER_M ?? 0.27),
}

const ROUTE = '/api/dsh-usage-daily/report'

function startOfDay(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function usageOf(evt) {
  if (evt?.type === 'assistant/chunk' && evt?.data?.chunk?.type === 'usage') return evt.data.chunk.usage
  if (evt?.type === 'assistant/message' && evt?.data?.usage !== undefined) return evt.data.usage
  return undefined
}

function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

function addTotals(t, u) {
  t.input += u.inputTokens ?? 0
  t.output += u.outputTokens ?? 0
  t.cacheRead += u.cacheReadTokens ?? 0
  t.cacheWrite += u.cacheWriteTokens ?? 0
  return t
}

/** Aggregate usage for one day window [start, end) across all logged sessions. */
async function buildReport(ctx, start, end) {
  const records = await ctx.sessionQuery.listSessions().catch(() => [])
  const totals = emptyTotals()
  const perSession = []
  let messages = 0
  let turns = 0
  for (const rec of records) {
    const id = rec?.header?.id
    if (!id) continue
    let events = []
    try {
      const snap = await ctx.sessionQuery.readSession(id)
      events = snap?.events ?? []
    } catch {
      continue
    }
    let sInput = 0, sOutput = 0, sCacheRead = 0, sCacheWrite = 0, sMessages = 0, sTurns = 0
    for (const evt of events) {
      if (typeof evt?.time !== 'number' || evt.time < start || evt.time >= end) continue
      const u = usageOf(evt)
      if (u) {
        sInput += u.inputTokens ?? 0
        sOutput += u.outputTokens ?? 0
        sCacheRead += u.cacheReadTokens ?? 0
        sCacheWrite += u.cacheWriteTokens ?? 0
      }
      if (evt.type === 'assistant/message') sMessages += 1
      if (evt.type === 'turn/end') sTurns += 1
    }
    const sTotal = sInput + sOutput + sCacheRead + sCacheWrite
    if (sTotal === 0 && sMessages === 0) continue
    addTotals(totals, { inputTokens: sInput, outputTokens: sOutput, cacheReadTokens: sCacheRead, cacheWriteTokens: sCacheWrite })
    messages += sMessages
    turns += sTurns
    perSession.push({ id, messages: sMessages, turns: sTurns, tokens: sTotal })
  }
  const totalTokens = totals.input + totals.output + totals.cacheRead + totals.cacheWrite
  const cost =
    (totals.input / 1e6) * PRICE.input +
    (totals.output / 1e6) * PRICE.output +
    (totals.cacheRead / 1e6) * PRICE.cacheRead +
    (totals.cacheWrite / 1e6) * PRICE.cacheWrite
  return {
    ok: true,
    date: new Date(start).toISOString().slice(0, 10),
    sessions: perSession.length,
    messages,
    turns,
    totals: { input: totals.input, output: totals.output, cacheRead: totals.cacheRead, cacheWrite: totals.cacheWrite },
    totalTokens,
    costUsd: Number(cost.toFixed(4)),
    perSession,
  }
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

// Cached report to avoid hammering the store on repeated polls.
let cache
let cacheAt = 0
const CACHE_MS = 30_000

/* eslint-disable no-inner-declarations */
/** Inject a tiny bottom-left floating card that polls the report route. */
function injectCard(html) {
  const cardId = 'dsh-usage-daily-card'
  const script = `<script>(function(){if(document.getElementById('${cardId}'))return;var ROOT='/api/dsh-usage-daily/report';var d=document.createElement('div');d.id='${cardId}';d.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147483000;background:rgba(20,24,34,.86);color:#e6e9ef;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(4px);min-width:150px;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:default';var t=document.createElement('div');t.style.cssText='font-weight:700;margin-bottom:4px;display:flex;justify-content:space-between;gap:8px';var tt=document.createElement('span');tt.textContent='用量日报';var c=document.createElement('span');c.textContent='-';c.style.cssText='cursor:pointer;opacity:.7';var b=document.createElement('div');b.style.cssText='white-space:pre';var h=document.createElement('div');h.textContent='加载中…';h.style.cssText='opacity:.7';t.appendChild(tt);t.appendChild(c);d.appendChild(t);d.appendChild(h);document.body.appendChild(d);var open=true;c.onclick=function(){open=!open;b.style.display=open?'block':'none';c.textContent=open?'-':'+'};function fmt(n){return n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n)}async function load(){try{var r=await fetch(ROOT,{credentials:'same-origin'});if(!r.ok)return;var j=await r.json();var tot=j.totalTokens||0;b.textContent='今日令牌  '+fmt(tot)+'\\n会话 '+j.sessions+' · 消息 '+j.messages+'\\n估算 $'+(j.costUsd||0).toFixed(4)}catch(e){b.textContent='暂无数据'}}load();setInterval(load,60000)})()</script>`
  return html.replace(/<\/body>/i, `${script}</body>`)
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposer = ctx.webServer.register({
      kind: 'exact',
      path: ROUTE,
      handler(req, res) {
        const now = Date.now()
        if (cache && now - cacheAt < CACHE_MS) {
          json(res, 200, cache)
          return
        }
        const start = startOfDay(now)
        buildReport(ctx, start, now + 1000)
          .then((report) => {
            cache = report
            cacheAt = now
            json(res, 200, report)
          })
          .catch((e) => json(res, 500, { ok: false, error: String(e?.message ?? e) }))
      },
    })
    const safeDispose = typeof ctx.webServer.tapIndex === 'function' ? ctx.webServer.tapIndex(injectCard) : undefined
    return [disposer, safeDispose]
  }, 'ui-usage-daily: report route and floating card')
}
