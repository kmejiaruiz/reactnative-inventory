# 🚀 Guía Completa de Instalación y Ejecución del Proyecto (con pnpm)

Esta guía explica paso a paso cómo instalar las dependencias con **pnpm**, configurar los archivos de entorno y ejecutar tanto el **Backend (API)** como la **Aplicación Móvil (React Native con Expo)**.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en tu computadora:

1. **Node.js** (Versión 18 o superior) -> [Descargar Node.js](https://nodejs.org/)
2. **pnpm** (Gestor de paquetes del proyecto). Si no lo tienes instalado, abre tu terminal y ejecuta:
   ```bash
   npm install -g pnpm
   ```
3. **XAMPP** o un servidor **MySQL** activo -> [Descargar XAMPP](https://www.apachefriends.org/)
4. En tu teléfono celular (opcional si usas emulador):
   - **Expo Go** (Disponible en Google Play Store / Apple App Store)

---

## 🛠️ PASO 1: Configurar y Ejecutar el Backend (Servidor Node.js)

### 1.1 Entrar a la carpeta del Backend
Abre una terminal (PowerShell o CMD) y entra a la carpeta `backend`:
```bash
cd backend
```

### 1.2 Instalar dependencias con `pnpm`
Ejecuta el siguiente comando:
```bash
pnpm install
```

### 1.3 Configurar el archivo de entorno `.env`
Crea una copia del archivo `.env.example` con el nombre `.env`:
```bash
# En Windows (PowerShell):
copy .env.example .env
```
*Si es necesario, abre `.env` en tu editor para verificar o ajustar las credenciales de tu base de datos MySQL (por defecto usuario `root` sin contraseña).*

### 1.4 Iniciar el Servidor MySQL
Asegúrate de abrir el **Control Panel de XAMPP** y hacer clic en **Start** en el servicio de **MySQL**.

### 1.5 Iniciar el Backend
Ejecuta cualquiera de estos dos comandos:
```bash
pnpm start
# O directamente:
node server.js
```

> **NOTA DE BASE DE DATOS:** Al ejecutar `node server.js` por primera vez, el backend **creará automáticamente la base de datos `proyecto_db`, todas las tablas y los datos de prueba**.

#### 🔑 Cuentas de Acceso Creadas Automáticamente:
| Rol | Correo Electrónico | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin@sistema.com` | `admin123` |
| **Consultor** | `consultor@sistema.com` | `consultor123` |
| **Vendedor** | `vendedor@sistema.com` | `vendedor123` |

---

## 📱 PASO 2: Configurar y Ejecutar la App Móvil (Expo / React Native)

### 2.1 Abrir una NUEVA terminal y entrar a la carpeta `mobile`
Deja la terminal del backend corriendo y abre una **nueva terminal**:
```bash
cd mobile
```

### 2.2 Instalar dependencias con `pnpm`
Ejecuta el comando para instalar las librerías móviles:
```bash
pnpm install
```

### 2.3 Configurar la dirección IP en `mobile/config.js`
Abre el archivo `mobile/config.js` en tu editor.

Al iniciar el backend (`node server.js`), la consola te muestra las IPs locales de tu red. Asegúrate de colocar esa misma IP en `API_URL`:

```javascript
// Ejemplo en mobile/config.js
export let API_URL = "http://192.168.1.103:5000/api";
```

* **Para Celular Físico con Expo Go**: Usa la IP local de tu PC (ej. `http://192.168.1.103:5000/api`).
* **Para Emulador de Android en la PC**: Usa `http://10.0.2.2:5000/api`.

### 2.4 Iniciar la Aplicación Móvil
Ejecuta el comando de Expo con pnpm:
```bash
pnpm start
# O también:
npx expo start
```

### 2.5 Conectar la App
* **En Celular Físico**: Abre la aplicación **Expo Go**, presiona "Scan QR Code" y escanea el código QR que se muestra en tu terminal.
* **En Emulador**: Presiona la tecla `a` en la terminal para abrir en el emulador de Android.

---

## ❓ Solución de Problemas Comunes

### ❌ Error `EBADDEVENGINES` al usar `npm install`
* **Causa**: El proyecto está configurado para usarse con **pnpm**.
* **Solución**: Instala pnpm globalmente con `npm install -g pnpm` y usa **`pnpm install`** en lugar de `npm install`.

### ❌ Error: `connect ECONNREFUSED 127.0.0.1:3306`
* **Causa**: MySQL no está iniciado.
* **Solución**: Abre el panel de XAMPP y presiona "Start" en MySQL.

### ❌ Error en la App Móvil: `Network Error` / `No se puede conectar al servidor`
* **Causa**: El celular y la PC no están en la misma red Wi-Fi o la IP en `mobile/config.js` es incorrecta.
* **Solución**:
  1. Revisa que tu teléfono y tu laptop/PC estén conectados a la **misma red Wi-Fi**.
  2. Verifica que la IP configurada en `mobile/config.js` coincida con la IP mostrada al ejecutar `node server.js`.
