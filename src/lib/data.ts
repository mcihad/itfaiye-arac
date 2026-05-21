import { Vehicle, Personnel, MaintenanceLog, FuelLog, TaskLog } from "@/types";

export const mockVehicles: Vehicle[] = [
  {
    plaka: "58 ACT 367",
    aracTipi: "Arazöz",
    arac_tipi: "Arazöz",
    marka: "S-A1",
    aktifPersonel: ["Mustafa Köse", "Onurcan Kaya"],
    km: 78420,
    motorSaatiPTO: 2145,
    durum: "aktif",
    sigortaBitis: "2026-11-20",
    muayeneBitis: "2026-08-15",
    istasyon: "Merkez İstasyonu",
    yil: 2018,
    model: "Ford Cargo 2533",
    bolmeler: {
      kabin_ici: [
        { malzeme: "Kriko", adet: 1, durum: "Tam" },
        { malzeme: "Lastik Şişirme Aparatı", adet: 1, durum: "Tam" },
        { malzeme: "Çeki Demiri", adet: 1, durum: "Tam" },
        { malzeme: "Şarjlı Projektör", adet: 1, durum: "Tam" }
      ],
      sag_on_kapak: [
        { malzeme: "Ayaklı Aydınlatma Lambası", adet: 1, durum: "Tam" },
        { malzeme: "Jeneratör", adet: 1, durum: "Tam" },
        { malzeme: "Hidrolik Güç Ünitesi", adet: 1, durum: "Tam" },
        { malzeme: "Hidrolik Kesici", adet: 1, durum: "Tam" },
        { malzeme: "Hidrolik Ayırıcı", adet: 2, durum: "Tam" }
      ],
      sol_arka_kapak: [
        { malzeme: "85'lik Hortum", adet: 5, durum: "Tam" },
        { malzeme: "85'lik Turbo Lans", adet: 2, durum: "Tam" },
        { malzeme: "85'lik Kollu Lans", adet: 2, durum: "Tam" },
        { malzeme: "Ağır Köpük Lansı", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 TH 256",
    aracTipi: "Hızlı Müdahale",
    arac_tipi: "Hızlı Müdahale",
    marka: "S-M1",
    aktifPersonel: ["Melih Arslan", "Selahattin Tosun"],
    km: 45230,
    motorSaatiPTO: 1287,
    durum: "aktif",
    sigortaBitis: "2026-09-15",
    muayeneBitis: "2026-07-20",
    istasyon: "Merkez İstasyonu",
    yil: 2020,
    model: "Mercedes Atego 1530",
    bolmeler: {
      sol_on_kapak: [
        { malzeme: "Holmatro Güç Ünitesi", adet: 1, durum: "Tam" },
        { malzeme: "Holmatro Kesici", adet: 1, durum: "Tam" },
        { malzeme: "Holmatro Ayırıcı", adet: 1, durum: "Tam" },
        { malzeme: "Hilti", adet: 2, durum: "Eksik - 1 adet var" },
        { malzeme: "Amir Baltası", adet: 1, durum: "Tam" }
      ],
      sol_arka_kapak: [
        { malzeme: "85'lik Hortum", adet: 5, durum: "Tam" },
        { malzeme: "85'lik Turbo Lans", adet: 2, durum: "Tam" },
        { malzeme: "Ala Hortum Süzgeci", adet: 1, durum: "Kayıp/Yok" },
        { malzeme: "Hava Yastığı (Pompa Üzeri)", adet: 4, durum: "Tam" }
      ],
      arac_ustu: [
        { malzeme: "Alıcı Hortum", adet: 2, durum: "Tam" },
        { malzeme: "Dalgıç Pompa", adet: 1, durum: "Tam" },
        { malzeme: "Seyyar Merdiven", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 TH 257",
    aracTipi: "Kurtarma",
    arac_tipi: "Kurtarma",
    marka: "S-K1",
    aktifPersonel: ["İsmail Aslan", "Muhammed Enes Yıldırım"],
    km: 32150,
    motorSaatiPTO: 940,
    durum: "aktif",
    sigortaBitis: "2026-10-10",
    muayeneBitis: "2026-05-12",
    istasyon: "Merkez İstasyonu",
    yil: 2021,
    model: "Mercedes Atego 1629 Arama-Kurtarma",
    bolmeler: {
      sol_on_kapak: [
        { malzeme: "Kaşık Sedye", adet: 1, durum: "Tam" },
        { malzeme: "Tripot", adet: 1, durum: "Tam" },
        { malzeme: "Jeneratör", adet: 3, durum: "Tam" },
        { malzeme: "Kıyma Makinesi Açma Aparatları", adet: 1, durum: "Tam" }
      ],
      sol_orta_kapak: [
        { malzeme: "Hidrolik El Manueli ve Hortumu", adet: 1, durum: "Tam" },
        { malzeme: "Manuel Kapı Açma", adet: 1, durum: "Tam" },
        { malzeme: "Cam Kırma Aparatı", adet: 1, durum: "Tam" }
      ],
      sol_arka_kapak: [
        { malzeme: "Beton Kesme Motoru", adet: 1, durum: "Tam" },
        { malzeme: "Kıvılcımsız Testere", adet: 1, durum: "Tam" },
        { malzeme: "Trifor ve Halatı", adet: 1, durum: "Tam" }
      ],
      sag_on_kapak: [
        { malzeme: "Holmatro Ayırma Şarjlı", adet: 1, durum: "Tam" },
        { malzeme: "Holmatro Kesici Şarjlı", adet: 1, durum: "Tam" },
        { malzeme: "Tahta Takoz", adet: 4, durum: "Ek Not" },
        { malzeme: "Sapan", adet: 1, durum: "Ek Not" }
      ]
    }
  },
  {
    plaka: "58 AEH 221",
    aracTipi: "Merdivenli",
    arac_tipi: "Merdivenli",
    marka: "S-M2",
    aktifPersonel: ["Uğur Budak", "Mustafa Demir"],
    km: 18400,
    motorSaatiPTO: 450,
    durum: "aktif",
    sigortaBitis: "2026-12-01",
    muayeneBitis: "2026-11-15",
    istasyon: "Merkez İstasyonu",
    yil: 2022,
    model: "MAN TGS 33.400 42M",
    bolmeler: {
      arac_ici: [
        { malzeme: "El Feneri", adet: 3, durum: "Tam" },
        { malzeme: "Yangın Battaniyesi", adet: 1, durum: "Tam" },
        { malzeme: "Yaralı Sabitleme Sargısı", adet: 2, durum: "Tam" }
      ],
      sag_on_kapak: [
        { malzeme: "6 KG YSK Tüpü", adet: 2, durum: "Tam" },
        { malzeme: "Temiz Hava Solunum Cihazı", adet: 2, durum: "Tam" }
      ],
      sol_on_kapak: [
        { malzeme: "Büyük Amir Baltası", adet: 1, durum: "Tam" },
        { malzeme: "Büyük Balta", adet: 1, durum: "Tam" },
        { malzeme: "Duba", adet: 2, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 FP 968",
    aracTipi: "Arazöz",
    arac_tipi: "Arazöz",
    marka: "S-A2",
    aktifPersonel: ["Muhammed Yasir İnce", "Muhammed Kara"],
    km: 145000,
    motorSaatiPTO: 5600,
    durum: "aktif",
    sigortaBitis: "2026-06-25",
    muayeneBitis: "2026-03-10",
    istasyon: "Fatih İstasyonu",
    yil: 2012,
    model: "BMC Fatih Arazöz",
    bolmeler: {
      sol_on_kapak: [
        { malzeme: "Kazma", adet: 1, durum: "Tam" },
        { malzeme: "Kürek", adet: 3, durum: "Tam" },
        { malzeme: "Tank Isıtma Kablosu", adet: 1, durum: "Tam" }
      ],
      sol_arka_kapak: [
        { malzeme: "Daraltma", adet: 1, durum: "Tam" },
        { malzeme: "Demir Kesme Makası", adet: 1, durum: "Tam" },
        { malzeme: "T Anahtarı", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 SC 112",
    aracTipi: "Lojistik",
    arac_tipi: "Lojistik",
    marka: "S-T1",
    aktifPersonel: ["Fatih Güler"],
    km: 62100,
    motorSaatiPTO: 1420,
    durum: "aktif",
    sigortaBitis: "2026-10-22",
    muayeneBitis: "2026-09-12",
    istasyon: "Merkez İstasyonu",
    yil: 2019,
    model: "Mercedes Axor 3240 Su Tankeri",
    bolmeler: {
      kabin_ici: [
        { malzeme: "İlk Yardım Çantası", adet: 1, durum: "Tam" },
        { malzeme: "El Feneri", adet: 2, durum: "Tam" }
      ],
      arka_bolme: [
        { malzeme: "85'lik Hortum", adet: 4, durum: "Tam" },
        { malzeme: "Alıcı Hortum Süzgeci", adet: 1, durum: "Tam" },
        { malzeme: "85'lik Kollu Lans", adet: 2, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 TZ 310",
    aracTipi: "Merdivenli",
    arac_tipi: "Merdivenli",
    marka: "S-M3",
    aktifPersonel: ["Hasan Çınar Kuzu"],
    km: 84300,
    motorSaatiPTO: 2310,
    durum: "aktif",
    sigortaBitis: "2026-05-30",
    muayeneBitis: "2026-04-18",
    istasyon: "Fatih İstasyonu",
    yil: 2017,
    model: "Iveco Eurocargo 160E30 30M",
    bolmeler: {
      sag_dolap: [
        { malzeme: "Temiz Hava Solunum Cihazı", adet: 2, durum: "Tam" },
        { malzeme: "SCBA Maskesi", adet: 2, durum: "Tam" }
      ],
      sol_dolap: [
        { malzeme: "Büyük Balta", adet: 1, durum: "Tam" },
        { malzeme: "Kurtarma Kemeri", adet: 4, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 TC 911",
    aracTipi: "Kurtarma",
    arac_tipi: "Kurtarma",
    marka: "S-K2",
    aktifPersonel: ["Sencer Yıldız"],
    km: 24500,
    motorSaatiPTO: 380,
    durum: "aktif",
    sigortaBitis: "2026-12-15",
    muayeneBitis: "2026-11-20",
    istasyon: "Merkez İstasyonu",
    yil: 2022,
    model: "Ford Ranger 4x4 Arama Kurtarma",
    bolmeler: {
      bagaj_ici: [
        { malzeme: "Jeneratör", adet: 1, durum: "Tam" },
        { malzeme: "Motorlu Testere", adet: 1, durum: "Tam" },
        { malzeme: "Şerit Bariyer", adet: 2, durum: "Tam" },
        { malzeme: "Şarjlı Projektör", adet: 2, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 FD 580",
    aracTipi: "Arazöz",
    arac_tipi: "Arazöz",
    marka: "S-A3",
    aktifPersonel: ["Abdullah Übeyde Özkur"],
    km: 39800,
    motorSaatiPTO: 890,
    durum: "aktif",
    sigortaBitis: "2026-08-04",
    muayeneBitis: "2026-07-28",
    istasyon: "Fatih İstasyonu",
    yil: 2018,
    model: "Isuzu NPR Dar Alan Arazözü",
    bolmeler: {
      sol_dolap: [
        { malzeme: "85'lik Hortum", adet: 3, durum: "Tam" },
        { malzeme: "85'lik Turbo Lans", adet: 1, durum: "Tam" }
      ],
      sag_dolap: [
        { malzeme: "İlk Yardım Çantası", adet: 1, durum: "Tam" },
        { malzeme: "Yangın Battaniyesi", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 KC 440",
    aracTipi: "Lojistik",
    arac_tipi: "Lojistik",
    marka: "S-L1",
    aktifPersonel: ["Kadir Kuru"],
    km: 112000,
    motorSaatiPTO: 0,
    durum: "aktif",
    sigortaBitis: "2026-07-15",
    muayeneBitis: "2026-06-10",
    istasyon: "Merkez İstasyonu",
    yil: 2015,
    model: "BMC Megastar Lojistik",
    bolmeler: {
      kasa_ici: [
        { malzeme: "Duba", adet: 10, durum: "Tam" },
        { malzeme: "Emniyet Şeridi", adet: 5, durum: "Tam" },
        { malzeme: "Sedyeler", adet: 3, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 AA 112",
    aracTipi: "Kurtarma",
    arac_tipi: "Kurtarma",
    marka: "S-K3",
    aktifPersonel: ["Emir Furkan Taşdelen"],
    km: 15400,
    motorSaatiPTO: 210,
    durum: "aktif",
    sigortaBitis: "2026-09-08",
    muayeneBitis: "2026-08-30",
    istasyon: "Merkez İstasyonu",
    yil: 2021,
    model: "Mercedes Sprinter KBRN Müdahale",
    bolmeler: {
      kabin_ici: [
        { malzeme: "KBRN Gaz Maskesi", adet: 6, durum: "Tam" },
        { malzeme: "Gaz Dedektörü", adet: 2, durum: "Tam" }
      ],
      arka_bolme: [
        { malzeme: "KBRN Koruyucu Elbise (A Tipi)", adet: 4, durum: "Tam" },
        { malzeme: "KBRN Koruyucu Elbise (B Tipi)", adet: 4, durum: "Tam" },
        { malzeme: "Dekontaminasyon Çadırı", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 TT 500",
    aracTipi: "Arazöz",
    arac_tipi: "Arazöz",
    marka: "S-A4",
    aktifPersonel: ["Mustafa Metin Bıçakcigil"],
    km: 56300,
    motorSaatiPTO: 1680,
    durum: "aktif",
    sigortaBitis: "2026-11-12",
    muayeneBitis: "2026-10-05",
    istasyon: "Fatih İstasyonu",
    yil: 2020,
    model: "Mercedes Atego 1530 Arazöz",
    bolmeler: {
      sol_dolap: [
        { malzeme: "85'lik Hortum", adet: 6, durum: "Tam" },
        { malzeme: "85'lik Turbo Lans", adet: 2, durum: "Tam" }
      ],
      sag_dolap: [
        { malzeme: "Temiz Hava Solunum Cihazı", adet: 2, durum: "Tam" },
        { malzeme: "Jeneratör", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 TR 600",
    aracTipi: "Hızlı Müdahale",
    arac_tipi: "Hızlı Müdahale",
    marka: "S-M4",
    aktifPersonel: [],
    km: 34200,
    motorSaatiPTO: 490,
    durum: "aktif",
    sigortaBitis: "2026-10-18",
    muayeneBitis: "2026-09-22",
    istasyon: "Merkez İstasyonu",
    yil: 2021,
    model: "Volkswagen Amarok Müdahale",
    bolmeler: {
      kasa_ici: [
        { malzeme: "UHP Yüksek Basınçlı Lans", adet: 1, durum: "Tam" },
        { malzeme: "İlk Yardım Çantası", adet: 1, durum: "Tam" },
        { malzeme: "Şarjlı Projektör", adet: 2, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 FF 911",
    aracTipi: "Lojistik",
    arac_tipi: "Lojistik",
    marka: "S-T2",
    aktifPersonel: [],
    km: 98000,
    motorSaatiPTO: 2800,
    durum: "pasif",
    sigortaBitis: "2026-04-12",
    muayeneBitis: "2026-03-01",
    istasyon: "Fatih İstasyonu",
    yil: 2018,
    model: "MAN TGS 10 Tonluk Su Tankeri",
    bolmeler: {
      arka_bolme: [
        { malzeme: "85'lik Hortum", adet: 6, durum: "Tam" },
        { malzeme: "Alıcı Hortum", adet: 4, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 YC 780",
    aracTipi: "Arazöz",
    arac_tipi: "Arazöz",
    marka: "S-A5",
    aktifPersonel: [],
    km: 74200,
    motorSaatiPTO: 1950,
    durum: "aktif",
    sigortaBitis: "2026-08-30",
    muayeneBitis: "2026-07-15",
    istasyon: "Merkez İstasyonu",
    yil: 2016,
    model: "Mercedes Axor Köpük Arazözü",
    bolmeler: {
      sol_dolap: [
        { malzeme: "Ağır Köpük Lansı", adet: 2, durum: "Tam" },
        { malzeme: "Orta Köpük Lansı", adet: 1, durum: "Tam" },
        { malzeme: "85'lik Hortum", adet: 4, durum: "Tam" }
      ],
      sag_dolap: [
        { malzeme: "Köpük Melanjörü", adet: 1, durum: "Tam" },
        { malzeme: "Köpük Sıvısı Bidonu", adet: 4, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 BD 150",
    aracTipi: "Kurtarma",
    arac_tipi: "Kurtarma",
    marka: "S-K4",
    aktifPersonel: [],
    km: 41200,
    motorSaatiPTO: 1150,
    durum: "bakimda",
    sigortaBitis: "2026-12-10",
    muayeneBitis: "2026-11-28",
    istasyon: "Merkez İstasyonu",
    yil: 2019,
    model: "Mercedes Unimog U4023 Arama Kurtarma",
    bolmeler: {
      kasa_ici: [
        { malzeme: "Ön Vinç Çelik Halatı", adet: 1, durum: "Tam" },
        { malzeme: "Trifor", adet: 1, durum: "Tam" },
        { malzeme: "Jeneratör", adet: 1, durum: "Tam" },
        { malzeme: "Hidrolik Kesici", adet: 1, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 KM 330",
    aracTipi: "Merdivenli",
    arac_tipi: "Merdivenli",
    marka: "S-M5",
    aktifPersonel: [],
    km: 12500,
    motorSaatiPTO: 310,
    durum: "aktif",
    sigortaBitis: "2027-02-15",
    muayeneBitis: "2027-01-20",
    istasyon: "Merkez İstasyonu",
    yil: 2023,
    model: "Scania P360 54M Merdivenli",
    bolmeler: {
      sol_dolap: [
        { malzeme: "Temiz Hava Solunum Cihazı", adet: 2, durum: "Tam" },
        { malzeme: "Kurtarma Kemeri", adet: 4, durum: "Tam" }
      ],
      sag_dolap: [
        { malzeme: "Jeneratör", adet: 1, durum: "Tam" },
        { malzeme: "El Feneri", adet: 4, durum: "Tam" }
      ]
    }
  },
  {
    plaka: "58 AS 900",
    aracTipi: "Arazöz",
    arac_tipi: "Arazöz",
    marka: "S-A6",
    aktifPersonel: [],
    km: 29500,
    motorSaatiPTO: 720,
    durum: "aktif",
    sigortaBitis: "2026-10-30",
    muayeneBitis: "2026-09-18",
    istasyon: "Merkez İstasyonu",
    yil: 2022,
    model: "Volvo FMX 8x4 Devasa Arazöz",
    bolmeler: {
      sol_dolap: [
        { malzeme: "85'lik Hortum", adet: 8, durum: "Tam" },
        { malzeme: "85'lik Turbo Lans", adet: 3, durum: "Tam" }
      ],
      sag_dolap: [
        { malzeme: "Temiz Hava Solunum Cihazı", adet: 4, durum: "Tam" },
        { malzeme: "Hidrolik Ayırıcı", adet: 1, durum: "Tam" },
        { malzeme: "Amir Baltası", adet: 2, durum: "Tam" }
      ]
    }
  }
];


export const mockPersonnel: Personnel[] = [
  { sicil_no: "SB5801", ad: "İbrahim", soyad: "Alaçam", unvan: "Müdür", rol: "Admin" },
  { sicil_no: "SB5802", ad: "Seyfi Ali", soyad: "Gül", unvan: "Amir", rol: "Editor" },
  { sicil_no: "SB5803", ad: "Ahmet", soyad: "Çelimli", unvan: "Amir", rol: "Editor" },
  { sicil_no: "SB5804", ad: "Ahmet", soyad: "Yıldız", unvan: "Amir", rol: "Editor" },
  { sicil_no: "SB5805", ad: "Hidayet", soyad: "Yücekaya", unvan: "Başçavuş", rol: "Shift_Leader" },
  { sicil_no: "SB5806", ad: "Ömer", soyad: "Çakmak", unvan: "Çavuş", rol: "Shift_Leader" },
  { sicil_no: "SB5807", ad: "Abdullah Übeyde", soyad: "Özkur", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5808", ad: "Beyza", soyad: "Durak", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5809", ad: "Beyza", soyad: "Kılıç", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5810", ad: "Elif", soyad: "Tunçer", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5811", ad: "Emir Furkan", soyad: "Taşdelen", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5812", ad: "Fatih", soyad: "Güler", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5813", ad: "Fatmanur", soyad: "Kişi", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5814", ad: "Gülenay", soyad: "Koçak", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5815", ad: "Hasan Çınar", soyad: "Kuzu", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5816", ad: "İsmail", soyad: "Aslan", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5817", ad: "Kadir", soyad: "Kuru", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5818", ad: "Melih", soyad: "Arslan", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5819", ad: "Muhammed Emin", soyad: "Kara", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5820", ad: "Muhammed Enes", soyad: "Yıldırım", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5821", ad: "Muhammed", soyad: "Kara", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5822", ad: "Muhammed Yasir", soyad: "İnce", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5823", ad: "Mustafa", soyad: "Demir", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5824", ad: "Mustafa", soyad: "Köse", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5825", ad: "Mustafa Metin", soyad: "Bıçakcigil", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5826", ad: "Onurcan", soyad: "Kaya", unvan: "İtfaiye Eri / Geliştirici", rol: "Admin" },
  { sicil_no: "SB5827", ad: "Selahattin", soyad: "Tosun", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5828", ad: "Sencer", soyad: "Yıldız", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5829", ad: "Uğur", soyad: "Budak", unvan: "İtfaiye Eri", rol: "User" },
  { sicil_no: "SB5830", ad: "Yağmur", soyad: "Aydın", unvan: "İtfaiye Eri", rol: "User" }
];

// Audit Trail — Vardiya devir logları
export interface AuditLogEntry {
  id: string;
  plaka: string;
  compartmentKey: string;
  userId: string;
  userName: string;
  checkedAt: string;
  results: { malzeme: string; durum: string; note?: string }[];
  notes?: string;
}

export const mockAuditLogs: AuditLogEntry[] = [
  {
    id: "audit-001",
    plaka: "58 TH 256",
    compartmentKey: "sol_on_kapak",
    userId: "SB5804",
    userName: "Onurcan Kaya",
    checkedAt: "2026-04-16T18:00:00",
    results: [
      { malzeme: "Holmatro Güç Ünitesi", durum: "Tam" },
      { malzeme: "Holmatro Kesici", durum: "Tam" },
      { malzeme: "Holmatro Ayırıcı", durum: "Tam" },
      { malzeme: "Hilti", durum: "Eksik", note: "1 adet mevcut, 1 adet eksik. Tamire gönderildi." },
      { malzeme: "Amir Baltası", durum: "Tam" },
    ],
    notes: "Hilti motoru yanmış. Yeni sipariş verildi."
  },
  {
    id: "audit-002",
    plaka: "58 TH 256",
    compartmentKey: "sol_on_kapak",
    userId: "SB5806",
    userName: "Selahattin Tosun",
    checkedAt: "2026-04-16T08:15:00",
    results: [
      { malzeme: "Holmatro Güç Ünitesi", durum: "Tam" },
      { malzeme: "Holmatro Kesici", durum: "Tam" },
      { malzeme: "Holmatro Ayırıcı", durum: "Tam" },
      { malzeme: "Hilti", durum: "Eksik", note: "1 adet eksik" },
      { malzeme: "Amir Baltası", durum: "Tam" },
    ],
  },
  {
    id: "audit-003",
    plaka: "58 ACT 367",
    compartmentKey: "kabin_ici",
    userId: "SB5803",
    userName: "Mustafa Köse",
    checkedAt: "2026-04-16T07:45:00",
    results: [
      { malzeme: "Kriko", durum: "Tam" },
      { malzeme: "Lastik Şişirme Aparatı", durum: "Tam" },
      { malzeme: "Çeki Demiri", durum: "Tam" },
      { malzeme: "Şarjlı Projektör", durum: "Tam" },
    ],
    notes: "Tüm malzemeler eksiksiz kontrol edildi."
  },
  {
    id: "audit-004",
    plaka: "58 ACT 367",
    compartmentKey: "sag_on_kapak",
    userId: "SB5804",
    userName: "Onurcan Kaya",
    checkedAt: "2026-04-15T17:30:00",
    results: [
      { malzeme: "Ayaklı Aydınlatma Lambası", durum: "Tam" },
      { malzeme: "Jeneratör", durum: "Tam" },
      { malzeme: "Hidrolik Güç Ünitesi", durum: "Tam" },
      { malzeme: "Hidrolik Kesici", durum: "Tam" },
      { malzeme: "Hidrolik Ayırıcı", durum: "Tam" },
    ],
  },
  {
    id: "audit-005",
    plaka: "58 TH 257",
    compartmentKey: "sol_orta_kapak",
    userId: "SB5807",
    userName: "İsmail Aslan",
    checkedAt: "2026-04-15T08:00:00",
    results: [
      { malzeme: "Hidrolik El Manueli ve Hortumu", durum: "Tam" },
      { malzeme: "Manuel Kapı Açma", durum: "Tam" },
      { malzeme: "Cam Kırma Aparatı", durum: "Arızalı", note: "Cam kırma ucu kırık, yenisi gerekiyor." },
    ],
    notes: "Cam kırma aparatı arızalı, yedek depodan alınmalı."
  },
];

export const mockMaintenanceLogs: MaintenanceLog[] = [
  {
    id: "m-001",
    plaka: "58 ACT 367",
    tip: "periyodik",
    kmAt: 75000,
    ptoAt: 2000,
    aciklama: "Motor yağı ve filtre değişimi. Fren balataları kontrol edildi.",
    maliyet: 4500,
    tarih: "2026-03-10",
    yapanKisi: "Mustafa Köse"
  },
  {
    id: "m-002",
    plaka: "58 TH 256",
    tip: "ariza",
    kmAt: 44800,
    ptoAt: 1280,
    aciklama: "Pompa valfinde sızıntı tespit edildi. Conta değiştirildi.",
    maliyet: 1200,
    tarih: "2026-03-22",
    yapanKisi: "Melih Arslan"
  },
  {
    id: "m-003",
    plaka: "58 ACT 367",
    tip: "periyodik",
    kmAt: 70000,
    ptoAt: 1850,
    aciklama: "PTO 1800 saat periyodik bakımı. Hidrolik yağ değişimi yapıldı.",
    maliyet: 7800,
    tarih: "2026-01-15",
    yapanKisi: "Mustafa Köse"
  },
  {
    id: "m-004",
    plaka: "58 TH 256",
    tip: "revizyon",
    kmAt: 40000,
    ptoAt: 1100,
    aciklama: "Şanzıman revizyonu. Debriyaj seti komple değiştirildi.",
    maliyet: 18500,
    tarih: "2025-11-05",
    yapanKisi: "Selahattin Tosun"
  }
];

export const mockFuelLogs: FuelLog[] = [
  {
    id: "f-001",
    plaka: "58 ACT 367",
    litre: 120,
    tutar: 5040,
    kmAt: 78200,
    istasyon: "Sivas Belediye Akaryakıt",
    tarih: "2026-04-14",
    kayitEden: "Mustafa Köse"
  },
  {
    id: "f-002",
    plaka: "58 TH 256",
    litre: 85,
    tutar: 3570,
    kmAt: 45100,
    istasyon: "Sivas Belediye Akaryakıt",
    tarih: "2026-04-13",
    kayitEden: "Melih Arslan"
  },
  {
    id: "f-003",
    plaka: "58 ACT 367",
    litre: 130,
    tutar: 5460,
    kmAt: 77500,
    istasyon: "Sivas Belediye Akaryakıt",
    tarih: "2026-04-05",
    kayitEden: "Onurcan Kaya"
  },
  {
    id: "f-004",
    plaka: "58 TH 256",
    litre: 90,
    tutar: 3780,
    kmAt: 44600,
    istasyon: "Petrol Ofisi Kaleardı",
    tarih: "2026-03-28",
    kayitEden: "Selahattin Tosun"
  }
];

export const mockTaskLogs: TaskLog[] = [
  {
    id: "t-001",
    plaka: "58 ACT 367",
    tip: "gunluk_kontrol",
    checklist: [
      { label: "Araç motor yağ seviyesi ve radyatör suyu kontrolü yapıldı", checked: true },
    ],
    durum: "tamamlandi",
    atanan: "Mustafa Köse",
    tarih: "2026-04-17",
    notlar: "Motor yağı ve radyatör suyu normal seviyede. Günlük şoför görevi tamam."
  },
  {
    id: "t-002",
    plaka: "58 ACT 367",
    tip: "envanter_sayim",
    checklist: [
      { label: "Sağ ön kapaktaki tüm malzemeler barkodla okutularak tam olduğu teyit edildi", checked: true },
    ],
    durum: "tamamlandi",
    atanan: "Ömer Çakmak",
    tarih: "2026-04-17",
    tamamlanmaTarihi: "2026-04-17T11:30:00"
  },
  {
    id: "t-003",
    plaka: "58 TH 256",
    tip: "devir_teslim", // Haftalık mekanik bakım map to devir_teslim or custom
    checklist: [
      { label: "Merdiven hidrolik sistem sızdırmazlık kontrolü ve yağlama işlemi yapıldı", checked: false },
      { label: "Sistem fotoğrafları rapora eklendi", checked: false },
    ],
    durum: "devam_ediyor",
    atanan: "İbrahim Alaçam",
    tarih: "2026-04-17",
    notlar: "Bakım devam ediyor, fotoğraflar yüklenecek."
  },
  {
    id: "t-004",
    plaka: "58 TH 256",
    tip: "gunluk_kontrol", // Yakıt takip
    checklist: [
      { label: "Yakıt alımı sonrası fiş görseli sisteme yüklendi", checked: true },
      { label: "Çalışma saati girildi", checked: true },
    ],
    durum: "tamamlandi",
    atanan: "Selahattin Tosun",
    tarih: "2026-04-16",
    tamamlanmaTarihi: "2026-04-16T16:00:00",
    notlar: "PTO: 5605 saat olarak güncellendi."
  }
];
