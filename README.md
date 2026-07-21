# Sistema de Inventario y Punto de Venta (Licorería)

Sistema integral de gestión de inventarios, punto de venta (POS), arqueo/cierre de cajas y gestión de bodegas desarrollado con Node.js (Backend) y React Native / Expo (App Móvil).

## 📖 Instrucciones de Instalación y Ejecución

Este proyecto utiliza **pnpm** como gestor de paquetes. Para ver los pasos detallados, consulta la guía completa:

➡️ **[Ver Guía Completa de Ejecución (GUIA_EJECUCION.md)](GUIA_EJECUCION.md)**

### Resumen Rápido:

0. **Instalar pnpm** (si aún no lo tienes):
   ```bash
   npm install -g pnpm
   ```

1. **Backend**:
   ```bash
   cd backend
   pnpm install
   copy .env.example .env
   node server.js
   ```

2. **Mobile**:
   ```bash
   cd mobile
   pnpm install
   # Configurar la IP de tu PC en mobile/config.js
   pnpm start
   ```
