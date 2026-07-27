const proj4 = require('proj4');

// EPSG:5256
proj4.defs("EPSG:5256", "+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");

const rawCoords = [586547.066100000054576, 4401740.223799999803305];
const wgs84Coords = proj4("EPSG:5256", "EPSG:4326", rawCoords);

console.log("Raw EPSG:5256:", rawCoords);
console.log("WGS84 [lng, lat]:", wgs84Coords);
