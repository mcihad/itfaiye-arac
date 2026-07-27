"use client"

import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Loader2, Upload, FileText, X, CheckCircle } from 'lucide-react'
import { api, unwrap } from '@/lib/api'

interface ImportPdfModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function ImportPdfModal({ onClose, onSuccess }: ImportPdfModalProps) {
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  
  // Basic Fields
  const [olayTuru, setOlayTuru] = useState('Yangın')
  const [tarih, setTarih] = useState('')
  const [mahalle, setMahalle] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0]
      if (selected.type !== 'application/pdf') {
        alert("Lütfen sadece PDF dosyası yükleyin.")
        return
      }
      setFile(selected)
    }
  }

  const handleImport = async () => {
    if (!file || !tarih || !mahalle) {
      alert("Lütfen tüm alanları doldurun ve bir PDF dosyası seçin.")
      return
    }

    setLoading(true)
    try {
      // 1. Create Incident (Status: closed)
      const payload = {
        olay_turu: olayTuru,
        mahalle: mahalle,
        adres: "Eski Kayıt",
        ihbar_saati: new Date(tarih).toISOString(),
        cikis_saati: new Date(tarih).toISOString(),
        varis_saati: new Date(tarih).toISOString(),
        donus_saati: new Date(tarih).toISOString(),
        status: 'closed', // It's an old report
        aciklama: 'Eski EK-16 PDF Aktarımı',
        location: `POINT(37.0 39.7)`, // Default coordinates
      }
      
      const { data: incData, error: incErr } = await api.insert('incidents', payload)
      if (incErr) throw incErr

      const incidentId = incData.id

      // 2. Upload PDF
      const mFormData = new FormData()
      mFormData.append('file', file)
      mFormData.append('folder', 'incidents')

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: mFormData
      })
      const uploadResult = await res.json()
      
      if (!res.ok || uploadResult.error) {
        throw new Error(uploadResult.error || "Dosya yüklenemedi")
      }

      // 3. Save to incident_media
      unwrap(await api.insert('incident_media', [{
        incident_id: incidentId,
        url: uploadResult.url,
        tip: 'pdf'
      }]))

      onSuccess()
    } catch (err: any) {
      console.error("İçe aktarma hatası:", err)
      alert("Hata oluştu: " + (err.message || "Bilinmeyen hata"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <Card className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden">
        <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-[var(--fd-accent)]" />
            <CardTitle className="text-base font-bold text-[var(--fd-text)]">
              Eski Rapor İçe Aktar
            </CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        
        <CardContent className="p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Olay Tarihi ve Saati *</label>
              <Input 
                type="datetime-local" 
                value={tarih}
                onChange={e => setTarih(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            
            <div>
              <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Olay Türü *</label>
              <select 
                value={olayTuru} 
                onChange={(e) => setOlayTuru(e.target.value)}
                className="flex h-9 w-full rounded-[var(--fd-r-sm)] border border-[var(--fd-border-strong)] bg-[var(--fd-surface2)] px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--fd-text3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fd-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="Yangın">Yangın</option>
                <option value="Trafik Kazası">Trafik Kazası</option>
                <option value="Kurtarma">Kurtarma</option>
                <option value="Su Baskını">Su Baskını</option>
                <option value="Diğer">Diğer</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Mahalle / Konum *</label>
              <Input 
                placeholder="Örn: Kılavuz Mah." 
                value={mahalle}
                onChange={e => setMahalle(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="pt-2">
              <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">EK-16 Taranmış Dosya (PDF) *</label>
              <div className="border-2 border-dashed border-[var(--fd-border-strong)] rounded-[var(--fd-r-sm)] p-4 text-center hover:bg-[var(--fd-surface2)]/50 transition">
                <input 
                  type="file" 
                  accept=".pdf,application/pdf"
                  className="hidden" 
                  id="pdf-upload"
                  onChange={handleFileChange}
                />
                <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-2">
                  <div className="p-2 bg-[var(--fd-surface3)] rounded-full">
                    <FileText className="w-5 h-5 text-[var(--fd-text2)]" />
                  </div>
                  {file ? (
                    <span className="text-xs font-semibold text-[var(--fd-success)] flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> {file.name}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--fd-text2)] font-medium">
                      Dosya Seç veya Sürükle
                    </span>
                  )}
                </label>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-[var(--fd-border)]">
            <Button variant="outline" size="sm" onClick={onClose} disabled={loading} className="h-9">
              İptal
            </Button>
            <Button 
              size="sm" 
              onClick={handleImport} 
              disabled={loading || !file || !tarih || !mahalle}
              className="bg-[var(--fd-accent)] hover:opacity-90 text-white h-9"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Kaydediliyor</>
              ) : (
                <><Upload className="w-4 h-4 mr-1.5" /> İçe Aktar</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
