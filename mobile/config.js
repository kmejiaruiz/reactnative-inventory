// Archivo de configuración para el frontend móvil

// NOTA DE IP:
// - Para Emulador de Android en la misma PC: usar 'http://10.0.2.2:5000/api'
// - Para Simulador de iOS: usar 'http://localhost:5000/api'
// - Para Dispositivo Físico (Expo Go): usar la IP local de tu computadora en la red Wi-Fi (ejemplo: 'http://192.168.1.45:5000/api')

export let API_URL = "http://192.168.1.103:5000/api";

export function setApiUrl(newUrl) {
  API_URL = newUrl;
}
