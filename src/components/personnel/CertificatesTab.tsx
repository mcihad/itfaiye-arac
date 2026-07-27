"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { FileText, Plus, Trash2, Edit2, Download, Upload, CheckCircle, Loader2, X, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from "@/lib/toast"

interface CertificatesTabProps {
  sicilNo: string
}

export function CertificatesTab({ sicilNo }: CertificatesTabProps) {
  const [certificates, setCertificates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  
  const [tip, setTip] = useState('')
  const [gecerlilikTarihi, setGecerlilikTarihi] = useState('')
  const [belgeNo, setBelgeNo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchCertificates()
  }, [sicilNo])

  const fetchCertificates = async () => {
    setLoading(true)
    try {
      const { data } = await api.from('staff_certifications').select('*').eq('sicil_no', sicilNo).order('gecerlilik_tarihi', { ascending: false })
      if (data) {
        setCertificates(data)
      }
    } catch (err) {
      console.error("Sertifika getirme hatası:", err)
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setTip('')
    setGecerlilikTarihi('')
    setBelgeNo('')
    setFile(null)
    setIsEditing(false)
    setCurrentId(null)
    setIsModalOpen(true)
  }

  const openEditModal = (cert: any) => {
    setTip(cert.tip || '')
    setGecerlilikTarihi(cert.gecerlilik_tarihi ? new Date(cert.gecerlilik_tarihi).toISOString().split('T')[0] : '')
    setBelgeNo(cert.belge_no || '')
    setFile(null)
    setIsEditing(true)
    setCurrentId(cert.id)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bu belgeyi silmek istediğinize emin misiniz?")) return
    try {
      const { error } = await api.remove('staff_certifications', { id })
      if (error) throw error
      setCertificates(prev => prev.filter(c => c.id !== id))
    } catch (err: any) {
      toast("Silme hatası: " + err.message)
    }
  }

  const handleSave = async () => {
    if (!tip || !gecerlilikTarihi) {
      toast("Sertifika Türü ve Geçerlilik Tarihi zorunludur.")
      return
    }

    setSaving(true)
    try {
      let uploadedUrl = ''

      // Dosya seçildiyse yükle
      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', 'certificates')

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })
        const uploadResult = await res.json()
        
        if (!res.ok || uploadResult.error) {
          throw new Error(uploadResult.error || "Dosya yüklenemedi")
        }
        uploadedUrl = uploadResult.url
      }

      const payload: any = {
        sicil_no: sicilNo,
        tip,
        gecerlilik_tarihi: gecerlilikTarihi,
        belge_no: belgeNo,
      }

      if (uploadedUrl) {
        payload.belge_url = uploadedUrl
      }

      if (isEditing && currentId) {
        const { error } = await api.update('staff_certifications', payload, { id: currentId })
        if (error) throw error
      } else {
        const { error } = await api.insert('staff_certifications', payload)
        if (error) throw error
      }

      setIsModalOpen(false)
      fetchCertificates()
    } catch (err: any) {
      toast("Kaydetme hatası: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--fd-accent)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--fd-text)]">Sertifikalar ve Belgeler</h3>
        <Button 
          onClick={openAddModal} 
          size="sm"
          className="bg-[var(--fd-accent)] hover:opacity-90 text-white font-bold text-xs h-9 px-3 rounded-[var(--fd-r-sm)] shadow-[var(--fd-shadow-sm)]"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Yeni Ekle
        </Button>
      </div>

      {certificates.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-[var(--fd-border)] rounded-[var(--fd-r)] text-[var(--fd-text3)] bg-[var(--fd-surface2)]/30 font-semibold">
          Henüz eklenmiş bir sertifika / belge bulunmuyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certificates.map(cert => (
            <Card key={cert.id} className="bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-sm)] hover:border-[var(--fd-accent)]/40 transition-colors">
              <CardContent className="p-4 flex flex-col justify-between h-full gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--fd-surface2)] border border-[var(--fd-border)] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-[var(--fd-text2)]" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[var(--fd-text)] text-sm">{cert.tip}</h4>
                    {cert.belge_no && (
                      <p className="text-xs text-[var(--fd-text3)] font-mono mt-0.5">No: {cert.belge_no}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={new Date(cert.gecerlilik_tarihi) < new Date() ? 'danger' : 'success'} className="text-[10px]">
                        Son Geçerlilik: {new Date(cert.gecerlilik_tarihi).toLocaleDateString('tr-TR')}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--fd-border)]/50 mt-auto">
                  {cert.belge_url ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.open(cert.belge_url, '_blank')}
                      className="text-xs h-8 px-3 border-[var(--fd-border)] text-[var(--fd-info)] hover:bg-[rgba(37,99,235,0.08)] rounded-[var(--fd-r-sm)]"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Görüntüle
                    </Button>
                  ) : (
                    <span className="text-xs text-[var(--fd-text3)] italic">Dijital kopya yok</span>
                  )}
                  
                  <div className="flex items-center gap-1.5">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => openEditModal(cert)}
                      className="h-8 w-8 text-[var(--fd-text2)] hover:text-[var(--fd-accent)] hover:bg-[var(--fd-surface2)] rounded-[var(--fd-r-sm)]"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(cert.id)}
                      className="h-8 w-8 text-[var(--fd-text2)] hover:text-[var(--fd-danger)] hover:bg-[rgba(220,38,38,0.08)] rounded-[var(--fd-r-sm)]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="w-full max-w-md bg-[var(--fd-surface)] border border-[var(--fd-border)] rounded-[var(--fd-r)] shadow-[var(--fd-shadow-lg)] overflow-hidden">
            <CardHeader className="bg-[var(--fd-surface2)]/40 border-b border-[var(--fd-border)] p-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold text-[var(--fd-text)]">
                {isEditing ? 'Sertifikayı Düzenle' : 'Yeni Sertifika İçe Aktar'}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)} disabled={saving} className="text-[var(--fd-text3)] hover:text-[var(--fd-text)]">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              
              <div>
                <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Sertifika / Belge Türü *</label>
                <Input 
                  placeholder="Örn: İlk Yardım Sertifikası" 
                  value={tip}
                  onChange={e => setTip(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Belge No (Opsiyonel)</label>
                <Input 
                  placeholder="Örn: IY-2024-105" 
                  value={belgeNo}
                  onChange={e => setBelgeNo(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Geçerlilik Tarihi *</label>
                <Input 
                  type="date" 
                  value={gecerlilikTarihi}
                  onChange={e => setGecerlilikTarihi(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--fd-text2)] mb-1 block">Taranmış Dosya (PDF/Resim)</label>
                <div className="border-2 border-dashed border-[var(--fd-border-strong)] rounded-[var(--fd-r-sm)] p-4 text-center hover:bg-[var(--fd-surface2)]/50 transition">
                  <input 
                    type="file" 
                    accept=".pdf,image/*"
                    className="hidden" 
                    id="cert-upload"
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFile(e.target.files[0])
                      }
                    }}
                  />
                  <label htmlFor="cert-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="p-2 bg-[var(--fd-surface3)] rounded-full">
                      <Upload className="w-5 h-5 text-[var(--fd-text2)]" />
                    </div>
                    {file ? (
                      <span className="text-xs font-semibold text-[var(--fd-success)] flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {file.name}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--fd-text2)] font-medium">
                        {isEditing ? "Yeni dosya seç (Mevcut dosyayı değiştirir)" : "Dosya Seç veya Sürükle"}
                      </span>
                    )}
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-[var(--fd-border)]">
                <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)} disabled={saving} className="h-9 text-xs">
                  İptal
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSave} 
                  disabled={saving || !tip || !gecerlilikTarihi}
                  className="bg-[var(--fd-accent)] hover:opacity-90 text-white h-9 text-xs"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Kaydediliyor</>
                  ) : (
                    <>Kaydet</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
