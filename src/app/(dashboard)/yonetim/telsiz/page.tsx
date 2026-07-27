"use client"

import { useState, useEffect, useRef } from "react"
import jsPDF from "jspdf"
import { useAuthStore } from "@/lib/authStore"
import { api } from "@/lib/api"
import { RadioRecordingsPanel } from "@/components/radio/RadioRecordingsPanel"
import PageGuard from "@/components/PageGuard"
import { Badge } from "@/components/ui/Badge"
import { toast } from "@/lib/toast"
import { 
  Radio, 
  Send, 
  Volume2, 
  VolumeX, 
  FileText, 
  Printer, 
  Loader2, 
  Shield, 
  Info, 
  Lock, 
  Unlock, 
  MessageSquare, 
  Clock, 
  User, 
  AlertTriangle,
  ArrowLeft 
} from "lucide-react"

// Turkish character cleanups for Helvetica built-in font in jsPDF
function cleanTurkishChars(text: string): string {
  if (!text) return ""
  const charMap: Record<string, string> = {
    'ş': 's', 'Ş': 'S',
    'ı': 'i', 'İ': 'I',
    'ğ': 'g', 'Ğ': 'G',
    'ü': 'u', 'Ü': 'U',
    'ö': 'o', 'Ö': 'O',
    'ç': 'c', 'Ç': 'C',
  }
  return text.replace(/[şŞıİğĞüÜöÖçÇ]/g, match => charMap[match] || match)
}

interface Incident {
  id: string
  olay_turu: string
  mahalle: string
  status: string
  cikis_saati: string
  adres?: string
}

interface Mission {
  id: string
  gorev_turu: string
  baslik: string
  durum: string
  created_at: string
}

interface RadioLog {
  id: string
  kanal_tipi: string
  vaka_id?: string
  mission_id?: string
  gonderen_personel_id: string
  gonderen_ad_soyad: string
  gonderen_rutbe: string
  mesaj_metni: string
  telsiz_kodu?: string
  created_at: string
}

export default function TelsizPage() {
  const { user } = useAuthStore()
  const [moduleView, setModuleView] = useState<'muhabere' | 'ses'>('muhabere')
  const [personnelUuid, setPersonnelUuid] = useState<string>("")
  
  // Channels and selection state
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([])
  const [closedIncidents, setClosedIncidents] = useState<Incident[]>([])
  const [activeMissions, setActiveMissions] = useState<Mission[]>([])
  const [closedMissions, setClosedMissions] = useState<Mission[]>([])
  const [selectedChannel, setSelectedChannel] = useState<{ id: string; name: string; type: 'Genel' | 'Vaka' | 'Görev'; isClosed: boolean }>({
    id: 'general',
    name: 'Genel Karargâh Muhabere',
    type: 'Genel',
    isClosed: false
  })

  // Messages and Input
  const [messages, setMessages] = useState<RadioLog[]>([])
  const [inputText, setInputText] = useState("")
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)

  // Simulation states
  const [isMuted, setIsMuted] = useState(false)
  const [isTxActive, setIsTxActive] = useState(false) // Red dot blinking (Transmission)
  const [isRxActive, setIsRxActive] = useState(false) // Green dot blinking (Reception)
  
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chatContainerRef = useRef<HTMLDivElement | null>(null)
  const prevMessagesLength = useRef<number>(0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [mobileView, setMobileView] = useState<'channels' | 'chat'>('channels')

  // Canvas waveform dynamic animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    let animationId: number
    let phase = 0
    
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      let amplitude = 1.5
      let speed = 0.05
      if (isTxActive || sendingMessage) {
        amplitude = 8
        speed = 0.22
      } else if (isRxActive) {
        amplitude = 6
        speed = 0.16
      } else if (inputText.trim().length > 0) {
        amplitude = 3
        speed = 0.08
      }
      
      const accentColor = typeof window !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--fd-accent').trim() || '#06b6d4' : '#06b6d4'
      ctx.strokeStyle = accentColor
      ctx.lineWidth = 1.5
      ctx.shadowBlur = 4
      ctx.shadowColor = accentColor + '66' // Add opacity
      
      ctx.beginPath()
      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.sin(x * 0.1 + phase) * amplitude
        if (x === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
      
      phase += speed
      animationId = requestAnimationFrame(draw)
    }
    
    draw()
    return () => cancelAnimationFrame(animationId)
  }, [isTxActive, isRxActive, sendingMessage, inputText])

  // Resolve user's database personnel uuid on load
  useEffect(() => {
    async function resolveUuid() {
      if (user?.sicilNo) {
        try {
          const { data, error } = await api.from('personnel').select('id').eq('sicil_no', user.sicilNo).single()
          if (data && data.id) {
            setPersonnelUuid(data.id)
          }
        } catch (err) {
          console.error("Personnel id fetch error:", err)
        }
      }
    }
    resolveUuid()
  }, [user?.sicilNo])

  // Polling for Active and Closed incidents/channels list (every 5 seconds)
  useEffect(() => {
    async function fetchChannels() {
      try {
        const { data: incData } = await api.from('incidents').select('*').order('cikis_saati', { ascending: false })
        if (incData) {
          const active = incData.filter((i: any) => i.status === 'active')
          const closed = incData.filter((i: any) => i.status !== 'active')
          setActiveIncidents(active)
          setClosedIncidents(closed)
        }

        const { data: missionData } = await api.from('external_missions').select('*').order('created_at', { ascending: false })
        if (missionData) {
          const activeM = missionData.filter((m: any) => m.durum !== 'Tamamlandı' && m.durum !== 'iptal')
          const closedM = missionData.filter((m: any) => m.durum === 'Tamamlandı' || m.durum === 'iptal')
          setActiveMissions(activeM)
          setClosedMissions(closedM)
        }
      } catch (err) {
        console.error("Fetch channels error:", err)
      } finally {
        setLoadingChannels(false)
      }
    }

    fetchChannels()
    const interval = setInterval(fetchChannels, 5000)
    return () => clearInterval(interval)
  }, [])

  // Helper to fetch selected channel messages
  const fetchMessages = async () => {
    if (!selectedChannel) return
    setIsRxActive(true)
    setTimeout(() => setIsRxActive(false), 300)

    try {
      let queryBuilder = api.from('radio_logs').select('*')
      if (selectedChannel.id === 'general') {
        queryBuilder = queryBuilder.eq('kanal_tipi', 'Genel')
      } else if (selectedChannel.type === 'Görev') {
        queryBuilder = queryBuilder.eq('kanal_tipi', 'Görev').eq('mission_id', selectedChannel.id)
      } else {
        queryBuilder = queryBuilder.eq('kanal_tipi', 'Vaka').eq('vaka_id', selectedChannel.id)
      }
      
      const { data, error } = await queryBuilder.order('created_at', { ascending: true })
      if (data) {
        setMessages(data)
      }
    } catch (err) {
      console.error("Fetch messages error:", err)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40
    setShouldAutoScroll(isAtBottom)
  }

  // Polling for Selected Channel messages (every 2 seconds)
  useEffect(() => {
    prevMessagesLength.current = 0 // Reset message length tracker on channel change
    setShouldAutoScroll(true) // Reset auto-scroll to true when changing channels
    setLoadingMessages(true)
    fetchMessages().then(() => {
      setLoadingMessages(false)
      // Force scroll to bottom on channel change
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
        }
      }, 100)
    })

    const interval = setInterval(fetchMessages, 2000)
    return () => clearInterval(interval)
  }, [selectedChannel])

  // Scroll to bottom and play squelch / static noise on new messages
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (shouldAutoScroll && chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
      
      // Play walkie-talkie audio squelch/siren on receiving a new message
      if (prevMessagesLength.current > 0) {
        const lastMsg = messages[messages.length - 1]
        if (lastMsg.telsiz_kodu === 'ACIL_DURUM') {
          playSirenSound()
        } else {
          playStaticNoise()
        }
      }
      prevMessagesLength.current = messages.length
    }
  }, [messages, shouldAutoScroll])

  // Send message action
  const handleSendMessage = async (text: string, telsizKodu: string | null = null) => {
    const cleanText = text.trim()
    if (!cleanText) return
    if (!user) return

    if (!personnelUuid) {
      toast("Kimliğiniz doğrulanıyor, lütfen 1 saniye bekleyip tekrar deneyin.")
      return
    }

    setSendingMessage(true)
    setIsTxActive(true)

    try {
      const payload = {
        kanal_tipi: selectedChannel.type,
        vaka_id: selectedChannel.type === 'Vaka' ? selectedChannel.id : null,
        mission_id: selectedChannel.type === 'Görev' ? selectedChannel.id : null,
        gonderen_personel_id: personnelUuid,
        gonderen_ad_soyad: `${user.ad} ${user.soyad}`,
        gonderen_rutbe: user.unvan || user.rol || "İtfaiye Eri",
        mesaj_metni: cleanText,
        telsiz_kodu: telsizKodu,
        created_at: new Date().toISOString()
      }

      const { data, error } = await api.insert('radio_logs', [payload])
      if (error) {
        console.error("Message insert error:", error)
        toast("Muhabere hatası: Telsiz mandalı başarısız.")
      } else {
        setInputText("")
        // Play beep sound if unmuted
        if (!isMuted && typeof window !== 'undefined') {
          playRadioBeep()
        }
        await fetchMessages()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSendingMessage(false)
      setIsTxActive(false)
    }
  }

  // Simulate Walkie-Talkie Over beep sound using Web Audio API
  const playRadioBeep = () => {
    if (isMuted) return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      
      // Tone 1
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // High Pitch Beep
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch (e) {
      console.warn("Audio Context init failed:", e)
    }
  }

  // Play Walkie-Talkie Static/Squelch Noise using synthesized white noise
  const playStaticNoise = () => {
    if (isMuted || typeof window === 'undefined') return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      
      const bufferSize = ctx.sampleRate * 0.12 // 120ms duration
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1 // White noise
      }
      
      const noise = ctx.createBufferSource()
      noise.buffer = buffer
      
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1000
      filter.Q.value = 1.2
      
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      
      noise.start()
    } catch (e) {
      console.warn("Static noise failed:", e)
    }
  }

  // Play Emergency Siren Yelp sound using low pass modulated oscillator
  const playSirenSound = () => {
    if (isMuted || typeof window === 'undefined') return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(600, ctx.currentTime)
      
      const duration = 1.8 // 1.8 seconds duration
      const steps = 18
      for (let i = 0; i < steps; i++) {
        const time = ctx.currentTime + (duration / steps) * i
        const freq = i % 2 === 0 ? 900 : 600
        osc.frequency.setValueAtTime(freq, time)
      }
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1400
      
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch (e) {
      console.warn("Siren sound failed:", e)
    }
  }

  // Generate Jurnal PDF using jsPDF
  const handlePrintJurnal = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const clean = (txt: string) => cleanTurkishChars(txt || "")

    // A4 border lines
    doc.rect(5, 5, 200, 287)
    doc.rect(6, 6, 198, 285)

    // Antetli Başlık
    doc.setFont("Helvetica", "bold")
    doc.setFontSize(14)
    doc.text(clean("T.C. SIVAS BELEDIYESI"), 105, 20, { align: "center" })
    doc.setFontSize(12)
    doc.text(clean("ITFAIYE MUDURLUGU"), 105, 26, { align: "center" })
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(11)
    doc.text(clean(selectedChannel.type === 'Görev' ? "RESMI DIS GOREV TELSIZ MUHABERE JURNALI" : "RESMI VAKA TELSIZ MUHABERE JURNALI"), 105, 32, { align: "center" })

    doc.line(15, 38, 195, 38)

    // Detay Bilgileri
    doc.setFontSize(10)
    doc.setFont("Helvetica", "bold")
    doc.text(clean("MUHABERE DETAYLARI:"), 15, 46)
    
    doc.setFont("Helvetica", "normal")
    doc.text(clean(`Kanal Adi: ${selectedChannel.name}`), 15, 54)
    doc.text(clean(`Kanal Tipi: ${selectedChannel.type === 'Genel' ? 'Genel Karargah' : selectedChannel.type === 'Görev' ? 'Dis Gorev Sevk Kanali' : 'Olay Sevk Kanali'}`), 15, 60)
    doc.text(clean(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}`), 15, 66)

    doc.line(15, 72, 195, 72)

    // Tablo Başlıkları
    doc.setFont("Helvetica", "bold")
    doc.text(clean("ZAMAN"), 15, 80)
    doc.text(clean("GONDEREN PERSONEL / RUTBE"), 40, 80)
    doc.text(clean("KOD"), 105, 80)
    doc.text(clean("MUHABERE METNI"), 120, 80)
    doc.line(15, 83, 195, 83)

    // Mesaj Dökümleri
    doc.setFont("Helvetica", "normal")
    let y = 89
    const maxPageHeight = 275

    messages.forEach((msg, idx) => {
      // If table reaches bottom, add a new page
      if (y > maxPageHeight) {
        doc.addPage()
        doc.rect(5, 5, 200, 287)
        doc.rect(6, 6, 198, 285)
        
        // Header on new page
        doc.setFont("Helvetica", "bold")
        doc.text(clean("ZAMAN"), 15, 15)
        doc.text(clean("GONDEREN PERSONEL / RUTBE"), 40, 15)
        doc.text(clean("KOD"), 105, 15)
        doc.text(clean("MUHABERE METNI"), 120, 15)
        doc.line(15, 18, 195, 18)
        
        doc.setFont("Helvetica", "normal")
        y = 24
      }

      const timeStr = new Date(msg.created_at).toLocaleTimeString('tr-TR')
      const senderStr = `${msg.gonderen_ad_soyad} (${msg.gonderen_rutbe})`
      const codeStr = msg.telsiz_kodu || "-"
      
      // Text wrap for walkie-talkie message
      const textLines = doc.splitTextToSize(msg.mesaj_metni, 70)

      doc.text(clean(timeStr), 15, y)
      doc.text(clean(senderStr), 40, y)
      doc.text(clean(codeStr), 105, y)
      
      textLines.forEach((line: string, lIdx: number) => {
        doc.text(clean(line), 120, y + (lIdx * 5))
      })

      y += Math.max(textLines.length * 5, 8)
      doc.line(15, y - 3, 195, y - 3)
      y += 3
    })

    // Signatures at the bottom
    if (y + 35 > maxPageHeight) {
      doc.addPage()
      doc.rect(5, 5, 200, 287)
      doc.rect(6, 6, 198, 285)
      y = 20
    }

    doc.setFont("Helvetica", "bold")
    doc.text(clean("RAPORU HAZIRLAYAN:"), 15, y + 15)
    doc.setFont("Helvetica", "normal")
    doc.text(clean(user ? `${user.ad} ${user.soyad}` : "Telsiz Operatörü"), 15, y + 22)
    doc.text(clean(user?.unvan || "Itfaiye Eri"), 15, y + 27)

    doc.setFont("Helvetica", "bold")
    doc.text(clean("NOBETCI AMIRI ONAYI:"), 120, y + 15)
    doc.setFont("Helvetica", "normal")
    doc.text(clean("............................"), 120, y + 22)
    doc.text(clean("İmza / Mühür"), 120, y + 27)

    doc.save(`Telsiz_Muhabere_Jurnali_${selectedChannel.id}.pdf`)
  }

  return (
    <PageGuard pageId="telsiz">
      <div className="flex flex-col min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-4rem)] text-[var(--fd-text)] font-sans w-full relative">

        {/* MODÜL SEKMELERİ — Muhabere (mevcut) / Ses Kayıtları (yeni) */}
        <div className="flex gap-1 p-1 mb-4 rounded-[var(--fd-r-sm)] bg-[var(--fd-surface2)] border border-[var(--fd-border)] w-fit">
          {([['muhabere', 'Muhabere'], ['ses', 'Ses Kayıtları']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setModuleView(key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-[var(--fd-r-sm)] text-[calc(var(--fd-fs)*0.85)] font-bold transition-colors ${
                moduleView === key ? 'bg-[var(--fd-accent)] text-white' : 'text-[var(--fd-text2)] hover:text-[var(--fd-text)]'
              }`}
            >
              <Radio className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {moduleView === 'ses' ? (
          <RadioRecordingsPanel />
        ) : (
        <>
        {/* TOP STATUS CONTROL BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)] px-4 py-3 rounded-xl gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--fd-accent)]/10 border border-[var(--fd-accent)]/20 rounded-lg text-[var(--fd-accent)]">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[var(--fd-text)] flex items-center gap-2">
                Dijital Telsiz Muhabere Sistemi
                <span className="text-[10px] uppercase bg-[var(--fd-accent)]/15 text-[var(--fd-accent)] px-2 py-0.5 rounded border border-[var(--fd-accent)]/25">CANLI</span>
              </h2>
              <p className="text-xs text-[var(--fd-text3)]">Sivas İtfaiye Müdürlüğü Müfrezeler Arası Ortak Muhabere Ağı</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Audio Indicator */}
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className={`p-2 rounded-lg border transition-all cursor-pointer ${
                isMuted 
                  ? 'bg-[var(--fd-danger)]/10 border-[var(--fd-danger)]/30 text-[var(--fd-danger)] hover:bg-[var(--fd-danger)]/25' 
                  : 'bg-[var(--fd-success)]/10 border-[var(--fd-success)]/30 text-[var(--fd-success)] hover:bg-[var(--fd-success)]/25'
              }`}
              title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* General Jurnal Export Action */}
            <button
              onClick={handlePrintJurnal}
              disabled={messages.length === 0}
              className="px-3 py-2 text-xs font-bold bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] text-[var(--fd-text2)] rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Resmi Jurnal Bas
            </button>
          </div>
        </div>

        {/* MAIN COMMUNICATIONS PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-stretch">
          
          {/* LEFT CHANNEL SELECTOR PANEL (SOL PANEL) */}
          <div className={`lg:col-span-4 flex flex-col gap-4 border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)] p-4 max-h-[calc(100vh-21rem)] lg:max-h-[calc(100vh-14rem)] overflow-y-auto ${
            mobileView === 'channels' ? 'flex' : 'hidden lg:flex'
          }`}>
            
            {/* Telsiz Simulation Graphic Panel */}
            <div className="border border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 rounded-lg p-3 relative overflow-hidden shadow-[inset_0_2px_10px_rgba(6,182,212,0.02)]">
              <div className="absolute top-0 right-0 w-20 h-20 bg-[var(--fd-accent)]/5 rounded-full blur-xl pointer-events-none" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] text-[var(--fd-accent)] font-bold uppercase tracking-wider">MÜFREZE AKSIYON FREKANSI</span>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${isTxActive ? 'bg-[var(--fd-danger)] animate-ping' : 'bg-[var(--fd-danger)]/20'}`} title="TX - Gönderme" />
                  <span className="text-[8px] font-bold text-[var(--fd-danger)] mr-1.5">TX</span>
                  <div className={`w-2 h-2 rounded-full ${isRxActive ? 'bg-[var(--fd-success)] animate-ping' : 'bg-[var(--fd-success)]/20'}`} title="RX - Alma" />
                  <span className="text-[8px] font-bold text-[var(--fd-success)]">RX</span>
                </div>
              </div>
              
              {/* Status Screen with animated canvas waveform */}
              <div className="mt-3 bg-[var(--fd-surface)] border border-[var(--fd-border)]/80 rounded px-3 py-2 flex items-center justify-between font-mono">
                <span className="text-xs font-bold text-[var(--fd-accent)] tracking-wider uppercase">ANLIK KANAL BAĞLANTISI</span>
                <canvas 
                  ref={canvasRef} 
                  width={90} 
                  height={18} 
                  className="w-[90px] h-[18px] opacity-90"
                />
              </div>
            </div>

            <div className="border-t border-[var(--fd-border)] my-1" />

            {/* Channels Lists */}
            <div className="space-y-4">
              
              {/* Category 1: Karargah Main Channel */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider px-2">KARARGÂH KANALI</span>
                <button
                  onClick={() => {
                    setSelectedChannel({ id: 'general', name: 'Genel Karargâh Muhabere', type: 'Genel', isClosed: false })
                    setMobileView('chat')
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedChannel.id === 'general'
                      ? 'bg-[var(--fd-accent)]/10 border-[var(--fd-accent)] text-[var(--fd-accent)] font-bold shadow-[inset_10px_0_15px_-10px_rgba(6,182,212,0.05)]'
                      : 'bg-[var(--fd-surface2)]/40 border-[var(--fd-border)]/75 hover:border-[var(--fd-border)] text-[var(--fd-text2)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Radio className="w-4 h-4 text-[var(--fd-accent)]" />
                    <span className="text-sm">Genel Karargâh Muhabere</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-[var(--fd-accent)] shadow-[0_0_8px_var(--fd-accent-glow)]" />
                </button>
              </div>

              {/* Category 2: Active incident channels */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider px-2">🚨 CANLI OLAY KANALLARI</span>
                {loadingChannels ? (
                  <div className="py-4 text-center text-xs text-[var(--fd-text3)]">Kanallar yükleniyor...</div>
                ) : activeIncidents.length === 0 ? (
                  <div className="py-3 px-2 border border-dashed border-[var(--fd-border)] text-xs text-[var(--fd-text3)] rounded-lg text-center bg-[var(--fd-surface2)]/20">
                    Aktif ihbar sevk kanalı bulunmuyor.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeIncidents.map(inc => (
                      <button
                        key={inc.id}
                        onClick={() => {
                          setSelectedChannel({ id: inc.id, name: `Vaka #${inc.olay_turu} (${inc.mahalle})`, type: 'Vaka', isClosed: false })
                          setMobileView('chat')
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          selectedChannel.id === inc.id
                            ? 'bg-[var(--fd-accent)]/10 border-[var(--fd-accent)] text-[var(--fd-accent)] font-bold shadow-[inset_10px_0_15px_-10px_rgba(6,182,212,0.05)]'
                            : 'bg-[var(--fd-surface2)]/40 border-[var(--fd-border)]/75 hover:border-[var(--fd-border)] text-[var(--fd-text2)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MessageSquare className="w-4 h-4 text-[var(--fd-accent)] shrink-0" />
                          <div className="truncate">
                            <span className="text-sm block truncate font-bold text-[var(--fd-text)]">{inc.olay_turu}</span>
                            <span className="text-[10px] block text-[var(--fd-text3)] truncate">{inc.mahalle} Mah.</span>
                          </div>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-[var(--fd-success)] animate-pulse" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category 2.5: Active mission channels */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider px-2">📋 CANLI GÖREV KANALLARI</span>
                {loadingChannels ? (
                  <div className="py-4 text-center text-xs text-[var(--fd-text3)]">Kanallar yükleniyor...</div>
                ) : activeMissions.length === 0 ? (
                  <div className="py-3 px-2 border border-dashed border-[var(--fd-border)] text-xs text-[var(--fd-text3)] rounded-lg text-center bg-[var(--fd-surface2)]/20">
                    Aktif dış görev kanalı bulunmuyor.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeMissions.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedChannel({ id: m.id, name: `Görev: ${m.baslik} (${m.gorev_turu})`, type: 'Görev', isClosed: false })
                          setMobileView('chat')
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          selectedChannel.id === m.id
                            ? 'bg-[var(--fd-accent)]/10 border-[var(--fd-accent)] text-[var(--fd-accent)] font-bold shadow-[inset_10px_0_15px_-10px_rgba(6,182,212,0.05)]'
                            : 'bg-[var(--fd-surface2)]/40 border-[var(--fd-border)]/75 hover:border-[var(--fd-border)] text-[var(--fd-text2)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Radio className="w-4 h-4 text-[var(--fd-accent)] shrink-0" />
                          <div className="truncate">
                            <span className="text-sm block truncate font-bold text-[var(--fd-text)]">{m.baslik}</span>
                            <span className="text-[10px] block text-[var(--fd-text3)] truncate">{m.gorev_turu}</span>
                          </div>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-[var(--fd-accent)] animate-pulse" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category 3: Closed incident channels (Archive) */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider px-2">🗄️ KAPATILMIŞ VAKA ARŞİVİ (SALT OKUNUR)</span>
                {loadingChannels ? null : closedIncidents.length === 0 ? (
                  <div className="py-2 text-center text-xs text-[var(--fd-text3)]">Arşiv kaydı bulunmuyor.</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                    {closedIncidents.map(inc => (
                      <button
                        key={inc.id}
                        onClick={() => {
                          setSelectedChannel({ id: inc.id, name: `Arşiv: Vaka #${inc.olay_turu} (${inc.mahalle})`, type: 'Vaka', isClosed: true })
                          setMobileView('chat')
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          selectedChannel.id === inc.id
                            ? 'bg-[var(--fd-surface3)] border-[var(--fd-border)] text-[var(--fd-text)] font-bold'
                            : 'bg-[var(--fd-surface)] border-[var(--fd-border)]/40 hover:border-[var(--fd-border)] text-[var(--fd-text3)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Lock className="w-3.5 h-3.5 text-[var(--fd-text3)] shrink-0" />
                          <div className="truncate">
                            <span className="text-xs block truncate font-semibold">{inc.olay_turu}</span>
                            <span className="text-[9px] block text-[var(--fd-text3)] truncate">{inc.mahalle} Mah.</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-[var(--fd-surface2)] border border-[var(--fd-border)]/50 px-1 rounded text-[var(--fd-text3)]">Arşiv</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category 4: Closed mission channels (Archive) */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--fd-text3)] tracking-wider px-2">🗄️ KAPATILMIŞ GÖREV ARŞİVİ (SALT OKUNUR)</span>
                {loadingChannels ? null : closedMissions.length === 0 ? (
                  <div className="py-2 text-center text-xs text-[var(--fd-text3)]">Görev arşiv kaydı bulunmuyor.</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                    {closedMissions.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedChannel({ id: m.id, name: `Arşiv Görev: ${m.baslik} (${m.gorev_turu})`, type: 'Görev', isClosed: true })
                          setMobileView('chat')
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          selectedChannel.id === m.id
                            ? 'bg-[var(--fd-surface3)] border-[var(--fd-border)] text-[var(--fd-text)] font-bold'
                            : 'bg-[var(--fd-surface)] border-[var(--fd-border)]/40 hover:border-[var(--fd-border)] text-[var(--fd-text3)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Lock className="w-3.5 h-3.5 text-[var(--fd-text3)] shrink-0" />
                          <div className="truncate">
                            <span className="text-xs block truncate font-semibold">{m.baslik}</span>
                            <span className="text-[9px] block text-[var(--fd-text3)] truncate">{m.gorev_turu}</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-[var(--fd-surface2)] border border-[var(--fd-border)]/50 px-1 rounded text-[var(--fd-text3)]">Arşiv</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* RIGHT MESSAGE LOGS & CHAT WINDOW (SAĞ PANEL) */}
          <div className={`lg:col-span-8 flex flex-col border border-[var(--fd-border)] bg-[var(--fd-surface)] shadow-[var(--fd-shadow-sm)] rounded-[var(--fd-r)] overflow-hidden min-h-[300px] lg:min-h-[500px] max-h-[calc(100vh-21rem)] lg:max-h-[calc(100vh-14rem)] ${
            mobileView === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}>
            
            {/* Header info */}
            <div className="border-b border-[var(--fd-border)] bg-[var(--fd-surface2)]/50 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {/* Back Button on Mobile */}
                <button
                  onClick={() => setMobileView('channels')}
                  className="lg:hidden p-1.5 rounded-lg bg-[var(--fd-surface2)] border border-[var(--fd-border)] text-[var(--fd-text2)] hover:text-[var(--fd-text)] mr-2 shrink-0 cursor-pointer"
                  title="Kanallara Dön"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedChannel.isClosed ? 'bg-[var(--fd-text3)]' : 'bg-[var(--fd-accent)] animate-pulse'}`} />
                <h3 className="font-bold text-[var(--fd-text)] truncate text-sm md:text-base">{selectedChannel.name}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedChannel.isClosed ? (
                  <Badge className="bg-[var(--fd-surface2)] border-[var(--fd-border)] text-[var(--fd-text2)] flex items-center gap-1 text-[10px]">
                    <Lock className="w-3 h-3" /> Salt Okunur Mod
                  </Badge>
                ) : (
                  <Badge className="bg-[var(--fd-accent)]/15 border-[var(--fd-accent)]/20 text-[var(--fd-accent)] flex items-center gap-1 text-[10px]">
                    <Unlock className="w-3 h-3" /> Canlı Kanal
                  </Badge>
                )}
                {selectedChannel.isClosed && (
                  <button
                    onClick={handlePrintJurnal}
                    className="px-2.5 py-1 text-[10px] font-bold bg-[var(--fd-accent)]/10 hover:bg-[var(--fd-accent)]/20 border border-[var(--fd-accent)]/30 text-[var(--fd-accent)] rounded cursor-pointer transition-all flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" /> PDF Jurnali Bas
                  </button>
                )}
              </div>
            </div>

            {/* Chat Stream Window */}
            <div 
              ref={chatContainerRef}
              onScroll={handleScroll}
              className="flex-1 p-4 overflow-y-auto space-y-3 bg-[var(--fd-surface2)]/10 scrollbar-thin"
            >
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-[var(--fd-text2)] gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--fd-accent)]" />
                  <span className="text-xs">Muhabere logları yükleniyor...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-[var(--fd-text3)] gap-2">
                  <Radio className="w-8 h-8 opacity-20" />
                  <span className="text-xs font-mono">TELSİZ MANDALI AÇIK - SES KAYDI YOK</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isCurrentUser = msg.gonderen_personel_id === personnelUuid
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col max-w-[85%] ${isCurrentUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      {/* Name, Rank & Time */}
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--fd-text2)] mb-1 px-1">
                        <User className="w-3 h-3 text-[var(--fd-accent)]" />
                        <span className="font-semibold">{msg.gonderen_ad_soyad}</span>
                        <span className="text-[var(--fd-text3)]">({msg.gonderen_rutbe})</span>
                        <Clock className="w-3 h-3 text-[var(--fd-text3)] ml-1" />
                        <span className="text-[var(--fd-text3)]">{new Date(msg.created_at).toLocaleTimeString('tr-TR')}</span>
                      </div>

                      {/* Bubble content */}
                      <div 
                        className={`rounded-xl px-3 py-2.5 text-sm border shadow-[var(--fd-shadow-sm)] ${
                          isCurrentUser 
                            ? 'bg-[var(--fd-accent)]/10 border-[var(--fd-accent)]/20 text-[var(--fd-text)] rounded-tr-none'
                            : 'bg-[var(--fd-surface2)] border border-[var(--fd-border)]/70 text-[var(--fd-text2)] rounded-tl-none'
                        }`}
                      >
                        {/* Radio Code badge if present */}
                        {msg.telsiz_kodu && (
                          <div className="mb-1 flex">
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-[var(--fd-accent)]/15 text-[var(--fd-accent)] border border-[var(--fd-accent)]/25 px-1.5 py-0.5 rounded">
                              📟 {msg.telsiz_kodu}
                            </span>
                          </div>
                        )}
                        <p className="font-mono leading-relaxed whitespace-pre-wrap">{msg.mesaj_metni}</p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* QUICK ACTIONS BUTTONS & WRITING PANEL */}
            {selectedChannel.isClosed ? (
              <div className="bg-[var(--fd-surface2)]/50 border-t border-[var(--fd-border)] p-4 flex items-center justify-center gap-2 text-[var(--fd-text3)] bg-gradient-to-r from-transparent to-[var(--fd-amber)]/5">
                <AlertTriangle className="w-4 h-4 text-[var(--fd-amber)]" />
                <span className="text-xs font-mono uppercase tracking-wider text-[var(--fd-amber)]/85">Bu vaka kapatılmıştır. Kanal salt okunur moddadır.</span>
              </div>
            ) : (
              <div className="bg-[var(--fd-surface)] border-t border-[var(--fd-border)] p-3 space-y-3">
                
                {/* HIZLI TELSİZ KOD BUTONLARI */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] font-bold text-[var(--fd-text3)] mr-1 uppercase">HIZLI KOD:</span>
                  <button
                    onClick={() => handleSendMessage("Anlaşıldı, tamam.", "ANLASILDI")}
                    disabled={sendingMessage || !personnelUuid}
                    className="px-2.5 py-1 text-xs bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] hover:border-[var(--fd-accent)]/40 text-[var(--fd-accent)] rounded-lg cursor-pointer transition-all font-mono font-bold"
                  >
                    📟 Anlaşıldı
                  </button>
                  <button
                    onClick={() => handleSendMessage("Müfrezeden vaka yerine intikal başladı, tamam.", "INTIKAL")}
                    disabled={sendingMessage || !personnelUuid}
                    className="px-2.5 py-1 text-xs bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] hover:border-[var(--fd-accent)]/40 text-[var(--fd-accent)] rounded-lg cursor-pointer transition-all font-mono font-bold"
                  >
                    🚒 İntikal / Çıkış
                  </button>
                  <button
                    onClick={() => handleSendMessage("Olay yerine ulaşıldı, yangına müdahale başladı, tamam.", "VARIS")}
                    disabled={sendingMessage || !personnelUuid}
                    className="px-2.5 py-1 text-xs bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] hover:border-[var(--fd-accent)]/40 text-[var(--fd-accent)] rounded-lg cursor-pointer transition-all font-mono font-bold"
                  >
                    🔥 Olay Yerine Varış
                  </button>
                  <button
                    onClick={() => handleSendMessage("Merkez, acil su tankeri takviyesi sevk edin, tamam.", "SU_TAKVIYESI")}
                    disabled={sendingMessage || !personnelUuid}
                    className="px-2.5 py-1 text-xs bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] hover:border-[var(--fd-accent)]/40 text-[var(--fd-accent)] rounded-lg cursor-pointer transition-all font-mono font-bold"
                  >
                    💧 Su Takviyesi
                  </button>
                  <button
                    onClick={() => handleSendMessage("Yangın kontrol altına alındı, soğutma başladı, tamam.", "KONTROL")}
                    disabled={sendingMessage || !personnelUuid}
                    className="px-2.5 py-1 text-xs bg-[var(--fd-surface2)] hover:bg-[var(--fd-surface3)] border border-[var(--fd-border)] hover:border-[var(--fd-accent)]/40 text-[var(--fd-accent)] rounded-lg cursor-pointer transition-all font-mono font-bold"
                  >
                    🟢 Kontrol Altında
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSirenSound()
                      handleSendMessage("🚨 ACİL DURUM İKAZI! İvedi koordinasyon sağlayın, tamam.", "ACIL_DURUM")
                    }}
                    disabled={sendingMessage || !personnelUuid}
                    className="px-2.5 py-1 text-xs bg-[var(--fd-danger)]/10 hover:bg-[var(--fd-danger)]/20 border border-[var(--fd-danger)]/30 hover:border-[var(--fd-danger)] text-[var(--fd-danger)] rounded-lg cursor-pointer transition-all font-mono font-bold flex items-center gap-1"
                  >
                    🚨 Acil Durum İkazı
                  </button>
                </div>

                {/* WRITER INPUT AREA */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage(inputText)
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Mandalı basmak için mesajınızı yazın... (Enter veya Gönder)"
                    disabled={sendingMessage}
                    className="flex-1 rounded-xl border border-[var(--fd-border)] bg-[var(--fd-surface2)] px-4 py-2 text-sm text-[var(--fd-text)] placeholder-[var(--fd-text3)] focus:border-[var(--fd-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !inputText.trim() || !personnelUuid}
                    className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold p-2 px-4 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>

              </div>
            )}

          </div>

        </div>

        </>
        )}

      </div>
    </PageGuard>
  )
}
