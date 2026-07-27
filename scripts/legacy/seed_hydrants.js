const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const proj4 = require('proj4');

// Register EPSG:5256 definition
proj4.defs("EPSG:5256", "+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const geojsonData = {
"type": "FeatureCollection",
"name": "hidrant",
"crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::5256" } },
"features": [
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586547.066100000054576, 4401740.223799999803305 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586544.85930000001099, 4401730.815000000409782 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586542.501000000047497, 4401758.64809999987483 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 585723.332599999965169, 4400368.4441 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 584978.82999999995809, 4399725.223399999551475 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586020.523999999975786, 4399700.888799999840558 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 585963.038199999951757, 4399686.296299999579787 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586077.462000000057742, 4399715.0444 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 585905.520600000047125, 4399671.535899999551475 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 590284.123499999986961, 4399716.723199999891222 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 590313.63710000005085, 4399847.346900000236928 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587195.427000000025146, 4400365.636699999682605 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 589048.383999999961816, 4402252.960199999623001 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587529.014300000038929, 4400545.7654 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587125.0133, 4401162.7324 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587119.774500000057742, 4401129.7917 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584300.459799999953248, 4402075.306800000369549 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584453.328800000017509, 4402104.404500000178814 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584082.994700000039302, 4401922.863300000317395 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584335.743600000045262, 4402114.181599999777973 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584185.543599999975413, 4402117.578300000168383 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584347.447000000043772, 4402039.096800000406802 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2023-06-15T00:00:00", "FIRMA": "TUNA MÜHENDİSLİK A.Ş.", "IMALATCI": null, "PROJE_ADI": "ESENTEPE MAHALLESİ KENTSEL DÖNÜŞÜM VE GELİŞİM PROJESİ ", "VERI_KAYNAK": "ARAZİ", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 584319.052400000044145, 4401956.022900000214577 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 593499.731100001023151, 4406659.1129 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 593186.267600000021048, 4405787.80350000038743 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 594223.572999999974854, 4407203.500799999572337 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 590984.771799999987707, 4404266.410199999809265 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 588493.9802, 4404707.639000000432134 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 592091.320799999986775, 4405205.2297 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 584973.359399999957532, 4403545.1743 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 584722.793399999965914, 4400955.571100000292063 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 584718.885, 4403155.0433 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 584111.26659999997355, 4396971.132500000298023 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 582777.6276, 4398011.2626 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 585577.315500000026077, 4400493.732800000347197 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 585944.2182, 4400526.018899999558926 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586091.642400000011548, 4400547.512000000104308 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 586209.67359999998007, 4399721.1453 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587739.953100000042468, 4402177.208399999886751 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": "NİKAH SALONU ÖNÜ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587074.905299999983981, 4403222.626500000245869 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 590387.518900000024587, 4399903.05599999986589 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 583112.260499999974854, 4400392.262400000356138 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 590350.403700000024401, 4399688.746399999596179 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "MEVCUT", "KALITE": "İYİ", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 583546.47019999998156, 4399681.314299999736249 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": "YENİ MAHALLE KARAKOLU", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 585617.405999999959022, 4402678.528900000266731 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581343.713699999963865, 4400274.458700000308454 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581337.133400000049733, 4400333.855499999597669 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581283.01659999997355, 4400533.64740000013262 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581249.01300000003539, 4400459.569799999706447 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581361.309099999954924, 4400383.089300000108778 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581312.682299999985844, 4400420.738900000229478 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581294.474200000055134, 4400461.654299999587238 ] } },
{ "type": "Feature", "properties": { "TUR": "HİDRANT", "YAPILAN_TARIH": "2022-08-12T00:00:00", "FIRMA": "OKÇUOĞLU İNŞ. MUH. MÜŞ. SAN. VE TİC. A.Ş.", "IMALATCI": null, "PROJE_ADI": "SİVAS İLİ MERKEZ İLÇESİ YENİMAHALLE 2. ETAP 427 ADET KONUT İNŞAATI İLE ALTYAPI VE ÇEVRE DÜZENLEMESİ ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 581280.561800000024959, 4400340.58 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 588231.371399999945424, 4402291.992700000293553 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 588315.558500000042841, 4401292.235100000165403 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 592938.149800000013784, 4406134.89670000039041 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 594403.927099999971688, 4407727.13289999961853 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": "PIK" }, "geometry": { "type": "Point", "coordinates": [ 593600.526199999963865, 4406937.509499999694526 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": null, "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 588805.002800000016578, 4405396.9271 ] } },
{ "type": "Feature", "properties": { "TUR": "Hidrant", "YAPILAN_TARIH": null, "FIRMA": null, "IMALATCI": "Sivas Belediyesi", "PROJE_ADI": "NİKAH SALONU ÖNÜ", "VERI_KAYNAK": "Arazi_Ölçüsü", "DURUMU": "DEVRE_DIŞI", "KALITE": "ZAYIF", "MUSLUK_OZELLIK": null }, "geometry": { "type": "Point", "coordinates": [ 587004.249700000043958, 4403497.619800000451505 ] } }
]
};

async function main() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL
  });

  try {
    console.log('Truncating existing fire_hydrants table...');
    await pool.query('TRUNCATE TABLE public.fire_hydrants RESTART IDENTITY;');
    console.log('Table truncated successfully.');

    console.log(`Starting migration of ${geojsonData.features.length} features...`);

    let count = 0;
    for (const [index, f] of geojsonData.features.entries()) {
      const Easting = f.geometry.coordinates[0];
      const Northing = f.geometry.coordinates[1];
      
      // Convert to WGS84
      const [lng, lat] = proj4("EPSG:5256", "EPSG:4326", [Easting, Northing]);
      
      // Properties
      const props = f.properties;
      const no = `H-${100 + index}`; // Generate sequential fallback hydrant number like H-100, H-101
      const tip = props.TUR || 'Hidrant';
      const durum = props.DURUMU || 'MEVCUT';
      const kalite = props.KALITE || null;
      const imalatci = props.IMALATCI || null;
      const proje_adi = props.PROJE_ADI || null;
      const musluk_ozellik = props.MUSLUK_OZELLIK || null;
      const firma = props.FIRMA || null;
      const yapilan_tarih = props.YAPILAN_TARIH || null;
      const veri_kaynak = props.VERI_KAYNAK || null;

      // Extract neighborhood / mahalle name from PROJE_ADI if present, or assign a default
      let mahalle = 'Merkez';
      if (proje_adi) {
        const lowerProj = proje_adi.toLowerCase();
        if (lowerProj.includes('esentepe')) {
          mahalle = 'Esentepe';
        } else if (lowerProj.includes('yenimahalle')) {
          mahalle = 'Yenimahalle';
        }
      }

      const wktPoint = `POINT(${lng} ${lat})`;

      await pool.query(`
        INSERT INTO public.fire_hydrants (
          no, tip, durum, location, mahalle, kalite, imalatci, proje_adi, musluk_ozellik, firma, yapilan_tarih, veri_kaynak
        ) VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), $5, $6, $7, $8, $9, $10, $11, $12)
      `, [no, tip, durum, wktPoint, mahalle, kalite, imalatci, proje_adi, musluk_ozellik, firma, yapilan_tarih, veri_kaynak]);

      count++;
    }

    console.log(`Successfully migrated ${count} fire hydrants into PostGIS fire_hydrants table!`);

    // Verify row count
    const verifyRes = await pool.query('SELECT COUNT(*) FROM public.fire_hydrants;');
    console.log(`Total rows in fire_hydrants table: ${verifyRes.rows[0].count}`);

    // Print sample row
    const sample = await pool.query('SELECT * FROM public.fire_hydrants LIMIT 1;');
    console.log('Sample Row in Database:', sample.rows[0]);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

main();
