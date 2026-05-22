"use client"

import React, { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { COMPARTMENT_NAMES } from "@/lib/constants"
import { 
  Activity, 
  Compass, 
  Layers, 
  Zap, 
  Wrench, 
  Droplet, 
  Flame, 
  Hammer, 
  Maximize, 
  Gauge, 
  FolderOpen,
  Box,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Radio,
  Eye,
  RefreshCw
} from "lucide-react"

export interface ThreeSceneProps {
  compartmentKeys: string[];
  activeCompartment: string | null;
  onSelect: (key: string) => void;
  vehicleType?: string;
  className?: string;
}

// Tactical Icon Mapping for SVG overlay nodes
const TACTICAL_ICONS: Record<string, React.ComponentType<any>> = {
  kabin_ici: Compass,
  arac_ici: Layers,
  sol_on_kapak: Zap,
  sol_orta_kapak: Wrench,
  sol_arka_kapak: Droplet,
  sag_on_kapak: Flame,
  sag_orta_kapak: Hammer,
  sag_arka_kapak: Activity,
  arac_ustu: Maximize,
  arka_bolme: Gauge,
  arka_kapak: FolderOpen,
  sol_dolap: Box,
  sag_dolap: Box,
  bagaj_ici: Box,
  kasa_ici: Layers,
};

export function Vehicle3DSchematic({
  compartmentKeys,
  activeCompartment,
  onSelect,
  vehicleType,
  className
}: ThreeSceneProps) {
  // Sol/Sağ profile selection
  const [profile, setProfile] = useState<"sol" | "sag">("sol")
  const [hudActive, setHudActive] = useState<boolean>(true)
  const [radarPulse, setRadarPulse] = useState<number>(0)

  // Listen and sync profile from active compartment selection
  useEffect(() => {
    if (!activeCompartment) return
    if (activeCompartment.startsWith("sag_") || activeCompartment === "sag_dolap") {
      setProfile("sag")
    } else if (activeCompartment.startsWith("sol_") || activeCompartment === "sol_dolap") {
      setProfile("sol")
    }
  }, [activeCompartment])

  // Radar pulse animation simulator
  useEffect(() => {
    const timer = setInterval(() => {
      setRadarPulse(p => (p + 1) % 100)
    }, 100)
    return () => clearInterval(timer)
  }, [])

  // Helper to check if a compartment key is active or has issue
  const getCompStatus = (key: string) => {
    const isActive = activeCompartment === key
    const isAvailable = compartmentKeys.includes(key)
    return { isActive, isAvailable }
  }

  // Active compartment side name
  const sideLabel = profile === "sol" ? "SOL PROFİL (GARAJI)" : "SAĞ PROFİL (GARAJI)"

  // Handle Hotspot clicks
  const handleHotspotClick = (key: string) => {
    if (compartmentKeys.includes(key)) {
      onSelect(key)
    }
  }

  // Get active key based on profile for dynamic shutters
  const getShutterKey = (position: "on" | "orta" | "arka") => {
    return profile === "sol" ? `sol_${position}_kapak` : `sag_${position}_kapak`
  }

  const activeShutterOn = getShutterKey("on")
  const activeShutterOrta = getShutterKey("orta")
  const activeShutterArka = getShutterKey("arka")

  const onStatus = getCompStatus(activeShutterOn)
  const ortaStatus = getCompStatus(activeShutterOrta)
  const arkaStatus = getCompStatus(activeShutterArka)
  const kabinStatus = getCompStatus("kabin_ici")
  const ustuStatus = getCompStatus("arac_ustu")
  const iciStatus = getCompStatus("arac_ici")
  const arkaBolmeStatus = getCompStatus("arka_bolme")
  const arkaKapakStatus = getCompStatus("arka_kapak")

  // Generate glowing outline or fill color
  const getColors = (status: { isActive: boolean; isAvailable: boolean }) => {
    if (!status.isAvailable) return { fill: "rgba(15, 23, 42, 0.4)", stroke: "rgba(100, 116, 139, 0.2)", glow: "" }
    if (status.isActive) {
      return {
        fill: "rgba(34, 197, 94, 0.18)",
        stroke: "#22c55e",
        glow: "url(#glow-green)"
      }
    }
    return {
      fill: "rgba(6, 182, 212, 0.04)",
      stroke: "rgba(6, 182, 212, 0.5)",
      glow: "url(#glow-cyan)"
    }
  }

  return (
    <div className={cn("w-full flex flex-col xl:flex-row gap-5 p-4 rounded-xl border border-cyan-500/10 bg-slate-950/80 backdrop-blur-xl select-none text-slate-100", className)}>
      
      {/* 1. SOL PANEL: Taktiksel Telemetri & Profil Kontrolü */}
      <div className="w-full xl:w-72 shrink-0 flex flex-col justify-between border border-cyan-500/10 rounded-lg p-4 bg-slate-950/90 relative overflow-hidden">
        {/* Cyber Glass effect background lines */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.04] pointer-events-none" />
        
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="font-mono text-xs font-bold tracking-widest text-cyan-400">HUD GARAJI v23.3</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[9px] text-emerald-400 font-bold">GRID LOCK</span>
            </div>
          </div>

          {/* Profil Switcher */}
          <div className="space-y-2 mb-5">
            <label className="font-mono text-[10px] text-slate-500 font-bold tracking-wider uppercase block">AKTİF LOJİSTİK PROFİLİ</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setProfile("sol")}
                className={cn(
                  "py-2 px-3 rounded font-mono text-xs font-bold border transition-all flex items-center justify-center gap-1.5",
                  profile === "sol"
                    ? "bg-cyan-500/15 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                )}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>SOL PROFiL</span>
              </button>
              <button
                onClick={() => setProfile("sag")}
                className={cn(
                  "py-2 px-3 rounded font-mono text-xs font-bold border transition-all flex items-center justify-center gap-1.5",
                  profile === "sag"
                    ? "bg-cyan-500/15 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                )}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>SAĞ PROFiL</span>
              </button>
            </div>
          </div>

          {/* Telemetri List */}
          <div className="space-y-3 font-mono text-[11px]">
            <div className="border border-slate-900 rounded p-2.5 bg-slate-950/60 space-y-2">
              <div className="flex justify-between items-center text-slate-400">
                <span>ARAÇ TİPİ:</span>
                <span className="text-slate-200 font-bold">{vehicleType || "Taktiksel Arazöz"}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>AKTİF PROFiL:</span>
                <span className="text-cyan-400 font-bold">{profile.toUpperCase()} GÖRÜNÜM</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>SİNYAL SEVİYESİ:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  100% (STABİL)
                </span>
              </div>
            </div>

            {/* Fictional Neon Progress Bars for Military feel */}
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>SU DEPOSU SEVİYESİ</span>
                  <span className="text-cyan-400">8.500 LT (%85)</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded" style={{ width: "85%" }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>KÖPÜK TANKI KAPASİTESİ</span>
                  <span className="text-emerald-400">1.200 LT (%92)</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded" style={{ width: "92%" }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>SAYILAN BÖLME</span>
                  <span className="text-yellow-500">{compartmentKeys.length} / 11 MÜHÜRLÜ</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded" style={{ width: `${(compartmentKeys.length / 11) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Interactive HUD Switch */}
        <div className="mt-6 pt-3 border-t border-slate-900 flex justify-between items-center">
          <button
            onClick={() => setHudActive(!hudActive)}
            className={cn(
              "py-1.5 px-3 rounded font-mono text-[9px] font-bold border transition-colors flex items-center gap-1",
              hudActive ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-slate-900 border-slate-800 text-slate-500"
            )}
          >
            <Eye className="w-3 h-3" />
            HUD AKTİF
          </button>
          
          <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-mono">
            <RefreshCw className="w-3 h-3 text-cyan-500 animate-spin" style={{ animationDuration: '4s' }} />
            <span>RADAR TARANIYOR</span>
          </div>
        </div>
      </div>

      {/* 2. SAĞ PANEL: İnteraktif SVG Şeması */}
      <div className="flex-1 bg-slate-950 border border-cyan-500/10 rounded-lg relative overflow-hidden flex items-center justify-center p-3 select-none min-h-[300px] sm:min-h-[380px] lg:min-h-[420px]">
        {/* Cyber Holographic Grid */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.06] pointer-events-none" />
        
        {/* Glowing Radar Sweep Ring Background */}
        <div className="absolute w-[400px] h-[400px] rounded-full border border-cyan-500/5 animate-pulse opacity-40 flex items-center justify-center pointer-events-none">
          <div className="w-[300px] h-[300px] rounded-full border border-cyan-500/5" />
          <div className="w-[200px] h-[200px] rounded-full border border-cyan-500/5" />
        </div>

        {/* CRT Scanline Filter Overlay */}
        <div className="absolute inset-0 bg-scanline pointer-events-none opacity-[0.02]" />

        {/* Master Interactive SVG */}
        <svg
          viewBox="0 0 800 360"
          className="w-full h-auto max-w-[760px] relative z-10 filter drop-shadow-[0_0_15px_rgba(6,182,212,0.05)]"
        >
          {/* DEFINITIONS FOR GRADIENTS AND GLOWS */}
          <defs>
            {/* Hologram glass gradient */}
            <linearGradient id="cyber-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(15, 23, 42, 0.9)" />
              <stop offset="100%" stopColor="rgba(8, 12, 24, 0.95)" />
            </linearGradient>
            
            {/* Shutter carbon fiber pattern */}
            <pattern id="shutter-pattern" width="8" height="6" patternUnits="userSpaceOnUse">
              <line x1="0" y1="1" x2="8" y2="1" stroke="rgba(6, 182, 212, 0.15)" strokeWidth="1" />
              <line x1="0" y1="4" x2="8" y2="4" stroke="rgba(15, 23, 42, 0.7)" strokeWidth="1" />
            </pattern>

            {/* Cyber Grid background */}
            <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(6, 182, 212, 0.08)" strokeWidth="1" />
            </pattern>

            {/* Glowing filter for active compartments (Cyan) */}
            <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Glowing filter for selected compartment (Green) */}
            <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Warning yellow lines pattern */}
            <pattern id="hazard-pattern" width="20" height="20" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(234, 179, 8, 0.4)" strokeWidth="8" />
              <line x1="10" y1="0" x2="10" y2="20" stroke="rgba(15, 23, 42, 0.9)" strokeWidth="10" />
            </pattern>
          </defs>

          {/* 2.1 TELEMETRY FRAME CORNERS */}
          {hudActive && (
            <g className="opacity-40">
              <path d="M 20 40 L 20 20 L 40 20" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
              <path d="M 780 40 L 780 20 L 760 20" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
              <path d="M 20 320 L 20 340 L 40 340" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
              <path d="M 780 320 L 780 340 L 760 340" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
              
              {/* Horizontal grid markings */}
              <line x1="50" y1="20" x2="750" y2="20" stroke="rgba(6, 182, 212, 0.15)" strokeWidth="1" strokeDasharray="5,15" />
              <line x1="50" y1="340" x2="750" y2="340" stroke="rgba(6, 182, 212, 0.15)" strokeWidth="1" strokeDasharray="5,15" />
            </g>
          )}

          {/* 2.2 TACTICAL HUD INFO STRIPS */}
          {hudActive && (
            <g className="font-mono text-[9px] fill-cyan-400/60 select-none">
              <text x="30" y="32" className="font-bold fill-cyan-400 uppercase tracking-widest">{sideLabel}</text>
              <text x="770" y="32" textAnchor="end" className="fill-emerald-400 font-bold">SECURE NETWORK COMMS: 100%</text>
              <text x="30" y="333" className="fill-slate-500">SİVAS BELEDİYESİ İTFAİYE BİLGİ HUD SİSTEMİ</text>
              <text x="770" y="333" textAnchor="end" className="fill-slate-500">SYS_STATUS: ACTIVE_OK</text>
            </g>
          )}

          {/* 2.3 VECTOR FIRE TRUCK SCHEMATIC OUTLINE */}
          <g transform="translate(0, 20)">
            {/* Ground grid shadow effect */}
            <ellipse cx="380" cy="285" rx="340" ry="12" fill="rgba(8, 12, 24, 0.8)" filter="blur(6px)" />
            <ellipse cx="380" cy="285" rx="300" ry="6" fill="rgba(6, 182, 212, 0.1)" />

            {/* Rear bumper structure */}
            <path d="M 38,245 L 30,245 L 30,265 L 38,265 Z" fill="rgba(71, 85, 105, 0.9)" stroke="#64748b" strokeWidth="1" />
            
            {/* Top water cannon nozzle */}
            <path d="M 480,85 L 510,50 L 530,50 L 525,58 L 500,85 Z" fill="#1e293b" stroke="#06b6d4" strokeWidth="1.5" />
            <line x1="530" y1="50" x2="570" y2="45" stroke="#22c55e" strokeWidth="2" strokeDasharray="4,4" className="animate-pulse" />
            <circle cx="570" cy="45" r="4" fill="rgba(34, 197, 94, 0.4)" className="animate-ping" />
            <circle cx="570" cy="45" r="2" fill="#22c55e" />

            {/* Top roof ladder */}
            <rect x="150" y="65" width="310" height="15" rx="2" fill="rgba(15, 23, 42, 0.8)" stroke="rgba(6, 182, 212, 0.5)" strokeWidth="1.2" />
            {/* Ladder steps */}
            {Array.from({ length: 18 }).map((_, idx) => (
              <line key={idx} x1={165 + idx * 16} y1="65" x2={165 + idx * 16} y2="80" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1" />
            ))}

            {/* MAIN VEHICLE SHIELD BODY */}
            <path
              d="
                M 80,105 
                L 490,105 
                L 500,85 
                L 645,85 
                L 690,150 
                L 705,185 
                L 705,245 
                L 660,245 
                C 655,215 605,215 600,245 
                L 395,245 
                C 390,215 340,215 335,245 
                L 280,245 
                C 275,215 225,215 220,245 
                L 80,245 
                Z
              "
              fill="url(#cyber-glass)"
              stroke="rgba(6, 182, 212, 0.4)"
              strokeWidth="2"
            />

            {/* Sleek cyber glass highlights */}
            <path d="M 85,110 L 485,110 L 495,90 L 640,90" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="2" />

            {/* High-visibility retroreflective warning panel (Arka Gövde Çizgileri) */}
            <rect x="80" y="112" width="10" height="128" fill="url(#hazard-pattern)" />

            {/* Front windshield panel (Cyan glowing cyber style) */}
            <path
              d="M 625,92 L 642,92 L 675,145 L 625,145 Z"
              fill="rgba(6, 182, 212, 0.15)"
              stroke="#06b6d4"
              strokeWidth="1.5"
              filter="drop-shadow(0 0 4px rgba(6,182,212,0.25))"
            />
            {/* Windshield glare line */}
            <line x1="645" y1="96" x2="630" y2="135" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

            {/* Cyber Side Windshield (Kabin camı) */}
            <path
              d="M 545,92 L 615,92 L 615,145 L 545,145 Z"
              fill="rgba(6, 182, 212, 0.1)"
              stroke="rgba(6, 182, 212, 0.5)"
              strokeWidth="1.2"
            />

            {/* Front headlamp glow */}
            <polygon points="705,188 718,188 718,202 705,202" fill="#eab308" filter="drop-shadow(0 0 5px #eab308)" />
            <polygon points="705,206 718,206 718,218 705,218" fill="#eab308" />
            <polygon points="718,188 760,175 760,225 718,218" fill="rgba(234, 179, 8, 0.05)" />

            {/* Front heavy bumper */}
            <path d="M 705,225 L 722,225 L 722,250 L 705,250 Z" fill="#475569" stroke="#64748b" strokeWidth="1.5" />
            {/* Warning yellow lines on bumper */}
            <line x1="708" y1="230" x2="719" y2="245" stroke="#eab308" strokeWidth="1.5" />
            <line x1="713" y1="230" x2="721" y2="241" stroke="#eab308" strokeWidth="1.5" />

            {/* Blue Siren light on cab roof */}
            <path d="M 525,83 L 535,83 L 532,74 L 528,74 Z" fill="#3b82f6" filter="drop-shadow(0 0 8px #3b82f6)" />
            <circle cx="530" cy="78" r="8" fill="rgba(59, 130, 246, 0.25)" className="animate-ping" style={{ animationDuration: '2s' }} />

            {/* Red Siren light on rear body */}
            <path d="M 125,103 L 135,103 L 132,95 L 128,95 Z" fill="#ef4444" filter="drop-shadow(0 0 8px #ef4444)" />
            <circle cx="130" cy="99" r="8" fill="rgba(239, 68, 68, 0.25)" className="animate-ping" style={{ animationDuration: '3s' }} />

            {/* 2.4 DETAILED WHEELS (Lastikler) */}
            {/* Rear wheel 1 */}
            <g transform="translate(250, 245)">
              <circle cx="0" cy="0" r="32" fill="#090d16" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="2.5" />
              <circle cx="0" cy="0" r="22" fill="#1e293b" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" />
              <circle cx="0" cy="0" r="12" fill="#090d16" stroke="rgba(6, 182, 212, 0.5)" strokeWidth="1" />
              {/* Rim holes */}
              {Array.from({ length: 6 }).map((_, i) => (
                <circle key={i} cx={Math.cos((i * Math.PI) / 3) * 16} cy={Math.sin((i * Math.PI) / 3) * 16} r="2.5" fill="#475569" />
              ))}
            </g>

            {/* Rear wheel 2 */}
            <g transform="translate(365, 245)">
              <circle cx="0" cy="0" r="32" fill="#090d16" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="2.5" />
              <circle cx="0" cy="0" r="22" fill="#1e293b" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" />
              <circle cx="0" cy="0" r="12" fill="#090d16" stroke="rgba(6, 182, 212, 0.5)" strokeWidth="1" />
              {/* Rim holes */}
              {Array.from({ length: 6 }).map((_, i) => (
                <circle key={i} cx={Math.cos((i * Math.PI) / 3) * 16} cy={Math.sin((i * Math.PI) / 3) * 16} r="2.5" fill="#475569" />
              ))}
            </g>

            {/* Front wheel */}
            <g transform="translate(628, 245)">
              <circle cx="0" cy="0" r="32" fill="#090d16" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="2.5" />
              <circle cx="0" cy="0" r="22" fill="#1e293b" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" />
              <circle cx="0" cy="0" r="12" fill="#090d16" stroke="rgba(6, 182, 212, 0.5)" strokeWidth="1" />
              {/* Rim holes */}
              {Array.from({ length: 6 }).map((_, i) => (
                <circle key={i} cx={Math.cos((i * Math.PI) / 3) * 16} cy={Math.sin((i * Math.PI) / 3) * 16} r="2.5" fill="#475569" />
              ))}
            </g>

            {/* Decorative decals on cabin door */}
            <text x="560" y="165" fill="rgba(6, 182, 212, 0.35)" fontSize="7" fontFamily="monospace" fontWeight="bold" letterSpacing="1">SİVAS İTFAİYESİ</text>
            <text x="560" y="174" fill="rgba(6, 182, 212, 0.2)" fontSize="6" fontFamily="monospace" letterSpacing="0.5">FILO NO: 58-AC</text>

            {/* 2.5 INTERACTIVE HOTSPOT OVERLAYS (COMPARTMENTS) */}
            
            {/* A. ARAÇ ÜSTÜ HOTSPOT */}
            <g
              onClick={() => handleHotspotClick("arac_ustu")}
              className={cn("cursor-pointer transition-all duration-300", ustuStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="145"
                y="35"
                width="320"
                height="28"
                rx="4"
                fill={getColors(ustuStatus).fill}
                stroke={getColors(ustuStatus).stroke}
                strokeWidth={ustuStatus.isActive ? 2 : 1}
                filter={getColors(ustuStatus).glow}
              />
              {/* Interactive Diagonal Strips when active */}
              {ustuStatus.isActive && (
                <g opacity="0.3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <line key={i} x1={155 + i * 26} y1="35" x2={165 + i * 26} y2="63" stroke="#22c55e" strokeWidth="2" />
                  ))}
                </g>
              )}
            </g>

            {/* B. ARKA KAPAK (At the very rear shutter) */}
            <g
              onClick={() => handleHotspotClick("arka_kapak")}
              className={cn("cursor-pointer transition-all duration-300", arkaKapakStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="45"
                y="115"
                width="30"
                height="125"
                rx="2"
                fill={getColors(arkaKapakStatus).fill}
                stroke={getColors(arkaKapakStatus).stroke}
                strokeWidth={arkaKapakStatus.isActive ? 2 : 1}
                filter={getColors(arkaKapakStatus).glow}
              />
              {/* Shutter doors texture */}
              <rect x="47" y="117" width="26" height="121" fill="url(#shutter-pattern)" opacity="0.45" />
            </g>

            {/* C. ARKA BÖLME (Rear compartment gate) */}
            <g
              onClick={() => handleHotspotClick("arka_bolme")}
              className={cn("cursor-pointer transition-all duration-300", arkaBolmeStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="85"
                y="115"
                width="50"
                height="125"
                rx="3"
                fill={getColors(arkaBolmeStatus).fill}
                stroke={getColors(arkaBolmeStatus).stroke}
                strokeWidth={arkaBolmeStatus.isActive ? 2 : 1}
                filter={getColors(arkaBolmeStatus).glow}
              />
              {/* Shutter doors texture */}
              <rect x="88" y="118" width="44" height="119" fill="url(#shutter-pattern)" opacity="0.35" />
            </g>

            {/* D. ARKA KAPAK (Sol/Sağ Arka Shutter) */}
            <g
              onClick={() => handleHotspotClick(activeShutterArka)}
              className={cn("cursor-pointer transition-all duration-300", arkaStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="145"
                y="115"
                width="105"
                height="125"
                rx="3"
                fill={getColors(arkaStatus).fill}
                stroke={getColors(arkaStatus).stroke}
                strokeWidth={arkaStatus.isActive ? 2.2 : 1}
                filter={getColors(arkaStatus).glow}
              />
              {/* Roll Shutter Slats */}
              <rect x="149" y="119" width="97" height="117" fill="url(#shutter-pattern)" opacity="0.75" />
              {/* Door locking mechanism line */}
              <line x1="145" y1="178" x2="250" y2="178" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1" />
              <circle cx="197" cy="178" r="3" fill="rgba(6, 182, 212, 0.8)" />
            </g>

            {/* E. ORTA KAPAK (Sol/Sağ Orta Shutter) */}
            <g
              onClick={() => handleHotspotClick(activeShutterOrta)}
              className={cn("cursor-pointer transition-all duration-300", ortaStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="260"
                y="115"
                width="105"
                height="125"
                rx="3"
                fill={getColors(ortaStatus).fill}
                stroke={getColors(ortaStatus).stroke}
                strokeWidth={ortaStatus.isActive ? 2.2 : 1}
                filter={getColors(ortaStatus).glow}
              />
              {/* Roll Shutter Slats */}
              <rect x="264" y="119" width="97" height="117" fill="url(#shutter-pattern)" opacity="0.75" />
              {/* Door locking mechanism line */}
              <line x1="260" y1="178" x2="365" y2="178" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1" />
              <circle cx="312" cy="178" r="3" fill="rgba(6, 182, 212, 0.8)" />
            </g>

            {/* F. ÖN KAPAK (Sol/Sağ Ön Shutter) */}
            <g
              onClick={() => handleHotspotClick(activeShutterOn)}
              className={cn("cursor-pointer transition-all duration-300", onStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="375"
                y="115"
                width="105"
                height="125"
                rx="3"
                fill={getColors(onStatus).fill}
                stroke={getColors(onStatus).stroke}
                strokeWidth={onStatus.isActive ? 2.2 : 1}
                filter={getColors(onStatus).glow}
              />
              {/* Roll Shutter Slats */}
              <rect x="379" y="119" width="97" height="117" fill="url(#shutter-pattern)" opacity="0.75" />
              {/* Door locking mechanism line */}
              <line x1="375" y1="178" x2="480" y2="178" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1" />
              <circle cx="427" cy="178" r="3" fill="rgba(6, 182, 212, 0.8)" />
            </g>

            {/* G. KABİN İÇİ (Cabin Interior) */}
            <g
              onClick={() => handleHotspotClick("kabin_ici")}
              className={cn("cursor-pointer transition-all duration-300", kabinStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="490"
                y="115"
                width="155"
                height="125"
                rx="5"
                fill={getColors(kabinStatus).fill}
                stroke={getColors(kabinStatus).stroke}
                strokeWidth={kabinStatus.isActive ? 2 : 1}
                filter={getColors(kabinStatus).glow}
              />
              {/* Steering wheel vector representation */}
              <circle cx="610" cy="165" r="9" fill="none" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="2" />
              <line x1="610" y1="156" x2="610" y2="174" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1.5" />
              <line x1="601" y1="165" x2="619" y2="165" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1.5" />
            </g>

            {/* H. ARAÇ İÇİ (Under chassis/interior) */}
            <g
              onClick={() => handleHotspotClick("arac_ici")}
              className={cn("cursor-pointer transition-all duration-300", iciStatus.isAvailable ? "opacity-100" : "opacity-35")}
            >
              <rect
                x="145"
                y="247"
                width="335"
                height="8"
                rx="1.5"
                fill={getColors(iciStatus).fill}
                stroke={getColors(iciStatus).stroke}
                strokeWidth={iciStatus.isActive ? 1.5 : 1}
                filter={getColors(iciStatus).glow}
              />
            </g>

            {/* 2.6 PULSING NEON NODE TARGETS ON SELECTED COMPARTMENTS */}
            
            {/* Araç Üstü Indicator */}
            {ustuStatus.isAvailable && (
              <g transform="translate(305, 49)" className="pointer-events-none">
                <circle cx="0" cy="0" r={ustuStatus.isActive ? 10 : 7} fill="none" stroke={ustuStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={ustuStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="3" fill={ustuStatus.isActive ? "#22c55e" : "#06b6d4"} className={ustuStatus.isActive ? "animate-pulse" : ""} />
                {ustuStatus.isActive && <circle cx="0" cy="0" r="16" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.8s' }} />}
              </g>
            )}

            {/* Arka Kapak Indicator */}
            {arkaKapakStatus.isAvailable && (
              <g transform="translate(60, 178)" className="pointer-events-none">
                <circle cx="0" cy="0" r={arkaKapakStatus.isActive ? 9 : 7} fill="none" stroke={arkaKapakStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={arkaKapakStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="3" fill={arkaKapakStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {arkaKapakStatus.isActive && <circle cx="0" cy="0" r="16" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.8s' }} />}
              </g>
            )}

            {/* Arka Bölme Indicator */}
            {arkaBolmeStatus.isAvailable && (
              <g transform="translate(110, 178)" className="pointer-events-none">
                <circle cx="0" cy="0" r={arkaBolmeStatus.isActive ? 9 : 7} fill="none" stroke={arkaBolmeStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={arkaBolmeStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="3" fill={arkaBolmeStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {arkaBolmeStatus.isActive && <circle cx="0" cy="0" r="16" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.8s' }} />}
              </g>
            )}

            {/* Arka Kapak Shutter Indicator */}
            {arkaStatus.isAvailable && (
              <g transform="translate(197, 178)" className="pointer-events-none">
                <circle cx="0" cy="0" r={arkaStatus.isActive ? 11 : 8} fill="none" stroke={arkaStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={arkaStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="4" fill={arkaStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {arkaStatus.isActive && <circle cx="0" cy="0" r="18" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.6s' }} />}
              </g>
            )}

            {/* Orta Shutter Indicator */}
            {ortaStatus.isAvailable && (
              <g transform="translate(312, 178)" className="pointer-events-none">
                <circle cx="0" cy="0" r={ortaStatus.isActive ? 11 : 8} fill="none" stroke={ortaStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={ortaStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="4" fill={ortaStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {ortaStatus.isActive && <circle cx="0" cy="0" r="18" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.6s' }} />}
              </g>
            )}

            {/* Ön Shutter Indicator */}
            {onStatus.isAvailable && (
              <g transform="translate(427, 178)" className="pointer-events-none">
                <circle cx="0" cy="0" r={onStatus.isActive ? 11 : 8} fill="none" stroke={onStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={onStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="4" fill={onStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {onStatus.isActive && <circle cx="0" cy="0" r="18" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.6s' }} />}
              </g>
            )}

            {/* Kabin İçi Indicator */}
            {kabinStatus.isAvailable && (
              <g transform="translate(565, 178)" className="pointer-events-none">
                <circle cx="0" cy="0" r={kabinStatus.isActive ? 10 : 7} fill="none" stroke={kabinStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={kabinStatus.isActive ? 2 : 1} />
                <circle cx="0" cy="0" r="3" fill={kabinStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {kabinStatus.isActive && <circle cx="0" cy="0" r="16" fill="none" stroke="#22c55e" strokeWidth="0.8" className="animate-ping" style={{ animationDuration: '1.8s' }} />}
              </g>
            )}

            {/* Araç İçi Indicator */}
            {iciStatus.isAvailable && (
              <g transform="translate(312, 251)" className="pointer-events-none">
                <circle cx="0" cy="0" r={iciStatus.isActive ? 8 : 6} fill="none" stroke={iciStatus.isActive ? "#22c55e" : "#06b6d4"} strokeWidth={iciStatus.isActive ? 1.5 : 1} />
                <circle cx="0" cy="0" r="2.5" fill={iciStatus.isActive ? "#22c55e" : "#06b6d4"} />
                {iciStatus.isActive && <circle cx="0" cy="0" r="12" fill="none" stroke="#22c55e" strokeWidth="0.6" className="animate-ping" style={{ animationDuration: '2s' }} />}
              </g>
            )}

            {/* 2.7 HIGH END TACTICAL LASER LEADER LINES FOR ACTIVE COMPARTMENT */}
            {hudActive && activeCompartment && (
              <g>
                {/* Dynamically draw glowing cyber line from active centroid to telemetry boxes */}
                {(() => {
                  let startX = 0, startY = 0, labelX = 0, labelY = 0, align: "left" | "right" = "left";
                  const name = (COMPARTMENT_NAMES[activeCompartment] || activeCompartment).toUpperCase();

                  if (activeCompartment === "arac_ustu") {
                    startX = 305; startY = 49; labelX = 305 + 80; labelY = 49 - 25; align = "left";
                  } else if (activeCompartment === "arka_kapak") {
                    startX = 60; startY = 178; labelX = 60 - 30; labelY = 178 - 60; align = "right";
                  } else if (activeCompartment === "arka_bolme") {
                    startX = 110; startY = 178; labelX = 110 - 60; labelY = 178 - 60; align = "right";
                  } else if (activeCompartment === activeShutterArka) {
                    startX = 197; startY = 178; labelX = 197 - 70; labelY = 178 - 70; align = "right";
                  } else if (activeCompartment === activeShutterOrta) {
                    startX = 312; startY = 178; labelX = 312 - 70; labelY = 178 - 70; align = "right";
                  } else if (activeCompartment === activeShutterOn) {
                    startX = 427; startY = 178; labelX = 427 + 70; labelY = 178 - 70; align = "left";
                  } else if (activeCompartment === "kabin_ici") {
                    startX = 565; startY = 178; labelX = 565 + 75; labelY = 178 - 70; align = "left";
                  } else if (activeCompartment === "arac_ici") {
                    startX = 312; startY = 251; labelX = 312 + 80; labelY = 251 + 30; align = "left";
                  } else {
                    return null; // Don't draw leader lines for unmapped/hidden keys
                  }

                  const midX = startX + (align === "left" ? 15 : -15);
                  const midY = startY - (activeCompartment === "arac_ici" ? -15 : 15);

                  return (
                    <g>
                      {/* Laser pointer line */}
                      <path
                        d={`M ${startX},${startY} L ${midX},${midY} L ${labelX},${labelY}`}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1.2"
                        filter="drop-shadow(0 0 3px rgba(34,197,94,0.6))"
                      />
                      
                      {/* End node bracket anchor */}
                      <circle cx={startX} cy={startY} r="1.5" fill="#22c55e" />
                      
                      {/* Callout box overlay */}
                      <g transform={`translate(${align === "left" ? labelX : labelX - 110}, ${labelY - 12})`}>
                        {/* Box background with high glassmorphism */}
                        <rect
                          x="0"
                          y="0"
                          width="120"
                          height="26"
                          rx="3"
                          fill="rgba(8, 12, 24, 0.95)"
                          stroke="#22c55e"
                          strokeWidth="1"
                          filter="drop-shadow(0 0 8px rgba(34,197,94,0.15))"
                        />
                        {/* Decorative glowing cyan bullet */}
                        <circle cx="8" cy="13" r="2.5" fill="#22c55e" className="animate-pulse" />
                        
                        {/* Shutter key texts */}
                        <text x="18" y="10" fill="#22c55e" fontSize="7.5" fontFamily="monospace" fontWeight="bold">{name}</text>
                        <text x="18" y="20" fill="rgba(34, 197, 94, 0.75)" fontSize="6" fontFamily="monospace" letterSpacing="0.5">HEARTBEAT LOCK_SECURED</text>
                      </g>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* Radar scanner sweep laser effect */}
            {hudActive && (
              <g>
                <line
                  x1={radarPulse * 8}
                  y1="25"
                  x2={radarPulse * 8}
                  y2="280"
                  stroke="rgba(6, 182, 212, 0.08)"
                  strokeWidth="2"
                />
                <line
                  x1={radarPulse * 8 + 3}
                  y1="25"
                  x2={radarPulse * 8 + 3}
                  y2="280"
                  stroke="rgba(6, 182, 212, 0.04)"
                  strokeWidth="1"
                />
              </g>
            )}
          </g>
        </svg>

        {/* Floating cyber lock details */}
        {activeCompartment && (
          <div className="absolute top-4 right-4 bg-slate-950/90 border border-green-500/30 rounded px-2.5 py-1.5 font-mono text-[9px] text-green-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(34,197,94,0.1)] z-20">
            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
            <span>SEÇİLİ BÖLME KİLİTLENDİ: [{(COMPARTMENT_NAMES[activeCompartment] || activeCompartment).toUpperCase()}]</span>
          </div>
        )}
      </div>

    </div>
  )
}
