import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import os from "os";
import pool, { inicializarBaseDatos } from "./db.js";
import { verificarToken, verificarRol } from "./auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "clave_secreta_para_jwt_12345";

app.use(cors());
app.use(express.json());

// Función para obtener timestamp legible en logs
const obtenerTimestampLog = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
};

// Función para detectar el tipo de dispositivo móvil o cliente desde el User-Agent
const obtenerDetallesDispositivo = (userAgent = "") => {
  if (!userAgent) return "Dispositivo Desconocido";
  const ua = userAgent.toLowerCase();
  
  if (ua.includes("expo")) {
    return "App Movil (Expo / React Native)";
  } else if (ua.includes("android")) {
    const matchModel = userAgent.match(/Android[^;]+; ([^;)]+)/i);
    const modelo = matchModel ? matchModel[1].trim() : "Android";
    return `Celular Android (${modelo})`;
  } else if (ua.includes("iphone")) {
    return "iPhone (iOS)";
  } else if (ua.includes("ipad")) {
    return "iPad (iOS)";
  } else if (ua.includes("okhttp")) {
    return "Dispositivo Movil Android (OkHttp / React Native)";
  } else if (ua.includes("darwin") || ua.includes("cfnetwork")) {
    return "Dispositivo iOS (React Native Fetch)";
  } else if (ua.includes("postmanruntime")) {
    return "Cliente Postman";
  } else if (ua.includes("chrome")) {
    return "Navegador Web (Chrome)";
  } else if (ua.includes("firefox")) {
    return "Navegador Web (Firefox)";
  } else if (ua.includes("safari")) {
    return "Navegador Web (Safari)";
  } else if (ua.includes("node-fetch") || ua.includes("axios")) {
    return "Cliente HTTP (Axios/Node)";
  }
  
  return `Cliente (${userAgent.substring(0, 35)}...)`;
};

// Middleware para registrar en consola todas las conexiones y peticiones en todo momento
app.use((req, res, next) => {
  const start = Date.now();
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '';
  // Limpiar formato IPv6 loopback o prefijo ::ffff:
  const clientIp = rawIp.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
  const userAgent = req.headers['user-agent'] || '';
  const infoDispositivo = obtenerDetallesDispositivo(userAgent);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = obtenerTimestampLog();
    const status = res.statusCode;
    
    let statusSimbolo = '[OK]';
    if (status >= 400 && status < 500) statusSimbolo = '[WARN]';
    if (status >= 500) statusSimbolo = '[ERROR]';

    console.log(
      `${timestamp} ${statusSimbolo} [PETICIÓN HTTP] ${req.method} ${req.originalUrl} | Estado: ${status} (${duration}ms) | IP: ${clientIp} | Dispositivo: ${infoDispositivo}`
    );
  });

  next();
});

const obtenerFechaNicaragua = () => {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
};

// Conciliar cajas huerfanas de dias anteriores creando un registro de cierre automatico
const reconciliarCajasHuerfanas = async (dbPool) => {
  const hoy = obtenerFechaNicaragua();
  const timestamp = obtenerTimestampLog();
  try {
    const [huerfanas] = await dbPool.query(
      `SELECT c.id, c.vendedor_id, c.fecha_caja, c.fondo_inicial, c.estado as estado_anterior, u.nombre as vendedor_nombre
       FROM cierres_caja c
       JOIN usuarios u ON c.vendedor_id = u.id
       WHERE c.tipo = 'apertura' 
         AND c.estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') 
         AND c.fecha_caja < ?`,
      [hoy]
    );

    if (huerfanas.length === 0) {
      console.log(`${timestamp} [RECONCILIACIÓN] No se encontraron cajas huérfanas pendientes de días anteriores.`);
      return;
    }

    console.log(`${timestamp} [RECONCILIACIÓN ATENCIÓN] Se encontraron ${huerfanas.length} caja(s) huérfana(s) de días anteriores sin cerrar. Procesando reconciliación...`);

    let reconciliadasCount = 0;

    for (const box of huerfanas) {
      const dateVal = box.fecha_caja;
      let dateStr = '';
      if (dateVal instanceof Date) {
        const year = dateVal.getFullYear();
        const month = String(dateVal.getMonth() + 1).padStart(2, '0');
        const day = String(dateVal.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof dateVal === 'string') {
        dateStr = dateVal.substring(0, 10);
      } else {
        dateStr = hoy;
      }

      // Sumar ventas completadas de ese vendedor en esa fecha
      const [[ventasRow]] = await dbPool.query(
        `SELECT COALESCE(SUM(total), 0) as total 
         FROM ventas 
         WHERE vendedor_id = ? AND DATE(fecha) = ? AND estado = 'completado'`,
        [box.vendedor_id, dateStr]
      );
      const totalVentas = Number(ventasRow.total);
      const fondo = Number(box.fondo_inicial);
      const esperado = totalVentas + fondo;

      // Insertar cierre automático
      await dbPool.query(
        `INSERT INTO cierres_caja (tipo, admin_id, vendedor_id, fecha_caja, fondo_inicial, total_ventas_sistema, efectivo_declarado, diferencia, observaciones, estado)
         VALUES ('cierre', NULL, ?, ?, ?, ?, ?, 0.00, 'Cierre automático del sistema (Caja huérfana de días anteriores)', 'cerrada')`,
        [box.vendedor_id, dateStr, fondo, totalVentas, esperado]
      );

      // Cerrar apertura
      await dbPool.query(
        "UPDATE cierres_caja SET estado = 'cerrada' WHERE id = ?",
        [box.id]
      );

      // Registrar en bitácora
      await dbPool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (NULL, 'AUTO_CIERRE_CAJA', ?)",
        [`Cierre automático de caja del vendedor "${box.vendedor_nombre}" (ID: ${box.vendedor_id}) del día ${dateStr}. Ventas: C$${totalVentas.toFixed(2)}, Fondo: C$${fondo.toFixed(2)}.`]
      );

      reconciliadasCount++;
      console.log(
        `${timestamp} [RECONCILIADA] Caja #${box.id} | Vendedor: "${box.vendedor_nombre}" (ID: ${box.vendedor_id}) | Fecha Caja: ${dateStr} | Fondo Inicial: C$${fondo.toFixed(2)} | Ventas Sistema: C$${totalVentas.toFixed(2)} | Estado Anterior: '${box.estado_anterior}' -> Cerrada`
      );
    }

    console.log(`${timestamp} [RECONCILIACIÓN OK] Total de ${reconciliadasCount} caja(s) huérfana(s) reconciliada(s) y cerrada(s) con éxito.`);
  } catch (error) {
    console.error(`${timestamp} [RECONCILIACIÓN ERROR] Error al reconciliar cajas huérfanas:`, error.message);
  }
};

// Ruta de estado de la API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mensaje: "Servidor operativo." });
});

// Ruta de Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ mensaje: "Por favor proporcione correo y contraseña." });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [
      email,
    ]);
    if (rows.length === 0) {
      return res.status(401).json({ mensaje: "Credenciales inválidas." });
    }

    const usuario = rows[0];

    const passwordMatch = await bcrypt.compare(password, usuario.password);
    if (!passwordMatch) {
      return res.status(401).json({ mensaje: "Credenciales inválidas." });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
      JWT_SECRET,
      { expiresIn: "8h" },
    );

    await pool.query(
      "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
      [
        usuario.id,
        "INICIO_SESION",
        `El usuario ${usuario.nombre} (${usuario.rol}) inició sesión.`,
      ],
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ mensaje: "Error interno del servidor." });
  }
});

// Ruta de Dashboard para Administradores (Métricas de Licorería)
app.get(
  "/api/dashboard/admin",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const [[{ count: usersCount }]] = await pool.query(
        "SELECT COUNT(*) as count FROM usuarios",
      );
      const [[{ count: clientsCount }]] = await pool.query(
        "SELECT COUNT(*) as count FROM clientes",
      );
      const [[{ count: salesCount }]] = await pool.query(
        "SELECT COUNT(*) as count FROM ventas",
      );
      const [[{ count: productsCount }]] = await pool.query(
        "SELECT COUNT(*) as count FROM productos",
      );
      const [[{ count: poCount }]] = await pool.query(
        "SELECT COUNT(*) as count FROM ordenes_compra WHERE estado = 'pendiente'",
      );
      const [[{ count: ndCount }]] = await pool.query(
        "SELECT COUNT(*) as count FROM notas_debito",
      );
      const [[{ total_val: stockValue }]] = await pool.query(
        "SELECT SUM(stock * precio) as total_val FROM productos",
      );

      const [bitacora] = await pool.query(
        "SELECT b.id, b.accion, b.descripcion, b.fecha, u.nombre as usuario FROM bitacora b LEFT JOIN usuarios u ON b.usuario_id = u.id ORDER BY b.fecha DESC LIMIT 15",
      );

      const [usuarios] = await pool.query(
        "SELECT id, nombre, email, rol, conteo_autorizado, fecha_creacion FROM usuarios ORDER BY nombre ASC",
      );

      // Obtener histórico de ventas de los últimos 7 días
      const [salesRows] = await pool.query(
        `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') as fecha_dia, SUM(total) as total_dia
       FROM ventas
       WHERE estado != 'cancelado' AND fecha >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d')`,
      );

      const salesMap = {};
      salesRows.forEach((row) => {
        salesMap[row.fecha_dia] = parseFloat(row.total_dia) || 0;
      });

      const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const historicoVentas = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;

        const weekdayLabel = diasSemana[d.getDay()];

        historicoVentas.push({
          fecha: dateStr,
          label: `${weekdayLabel} ${d.getDate()}`,
          total: salesMap[dateStr] || 0,
        });
      }

      // Obtener stock agrupado por categoría para el tercer gráfico
      const [stockByCategory] = await pool.query(
        `SELECT c.nombre as categoria, CAST(SUM(p.stock) AS SIGNED) as total_stock
         FROM productos p
         JOIN categorias c ON p.categoria_id = c.id
         GROUP BY c.id`
      );

      res.json({
        estadisticas: {
          usuarios: usersCount,
          clientes: clientsCount,
          ventas: salesCount,
          productos: productsCount,
          poPendientes: poCount,
          notasDebito: ndCount,
          valorInventario: parseFloat(stockValue) || 0,
        },
        bitacora,
        usuarios,
        historicoVentas,
        stockByCategory
      });
    } catch (error) {
      console.error("Error en dashboard admin:", error);
      res
        .status(500)
        .json({ mensaje: "Error al cargar los datos del dashboard." });
    }
  },
);

// Ruta para obtener reporte de ventas agrupado por vendedor (solo para Administradores)
app.get(
  "/api/reports/sales-by-seller",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      // 1. Obtener ventas agrupadas por vendedor
      const [vendedoresVentas] = await pool.query(`
        SELECT 
          u.id, 
          u.nombre, 
          u.email, 
          COALESCE(COUNT(v.id), 0) AS cantidad_ventas,
          COALESCE(SUM(v.total), 0) AS total_vendido
        FROM usuarios u
        LEFT JOIN ventas v ON u.id = v.vendedor_id AND v.estado = 'completado'
        WHERE u.rol = 'vendedor'
        GROUP BY u.id, u.nombre, u.email
        ORDER BY total_vendido DESC
      `);

      // 2. Obtener el total general de ventas acumulado en la tienda
      const [[{ total_tienda }]] = await pool.query(`
        SELECT COALESCE(SUM(total), 0) AS total_tienda 
        FROM ventas 
        WHERE estado = 'completado'
      `);

      res.json({
        totalTienda: parseFloat(total_tienda) || 0,
        vendedores: vendedoresVentas.map(v => ({
          id: v.id,
          nombre: v.nombre,
          email: v.email,
          cantidadVentas: parseInt(v.cantidad_ventas) || 0,
          totalVendido: parseFloat(v.total_vendido) || 0
        }))
      });
    } catch (error) {
      console.error("Error en reporte de ventas por vendedor:", error);
      res.status(500).json({ mensaje: "Error al generar reporte de ventas." });
    }
  }
);

// Módulo de Movimientos de Inventario (Kardex)
app.get(
  "/api/reports/inventory-movements",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      // 1. Obtener catálogo con stock y valor total
      const [catalogStatus] = await pool.query(`
        SELECT 
          p.id,
          p.nombre,
          p.precio,
          p.stock,
          (p.stock * p.precio) AS valor_total,
          c.nombre AS categoria_nombre,
          p.costo,
          p.iva_porcentaje,
          p.utilidad_porcentaje
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        ORDER BY p.nombre ASC
      `);

      const { fecha_inicio, fecha_fin } = req.query;
      let dateFilterOC = "";
      let dateFilterVentas = "";
      let dateFilterConteos = "";
      const queryParams = [];

      if (fecha_inicio && fecha_fin) {
        dateFilterOC = " AND oc.fecha_creacion >= ? AND oc.fecha_creacion <= ? ";
        dateFilterVentas = " AND v.fecha >= ? AND v.fecha <= ? ";
        dateFilterConteos = " AND ci.fecha_aplicado >= ? AND ci.fecha_aplicado <= ? ";
        
        const start = `${fecha_inicio} 00:00:00`;
        const end = `${fecha_fin} 23:59:59`;
        
        queryParams.push(
          start, end,
          start, end,
          start, end
        );
      }

      // 2. Obtener movimientos de inventario unificados (filtrados por fechas si se pasan)
      const movementsQuery = `
        SELECT * FROM (
          SELECT 
            'ENTRADA' AS tipo,
            oc.fecha_creacion AS fecha,
            doc.producto_id,
            p.nombre AS producto_nombre,
            doc.cantidad_recibida AS cantidad,
            CONCAT('O.C. #', oc.id) AS referencia,
            'Admin' AS responsable
          FROM detalle_ordenes_compra doc
          JOIN ordenes_compra oc ON doc.orden_compra_id = oc.id
          JOIN productos p ON doc.producto_id = p.id
          WHERE oc.estado IN ('ingresado', 'discrepancia') AND doc.cantidad_recibida > 0 ${dateFilterOC}

          UNION ALL

          SELECT 
            'SALIDA' AS tipo,
            v.fecha AS fecha,
            dv.producto_id,
            p.nombre AS producto_nombre,
            -dv.cantidad AS cantidad,
            CONCAT('Venta #', v.id) AS referencia,
            u.nombre AS responsable
          FROM detalle_ventas dv
          JOIN ventas v ON dv.venta_id = v.id
          JOIN productos p ON dv.producto_id = p.id
          LEFT JOIN usuarios u ON v.vendedor_id = u.id
          WHERE v.estado = 'completado' ${dateFilterVentas}

          UNION ALL

          SELECT 
            'AJUSTE' AS tipo,
            ci.fecha_aplicado AS fecha,
            dci.producto_id,
            p.nombre AS producto_nombre,
            dci.diferencia AS cantidad,
            CONCAT('Conteo #', ci.id) AS referencia,
            u.nombre AS responsable
          FROM detalle_conteos_inventario dci
          JOIN conteos_inventario ci ON dci.conteo_inventario_id = ci.id
          JOIN productos p ON dci.producto_id = p.id
          LEFT JOIN usuarios u ON ci.consultor_id = u.id
          WHERE ci.estado = 'aplicado' ${dateFilterConteos}
        ) AS movimientos
        ORDER BY fecha DESC
        ${fecha_inicio && fecha_fin ? "" : "LIMIT 100"}
      `;

      const [movements] = await pool.query(movementsQuery, queryParams);

      res.json({
        catalogStatus: catalogStatus.map(p => ({
          id: p.id,
          nombre: p.nombre,
          precio: parseFloat(p.precio) || 0,
          stock: parseInt(p.stock) || 0,
          valorTotal: parseFloat(p.valor_total) || 0,
          categoria: p.categoria_nombre || "Sin Categoría",
          costo: parseFloat(p.costo) || 0,
          iva_porcentaje: parseFloat(p.iva_porcentaje) || 0,
          utilidad_porcentaje: parseFloat(p.utilidad_porcentaje) || 0
        })),
        movements: movements.map(m => ({
          tipo: m.tipo,
          fecha: m.fecha,
          productoId: m.producto_id,
          productoNombre: m.producto_nombre,
          cantidad: parseInt(m.cantidad) || 0,
          referencia: m.referencia,
          responsable: m.responsable || "Sistema"
        }))
      });
    } catch (error) {
      console.error("Error en reporte de movimientos de inventario:", error);
      res.status(500).json({ mensaje: "Error al generar historial de movimientos de inventario." });
    }
  }
);

// Ruta de Dashboard para Consultores (Simulación: Retorna conteos e inventario)
app.get(
  "/api/dashboard/consultor",
  verificarToken,
  verificarRol(["consultor", "admin"]),
  async (req, res) => {
    try {
      const esAdmin = req.user.rol === "admin";
      const consultorId = req.user.id;

      // Obtener lista de categorías para el selector
      const [categorias] = await pool.query(
        "SELECT id, nombre, descripcion FROM categorias ORDER BY nombre ASC",
      );

      // Obtener conteos recientes: SIEMPRE borradores + aplicados de HOY (últimas 24h)
      let conteos;
      const hoy24h = "DATE(ci.fecha_aplicado) >= CURDATE() - INTERVAL 0 DAY";
      if (esAdmin) {
        [conteos] = await pool.query(`
          SELECT ci.*, cat.nombre as categoria_nombre, b.nombre as bodega_nombre, u.nombre as consultor_nombre 
          FROM conteos_inventario ci 
          LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
          LEFT JOIN bodegas b ON ci.bodega_id = b.id
          LEFT JOIN usuarios u ON ci.consultor_id = u.id 
          WHERE ci.estado = 'borrador' OR (ci.estado = 'aplicado' AND DATE(ci.fecha_aplicado) = CURDATE())
          ORDER BY ci.id DESC LIMIT 20
        `);
      } else {
        [conteos] = await pool.query(`
          SELECT ci.*, cat.nombre as categoria_nombre, b.nombre as bodega_nombre, u.nombre as consultor_nombre 
          FROM conteos_inventario ci 
          LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
          LEFT JOIN bodegas b ON ci.bodega_id = b.id
          LEFT JOIN usuarios u ON ci.consultor_id = u.id 
          WHERE ci.consultor_id = ? AND (
            ci.estado = 'borrador' OR (ci.estado = 'aplicado' AND DATE(ci.fecha_aplicado) = CURDATE())
          )
          ORDER BY ci.id DESC LIMIT 20
        `, [consultorId]);
      }

      let conteoAutorizado = 1;
      if (req.user.rol === "consultor") {
        const [[userRow]] = await pool.query(
          "SELECT conteo_autorizado FROM usuarios WHERE id = ?",
          [req.user.id],
        );
        conteoAutorizado = userRow ? userRow.conteo_autorizado : 0;
      } else {
        // Simulación desde Admin: tomamos el estado del primer consultor en la BD
        const [[consultorRow]] = await pool.query(
          "SELECT conteo_autorizado FROM usuarios WHERE rol = 'consultor' LIMIT 1",
        );
        conteoAutorizado = consultorRow ? consultorRow.conteo_autorizado : 1;
      }

      res.json({
        categorias,
        conteos,
        conteoAutorizado: !!conteoAutorizado,
      });
    } catch (error) {
      console.error("Error en dashboard consultor:", error);
      res
        .status(500)
        .json({
          mensaje: "Error al cargar los datos del dashboard de consultor.",
        });
    }
  },
);

// Ruta de Dashboard para Vendedores (Retorna catálogo, categorías y transacciones)
app.get(
  "/api/dashboard/vendedor",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    try {
      const vendedorId = req.user.id;
      const esAdmin = req.user.rol === "admin";

      let ventas;
      if (esAdmin) {
        [ventas] = await pool.query(
          `SELECT v.id, v.total, v.fecha, v.estado, cl.nombre as cliente_nombre 
         FROM ventas v 
         LEFT JOIN clientes cl ON v.cliente_id = cl.id 
         ORDER BY v.fecha DESC`,
        );
      } else {
        [ventas] = await pool.query(
          `SELECT v.id, v.total, v.fecha, v.estado, cl.nombre as cliente_nombre 
         FROM ventas v 
         LEFT JOIN clientes cl ON v.cliente_id = cl.id 
         WHERE v.vendedor_id = ? 
         ORDER BY v.fecha DESC`,
          [vendedorId],
        );
      }

      const [productos] = await pool.query(
        `SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, cat.nombre as categoria_nombre, p.categoria_id 
       FROM productos p 
       LEFT JOIN categorias cat ON p.categoria_id = cat.id 
       ORDER BY p.nombre ASC`,
      );

      const [categorias] = await pool.query(
        "SELECT id, nombre FROM categorias ORDER BY nombre ASC",
      );
      const [clientes] = await pool.query(
        "SELECT id, nombre FROM clientes ORDER BY nombre ASC",
      );

      // Obtener la caja activa global
      const [activeBox] = await pool.query(
        "SELECT id, fecha_creacion, vendedor_id FROM cierres_caja WHERE tipo = 'apertura' AND estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') LIMIT 1"
      );

      let activeVentasCount = 0;
      let activeTotalVendido = 0;

      if (activeBox.length > 0 && Number(activeBox[0].vendedor_id) === Number(vendedorId)) {
        const [[statsRow]] = await pool.query(
          `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
           FROM ventas 
           WHERE vendedor_id = ? AND fecha >= ? AND estado = 'completado'`,
          [vendedorId, activeBox[0].fecha_creacion]
        );
        activeVentasCount = Number(statsRow.count);
        activeTotalVendido = Number(statsRow.total);
      }

      res.json({
        ventas,
        productos,
        categorias,
        clientes,
        resumen: {
          totalVentasCount: activeVentasCount,
          totalVendido: activeTotalVendido,
        },
      });
    } catch (error) {
      console.error("Error en dashboard vendedor:", error);
      res
        .status(500)
        .json({
          mensaje: "Error al cargar los datos del dashboard de vendedor.",
        });
    }
  },
);

// ==========================================
// MÓDULO DE VENTAS (Buscador y Facturación)
// ==========================================

// Endpoint para buscar productos por nombre y categoría
app.get("/api/productos/search", verificarToken, async (req, res) => {
  const { search, categoria_id } = req.query;
  let query = `
    SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, p.categoria_id, cat.nombre as categoria_nombre 
    FROM productos p 
    LEFT JOIN categorias cat ON p.categoria_id = cat.id
    WHERE 1=1
  `;
  const params = [];
  if (categoria_id && categoria_id !== "all") {
    query += " AND p.categoria_id = ?";
    params.push(Number(categoria_id));
  }
  if (search && search.trim() !== "") {
    query += " AND (p.nombre LIKE ? OR p.descripcion LIKE ?)";
    const searchLike = `%${search.trim()}%`;
    params.push(searchLike, searchLike);
  }
  query += " ORDER BY p.nombre ASC";

  try {
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error al buscar productos:", error);
    res.status(500).json({ mensaje: "Error al buscar productos." });
  }
});

// Endpoint para crear un nuevo producto (Admin)
app.post(
  "/api/productos",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { nombre, descripcion, categoria_id, costo, iva_porcentaje, utilidad_porcentaje, stock } = req.body;

    if (!nombre) {
      return res.status(400).json({ mensaje: "El nombre del producto es requerido." });
    }

    const c = parseFloat(costo) || 0;
    const iva = parseFloat(iva_porcentaje) !== undefined ? parseFloat(iva_porcentaje) : 15.00;
    const util = parseFloat(utilidad_porcentaje) !== undefined ? parseFloat(utilidad_porcentaje) : 30.00;
    const s = parseInt(stock) || 0;

    if (c < 0 || iva < 0 || util < 0 || s < 0) {
      return res.status(400).json({ mensaje: "Los valores deben ser números positivos o cero." });
    }

    // Calcular el precio de venta final
    const precio = c * (1 + iva / 100) * (1 + util / 100);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Insertar producto
      const [result] = await connection.query(
        "INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [nombre, descripcion || null, precio, s, categoria_id || null, c, iva, util]
      );
      const newProductId = result.insertId;

      // Obtener todas las bodegas
      const [bodegas] = await connection.query("SELECT id, tipo FROM bodegas");
      for (const b of bodegas) {
        const qty = b.tipo === 'principal' ? s : 0;
        await connection.query(
          "INSERT INTO stock_bodegas (producto_id, bodega_id, cantidad) VALUES (?, ?, ?)",
          [newProductId, b.id, qty]
        );
      }

      // Sincronizar en bitácora
      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, 'CREAR_PRODUCTO', ?)",
        [
          req.user.id,
          `Se creó el producto "${nombre}" (ID: ${newProductId}) con Costo: C$${c.toFixed(2)}, IVA: ${iva}%, Utilidad: ${util}%. Precio venta calculado: C$${precio.toFixed(2)}. Stock inicial: ${s} u.`
        ]
      );

      await connection.commit();

      res.status(201).json({
        mensaje: "Producto creado correctamente.",
        producto: {
          id: newProductId,
          nombre,
          precio,
          stock: s,
          costo: c,
          iva_porcentaje: iva,
          utilidad_porcentaje: util
        }
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error al crear producto:", error);
      res.status(500).json({ mensaje: "Error al crear producto." });
    } finally {
      connection.release();
    }
  }
);

// Endpoint para parametrizar costo, IVA % y utilidad % de un producto (Admin)
app.put(
  "/api/productos/:id/parametros",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { costo, iva_porcentaje, utilidad_porcentaje } = req.body;

    if (costo === undefined || iva_porcentaje === undefined || utilidad_porcentaje === undefined) {
      return res.status(400).json({ mensaje: "Faltan parámetros requeridos: costo, iva_porcentaje, utilidad_porcentaje." });
    }

    const c = parseFloat(costo);
    const iva = parseFloat(iva_porcentaje);
    const util = parseFloat(utilidad_porcentaje);

    if (isNaN(c) || c < 0 || isNaN(iva) || iva < 0 || isNaN(util) || util < 0) {
      return res.status(400).json({ mensaje: "Los valores deben ser números positivos." });
    }

    // Calcular el precio de venta final
    const precio = c * (1 + iva / 100) * (1 + util / 100);

    try {
      const [[prod]] = await pool.query("SELECT nombre FROM productos WHERE id = ?", [id]);
      if (!prod) {
        return res.status(404).json({ mensaje: "Producto no encontrado." });
      }

      await pool.query(
        "UPDATE productos SET costo = ?, iva_porcentaje = ?, utilidad_porcentaje = ?, precio = ? WHERE id = ?",
        [c, iva, util, precio, id]
      );

      // Sincronizar en bitácora
      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, 'ACTUALIZAR_PARAMETROS_PRODUCTO', ?)",
        [
          req.user.id,
          `Se actualizaron parámetros del producto "${prod.nombre}" (ID: ${id}): Costo: C$${c.toFixed(2)}, IVA: ${iva}%, Utilidad: ${util}%. Precio venta calculado: C$${precio.toFixed(2)}.`
        ]
      );

      res.json({
        mensaje: "Parámetros del producto actualizados correctamente.",
        producto: {
          id: parseInt(id),
          costo: c,
          iva_porcentaje: iva,
          utilidad_porcentaje: util,
          precio: precio
        }
      });
    } catch (error) {
      console.error("Error al actualizar parámetros de producto:", error);
      res.status(500).json({ mensaje: "Error interno del servidor al actualizar parámetros del producto." });
    }
  }
);

// Registrar una venta (Facturación de Múltiples Artículos)
app.post(
  "/api/ventas",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    let { cliente_id, items } = req.body; // items: [{ producto_id: number, cantidad: number }]
    const vendedorId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ mensaje: "Debe agregar al menos un producto para facturar." });
    }

    try {
      await reconciliarCajasHuerfanas(pool);

      // Validar que la caja esté abierta y pertenezca al usuario actual
      const [cajaActiva] = await pool.query(
        "SELECT vendedor_id, estado FROM cierres_caja WHERE tipo = 'apertura' AND estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') LIMIT 1"
      );

      if (cajaActiva.length === 0) {
        return res.status(403).json({ mensaje: "La caja no está abierta. Debe abrir la caja antes de registrar ventas." });
      }

      const caja = cajaActiva[0];
      if (caja.estado === 'listo_para_cierre' || caja.estado === 'por_cerrar') {
        return res.status(403).json({ mensaje: "La caja está en proceso de cierre (por cerrar). No se permiten más ventas." });
      }

      if (caja.vendedor_id !== vendedorId) {
        return res.status(403).json({ mensaje: "La caja activa pertenece a otro usuario. Solo el usuario que la abrió puede realizar ventas." });
      }
    } catch (err) {
      console.error("Error al validar estado de caja para venta:", err);
      return res.status(500).json({ mensaje: "Error al validar la caja activa." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Si cliente_id no es proveído, buscar Cliente General
      if (!cliente_id) {
        const [cliRows] = await connection.query(
          "SELECT id FROM clientes WHERE nombre LIKE '%General%' LIMIT 1",
        );
        if (cliRows.length > 0) {
          cliente_id = cliRows[0].id;
        } else {
          const [anyCli] = await connection.query(
            "SELECT id FROM clientes LIMIT 1",
          );
          cliente_id = anyCli[0]?.id || null;
        }
      }

      let totalVenta = 0;
      const itemsProcesados = [];

      // Validar existencias y calcular precios
      for (const item of items) {
        const prodId = item.producto_id;
        const cant = parseInt(item.cantidad);

        if (isNaN(cant) || cant <= 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ mensaje: "La cantidad debe ser mayor a cero." });
        }

        const [prodRows] = await connection.query(
          "SELECT precio, stock, nombre FROM productos WHERE id = ?",
          [prodId],
        );
        if (prodRows.length === 0) {
          await connection.rollback();
          return res
            .status(404)
            .json({ mensaje: `Producto ID ${prodId} no encontrado.` });
        }

        const producto = prodRows[0];
        if (producto.stock < cant) {
          await connection.rollback();
          return res
            .status(400)
            .json({
              mensaje: `Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`,
            });
        }

        const precioUnitario = Number(producto.precio);
        const subtotalItem = precioUnitario * cant;
        totalVenta += subtotalItem;

        itemsProcesados.push({
          producto_id: prodId,
          nombre: producto.nombre,
          cantidad: cant,
          precio_unitario: precioUnitario,
        });
      }

      // Crear la venta
      const [ventaResult] = await connection.query(
        "INSERT INTO ventas (cliente_id, vendedor_id, total, estado) VALUES (?, ?, ?, ?)",
        [cliente_id, vendedorId, totalVenta, "completado"],
      );
      const ventaId = ventaResult.insertId;

      // Insertar detalles y descontar stock
      for (const item of itemsProcesados) {
        await connection.query(
          "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)",
          [ventaId, item.producto_id, item.cantidad, item.precio_unitario],
        );

        await connection.query(
          "UPDATE productos SET stock = stock - ? WHERE id = ?",
          [item.cantidad, item.producto_id],
        );

        await connection.query(
          `INSERT INTO stock_bodegas (producto_id, bodega_id, cantidad) 
           VALUES (?, (SELECT id FROM bodegas WHERE tipo = 'principal'), (SELECT stock FROM productos WHERE id = ?))
           ON DUPLICATE KEY UPDATE cantidad = cantidad - ?`,
          [item.producto_id, item.producto_id, item.cantidad],
        );
      }

      // Registrar en bitácora
      const descVenta = `Venta comercial #${ventaId} facturada por un total de $${totalVenta.toFixed(2)} (${itemsProcesados.length} artículos).`;
      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [vendedorId, "NUEVA_VENTA", descVenta],
      );

      await connection.commit();
      res
        .status(201)
        .json({ mensaje: "Venta comercial facturada con éxito.", ventaId });
    } catch (error) {
      await connection.rollback();
      console.error("Error al registrar venta:", error);
      res.status(500).json({ mensaje: "Error al procesar la facturación." });
    } finally {
      connection.release();
    }
  },
);

// Registrar nuevo cliente
app.post(
  "/api/clientes",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    const { nombre, telefono, email, direccion } = req.body;

    if (!nombre || !telefono || !email) {
      return res
        .status(400)
        .json({
          mensaje: "Nombre, teléfono y correo electrónico son obligatorios.",
        });
    }

    try {
      const [result] = await pool.query(
        "INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)",
        [
          nombre.trim(),
          telefono.trim(),
          email.trim().toLowerCase(),
          (direccion || "").trim(),
        ],
      );

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [req.user.id, "NUEVO_CLIENTE", `Se registró al cliente ${nombre}.`],
      );

      res
        .status(201)
        .json({
          mensaje: "Cliente registrado exitosamente.",
          clienteId: result.insertId,
        });
    } catch (error) {
      console.error("Error al registrar cliente:", error);
      res.status(500).json({ mensaje: "Error al registrar el cliente." });
    }
  },
);

// ==========================================
// MÓDULO DE PROVEEDORES (Admin)
// ==========================================

// Listar todos los proveedores
app.get(
  "/api/proveedores",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM proveedores ORDER BY nombre ASC");
      res.json(rows);
    } catch (error) {
      console.error("Error al listar proveedores:", error);
      res.status(500).json({ mensaje: "Error al obtener la lista de proveedores." });
    }
  }
);

// Crear un proveedor (Requiere clave de administrador para autorizar)
app.post(
  "/api/proveedores",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { nombre, telefono, email, direccion, password } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: "El nombre del proveedor es obligatorio." });
    }

    if (!password) {
      return res.status(400).json({ mensaje: "Debe ingresar su contraseña de administrador para autorizar la creación." });
    }

    try {
      // Validar contraseña del administrador
      const [adminRows] = await pool.query("SELECT password FROM usuarios WHERE id = ?", [req.user.id]);
      if (adminRows.length === 0) {
        return res.status(404).json({ mensaje: "Administrador no encontrado." });
      }
      
      const match = await bcrypt.compare(password, adminRows[0].password);
      if (!match) {
        return res.status(401).json({ mensaje: "Contraseña incorrecta. Autorización de creación denegada." });
      }

      const [result] = await pool.query(
        "INSERT INTO proveedores (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)",
        [
          nombre.trim(),
          (telefono || "").trim(),
          (email || "").trim().toLowerCase(),
          (direccion || "").trim(),
        ]
      );

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "CREAR_PROVEEDOR",
          `El administrador creó al proveedor ${nombre} (ID: ${result.insertId}).`,
        ]
      );

      res.status(201).json({
        mensaje: "Proveedor registrado exitosamente.",
        proveedorId: result.insertId,
      });
    } catch (error) {
      console.error("Error al registrar proveedor:", error);
      res.status(500).json({ mensaje: "Error al registrar el proveedor." });
    }
  }
);

// Modificar proveedor
app.put(
  "/api/proveedores/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { nombre, telefono, email, direccion } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: "El nombre del proveedor es obligatorio." });
    }

    try {
      const [existing] = await pool.query("SELECT nombre FROM proveedores WHERE id = ?", [id]);
      if (existing.length === 0) {
        return res.status(404).json({ mensaje: "Proveedor no encontrado." });
      }

      await pool.query(
        "UPDATE proveedores SET nombre = ?, telefono = ?, email = ?, direccion = ? WHERE id = ?",
        [
          nombre.trim(),
          (telefono || "").trim(),
          (email || "").trim().toLowerCase(),
          (direccion || "").trim(),
          id
        ]
      );

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "MODIFICAR_PROVEEDOR",
          `Se modificó el proveedor ${nombre} (ID: ${id}).`,
        ]
      );

      res.json({ mensaje: "Proveedor actualizado exitosamente." });
    } catch (error) {
      console.error("Error al actualizar proveedor:", error);
      res.status(500).json({ mensaje: "Error al actualizar el proveedor." });
    }
  }
);

// Eliminar proveedor
app.delete(
  "/api/proveedores/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;

    try {
      const [existing] = await pool.query("SELECT nombre FROM proveedores WHERE id = ?", [id]);
      if (existing.length === 0) {
        return res.status(404).json({ mensaje: "Proveedor no encontrado." });
      }

      const provNombre = existing[0].nombre;
      await pool.query("DELETE FROM proveedores WHERE id = ?", [id]);

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "ELIMINAR_PROVEEDOR",
          `Se eliminó al proveedor ${provNombre} (ID: ${id}).`,
        ]
      );

      res.json({ mensaje: "Proveedor eliminado exitosamente." });
    } catch (error) {
      console.error("Error al eliminar proveedor:", error);
      res.status(500).json({ mensaje: "Error al eliminar el proveedor." });
    }
  }
);

// Listar productos asociados y todos los del catálogo para un proveedor
app.get(
  "/api/proveedores/:id/productos",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;

    try {
      // Obtener productos asociados a este proveedor
      const [associated] = await pool.query(
        `SELECT p.id, p.nombre, p.precio, p.stock, cat.nombre as categoria_nombre 
         FROM productos p 
         JOIN proveedor_productos pp ON p.id = pp.producto_id 
         LEFT JOIN categorias cat ON p.categoria_id = cat.id 
         WHERE pp.proveedor_id = ? 
         ORDER BY p.nombre ASC`,
        [id]
      );

      // Obtener todo el catálogo de productos
      const [catalog] = await pool.query(
        `SELECT p.id, p.nombre, p.precio, p.stock, cat.nombre as categoria_nombre 
         FROM productos p 
         LEFT JOIN categorias cat ON p.categoria_id = cat.id 
         ORDER BY p.nombre ASC`
      );

      res.json({ associated, catalog });
    } catch (error) {
      console.error("Error al obtener licores del proveedor:", error);
      res.status(500).json({ mensaje: "Error al obtener licores asociados." });
    }
  }
);

// Guardar asociaciones de productos para un proveedor
app.post(
  "/api/proveedores/:id/productos",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { productIds } = req.body; // Array: [1, 2, ...]

    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({ mensaje: "Debe proporcionar un listado de IDs de licores." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Eliminar asociaciones anteriores
      await connection.query("DELETE FROM proveedor_productos WHERE proveedor_id = ?", [id]);

      // Insertar nuevas asociaciones
      for (const pId of productIds) {
        await connection.query(
          "INSERT INTO proveedor_productos (proveedor_id, producto_id) VALUES (?, ?)",
          [id, pId]
        );
      }

      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "ASOCIAR_PROVEEDOR_PRODUCTOS",
          `Se actualizaron los licores para el proveedor ID: ${id} (${productIds.length} productos).`,
        ]
      );

      await connection.commit();
      res.json({ mensaje: "Licores asociados al proveedor correctamente." });
    } catch (error) {
      await connection.rollback();
      console.error("Error al asociar productos a proveedor:", error);
      res.status(500).json({ mensaje: "Error al guardar licores asociados." });
    } finally {
      connection.release();
    }
  }
);

// ==========================================
// MÓDULO DE ÓRDENES DE COMPRA (Admin)
// ==========================================

// Crear orden de compra (Costo + IVA 15%)
app.post(
  "/api/purchase-orders",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { proveedor_nombre, items } = req.body; // items: [{ producto_id: number, cantidad_ordenada: number, costo_unitario: number }]

    if (
      !proveedor_nombre ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res
        .status(400)
        .json({ mensaje: "Información de orden de compra incompleta." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let totalCosto = 0;
      for (const item of items) {
        totalCosto +=
          Number(item.cantidad_ordenada) * Number(item.costo_unitario);
      }
      const iva = totalCosto * 0.15;
      const totalConIva = totalCosto + iva;

      const [poResult] = await connection.query(
        "INSERT INTO ordenes_compra (proveedor_nombre, total_costo, iva, total_con_iva, estado) VALUES (?, ?, ?, ?, ?)",
        [proveedor_nombre.trim(), totalCosto, iva, totalConIva, "pendiente"],
      );
      const poId = poResult.insertId;

      for (const item of items) {
        await connection.query(
          "INSERT INTO detalle_ordenes_compra (orden_compra_id, producto_id, cantidad_ordenada, costo_unitario) VALUES (?, ?, ?, ?)",
          [poId, item.producto_id, item.cantidad_ordenada, item.costo_unitario],
        );
      }

      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "CREAR_ORDEN_COMPRA",
          `Orden de compra #${poId} por C$${totalConIva.toFixed(2)} (IVA inc.) para ${proveedor_nombre}.`,
        ],
      );

      await connection.commit();
      res
        .status(201)
        .json({ mensaje: "Orden de compra registrada con éxito.", poId });
    } catch (error) {
      await connection.rollback();
      console.error("Error al registrar orden de compra:", error);
      res.status(500).json({ mensaje: "Error al registrar orden de compra." });
    } finally {
      connection.release();
    }
  },
);

// Listar órdenes de compra
app.get(
  "/api/purchase-orders",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM ordenes_compra ORDER BY id DESC",
      );
      res.json(rows);
    } catch (error) {
      console.error("Error al listar órdenes de compra:", error);
      res.status(500).json({ mensaje: "Error al obtener órdenes de compra." });
    }
  },
);

// Ver detalle de una orden de compra
app.get(
  "/api/purchase-orders/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [poHeader] = await pool.query(
        "SELECT * FROM ordenes_compra WHERE id = ?",
        [id],
      );
      if (poHeader.length === 0) {
        return res
          .status(404)
          .json({ mensaje: "Orden de compra no encontrada." });
      }
      const [poDetails] = await pool.query(
        `
      SELECT doc.*, p.nombre as producto_nombre, p.costo as producto_costo, p.iva_porcentaje as producto_iva_porcentaje
      FROM detalle_ordenes_compra doc 
      JOIN productos p ON doc.producto_id = p.id 
      WHERE doc.orden_compra_id = ?
    `,
        [id],
      );
      const [ndRows] = await pool.query(
        "SELECT * FROM notas_debito WHERE orden_compra_id = ? LIMIT 1",
        [id]
      );
      res.json({ 
        header: poHeader[0], 
        items: poDetails, 
        debitNote: ndRows.length > 0 ? ndRows[0] : null 
      });
    } catch (error) {
      console.error("Error al obtener detalle de orden de compra:", error);
      res
        .status(500)
        .json({ mensaje: "Error al obtener detalle de la orden de compra." });
    }
  },
);

// Dar entrada a mercancía de una orden de compra (Valida discrepancia y genera Nota de Débito con Subtotal/IVA/Total)
app.post(
  "/api/purchase-orders/:id/receive",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { factura_proveedor, factura_subtotal, factura_iva, items_recibidos } = req.body;

    if (
      !factura_proveedor ||
      factura_subtotal === undefined ||
      factura_iva === undefined ||
      !items_recibidos ||
      !Array.isArray(items_recibidos)
    ) {
      return res
        .status(400)
        .json({ mensaje: "Faltan datos de factura (número, subtotal, IVA) o cantidades recibidas." });
    }

    const subTotalFact = Number(factura_subtotal);
    const ivaFact = Number(factura_iva);
    const totalFact = subTotalFact + ivaFact;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [poRows] = await connection.query(
        "SELECT * FROM ordenes_compra WHERE id = ?",
        [id],
      );
      if (poRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ mensaje: "Orden de compra no encontrada." });
      }
      const po = poRows[0];
      if (po.estado !== "pendiente") {
        await connection.rollback();
        return res
          .status(400)
          .json({ mensaje: "Esta orden de compra ya fue ingresada." });
      }

      const poSubtotal = Number(po.total_costo);
      const poIva = Number(po.iva);
      const poTotal = Number(po.total_con_iva);

      const [detailsRows] = await connection.query(
        "SELECT * FROM detalle_ordenes_compra WHERE orden_compra_id = ?",
        [id],
      );

      let excess_subtotal = 0;
      let excess_iva = 0;
      let excess_total = 0;

      let missing_subtotal = 0;
      let missing_iva = 0;
      let missing_total = 0;

      let tieneDiscrepancia = false;
      const discrepancyDetails = [];

      for (const itemRecibido of items_recibidos) {
        const prodId = itemRecibido.producto_id;
        const cantRecibida = Number(itemRecibido.cantidad_recibida);

        const orderedItem = detailsRows.find((d) => d.producto_id === prodId);
        if (!orderedItem) continue;

        // Actualizar cantidad recibida en detalle
        await connection.query(
          "UPDATE detalle_ordenes_compra SET cantidad_recibida = ? WHERE orden_compra_id = ? AND producto_id = ?",
          [cantRecibida, id, prodId],
        );

        // Sumar existencias al almacén
        await connection.query(
          "UPDATE productos SET stock = stock + ? WHERE id = ?",
          [cantRecibida, prodId],
        );

        await connection.query(
          `INSERT INTO stock_bodegas (producto_id, bodega_id, cantidad) 
           VALUES (?, (SELECT id FROM bodegas WHERE tipo = 'principal'), (SELECT stock FROM productos WHERE id = ?))
           ON DUPLICATE KEY UPDATE cantidad = cantidad + ?`,
          [prodId, prodId, cantRecibida],
        );

        const cantOrdenada = orderedItem.cantidad_ordenada;
        if (cantRecibida !== cantOrdenada) {
          tieneDiscrepancia = true;
          if (cantRecibida > cantOrdenada) {
            const diff = cantRecibida - cantOrdenada;
            const diffSubtotal = diff * Number(orderedItem.costo_unitario);
            const diffIva = diffSubtotal * 0.15;
            const diffTotal = diffSubtotal + diffIva;
            
            excess_subtotal += diffSubtotal;
            excess_iva += diffIva;
            excess_total += diffTotal;

            discrepancyDetails.push(
              `Exceso ${orderedItem.producto_nombre || prodId}: ordenados ${cantOrdenada}, recibidos ${cantRecibida} (+${diff} u. a $${orderedItem.costo_unitario})`
            );
          } else {
            const diff = cantOrdenada - cantRecibida;
            const diffSubtotal = diff * Number(orderedItem.costo_unitario);
            const diffIva = diffSubtotal * 0.15;
            const diffTotal = diffSubtotal + diffIva;

            missing_subtotal += diffSubtotal;
            missing_iva += diffIva;
            missing_total += diffTotal;

            discrepancyDetails.push(
              `Faltante ${orderedItem.producto_nombre || prodId}: ordenados ${cantOrdenada}, recibidos ${cantRecibida} (-${diff} u. a $${orderedItem.costo_unitario})`
            );
          }
        }
      }

      // Validar si el monto total de la factura es mayor
      const esMayorMonto = totalFact > poTotal;
      const esMayorCantidad = excess_total > 0;
      const esMenorCantidad = missing_total > 0;

      let notaDebitoCreada = false;
      let finalEstado = "ingresado";
      
      let tipoNota = "monto";
      let ndSubtotalDiff = 0;
      let ndIvaDiff = 0;
      let ndTotalDiff = 0;
      let descNota = "";

      if (esMayorMonto || esMayorCantidad || esMenorCantidad) {
        finalEstado = "discrepancia";
        notaDebitoCreada = true;

        if (esMayorMonto && esMayorCantidad) {
          tipoNota = "monto_y_cantidad";
          ndSubtotalDiff = (subTotalFact - poSubtotal) + excess_subtotal;
          ndIvaDiff = (ivaFact - poIva) + excess_iva;
          ndTotalDiff = (totalFact - poTotal) + excess_total;
          descNota = `Nota de débito por diferencias en monto de factura y licores en exceso. Factura: ${factura_proveedor}. Detalle: ${discrepancyDetails.join(" | ")}`;
        } else if (esMayorMonto) {
          tipoNota = "monto";
          ndSubtotalDiff = subTotalFact - poSubtotal;
          ndIvaDiff = ivaFact - poIva;
          ndTotalDiff = totalFact - poTotal;
          descNota = `Nota de débito por excedente en valor de factura física contra O.C. Factura: ${factura_proveedor}. Monto Factura: C$${totalFact.toFixed(2)} (C$${subTotalFact.toFixed(2)} subtotal + C$${ivaFact.toFixed(2)} IVA), Sistema: C$${poTotal.toFixed(2)} (C$${poSubtotal.toFixed(2)} subtotal + C$${poIva.toFixed(2)} IVA).`;
        } else if (esMayorCantidad) {
          tipoNota = "cantidad";
          ndSubtotalDiff = excess_subtotal;
          ndIvaDiff = excess_iva;
          ndTotalDiff = excess_total;
          descNota = `Nota de débito por licores recibidos en exceso. Factura: ${factura_proveedor}. Detalle: ${discrepancyDetails.join(" | ")}`;
        } else {
          // Faltante original
          tipoNota = "cantidad";
          ndSubtotalDiff = missing_subtotal;
          ndIvaDiff = missing_iva;
          ndTotalDiff = missing_total;
          descNota = `Nota de débito por licores faltantes en recepción. Factura: ${factura_proveedor}. Detalle: ${discrepancyDetails.join(" | ")}`;
        }

        // Insertar registro de nota de débito con desglose
        await connection.query(
          `INSERT INTO notas_debito (
            orden_compra_id, factura_proveedor, factura_subtotal, factura_iva, factura_total,
            subtotal_diferencia, iva_diferencia, monto_diferencia, tipo, descripcion
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            factura_proveedor.trim(),
            subTotalFact,
            ivaFact,
            totalFact,
            ndSubtotalDiff,
            ndIvaDiff,
            ndTotalDiff,
            tipoNota,
            descNota
          ],
        );
      }

      // Actualizar estado de orden de compra
      await connection.query(
        "UPDATE ordenes_compra SET estado = ? WHERE id = ?",
        [finalEstado, id],
      );

      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "RECEPCION_MERCADERIA",
          `O.C. #${id} recibida. Factura: ${factura_proveedor} (Subtotal: C$${subTotalFact.toFixed(2)}, IVA: C$${ivaFact.toFixed(2)}, Total: C$${totalFact.toFixed(2)}). Nota de débito generada: ${notaDebitoCreada ? `${tipoNota.toUpperCase()} por C$${ndTotalDiff.toFixed(2)}` : "Ninguna"}.`,
        ],
      );

      await connection.commit();
      res.json({
        mensaje: "Entrada de mercadería registrada exitosamente.",
        estado: finalEstado,
        notaDebitoCreada,
        tipoNota,
        montoDiferencia: ndTotalDiff,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error al recibir mercancía:", error);
      res
        .status(500)
        .json({ mensaje: "Error al registrar la recepción de mercancía." });
    } finally {
      connection.release();
    }
  },
);

// Listar todas las notas de débito con todos los campos
app.get(
  "/api/debit-notes",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT nd.*, oc.proveedor_nombre, oc.total_con_iva as orden_compra_total 
        FROM notas_debito nd 
        JOIN ordenes_compra oc ON nd.orden_compra_id = oc.id 
        ORDER BY nd.id DESC
      `);
      res.json(rows);
    } catch (error) {
      console.error("Error al obtener notas de débito:", error);
      res.status(500).json({ mensaje: "Error al obtener notas de débito." });
    }
  },
);

// Obtener detalle de una nota de débito individual
app.get(
  "/api/debit-notes/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [ndRows] = await pool.query(
        `SELECT nd.*, oc.proveedor_nombre, oc.total_con_iva as orden_compra_total, oc.total_costo as orden_compra_subtotal, oc.iva as orden_compra_iva, oc.fecha_creacion as orden_compra_fecha
         FROM notas_debito nd 
         JOIN ordenes_compra oc ON nd.orden_compra_id = oc.id 
         WHERE nd.id = ?`,
        [id]
      );
      if (ndRows.length === 0) {
        return res.status(404).json({ mensaje: "Nota de débito no encontrada." });
      }
      res.json(ndRows[0]);
    } catch (error) {
      console.error("Error al obtener nota de débito:", error);
      res.status(500).json({ mensaje: "Error al obtener detalles de la nota de débito." });
    }
  }
);


// ==========================================
// MÓDULO DE CONTEOS DE INVENTARIO (Consultor)
// ==========================================

// Iniciar un conteo de inventario por categoría
app.post(
  "/api/inventory-counts",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    const { categoria_id, bodega_id, descartarMerma } = req.body;
    if (!categoria_id) {
      return res
        .status(400)
        .json({ mensaje: "Debe seleccionar una categoría para el conteo." });
    }
    if (!bodega_id) {
      return res
        .status(400)
        .json({ mensaje: "Debe seleccionar una bodega para el conteo." });
    }

    const consultorId = req.user.id;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validar si el consultor está autorizado
      if (req.user.rol !== "admin") {
        const [[consultorCheck]] = await connection.query(
          "SELECT conteo_autorizado FROM usuarios WHERE id = ?",
          [consultorId],
        );
        if (!consultorCheck || !consultorCheck.conteo_autorizado) {
          await connection.rollback();
          return res
            .status(403)
            .json({
              mensaje:
                "No ha sido autorizado por su administrador para realizar conteos.",
            });
        }
      }

      // Validar si la categoría tiene productos y obtener stock de la bodega correspondiente
      let products;
      if (Number(bodega_id) === 1) {
        // Bodega Principal
        [products] = await connection.query(
          "SELECT id, stock FROM productos WHERE categoria_id = ?",
          [categoria_id]
        );
      } else {
        // Otras bodegas (Merma o Débito)
        [products] = await connection.query(
          `SELECT p.id, COALESCE(sb.cantidad, 0) as stock
           FROM productos p
           LEFT JOIN stock_bodegas sb ON p.id = sb.producto_id AND sb.bodega_id = ?
           WHERE p.categoria_id = ?`,
          [bodega_id, categoria_id]
        );
      }

      if (products.length === 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({
            mensaje:
              "Esta categoría no tiene productos registrados en catálogo.",
          });
      }

      // Insertar cabecera de conteo
      const [result] = await connection.query(
        "INSERT INTO conteos_inventario (categoria_id, bodega_id, consultor_id, estado) VALUES (?, ?, ?, ?)",
        [categoria_id, bodega_id, consultorId, "borrador"],
      );
      const countId = result.insertId;

      // Obtener la bodega de merma
      const [[mermaBodega]] = await connection.query("SELECT id FROM bodegas WHERE tipo = 'merma'");
      
      if (mermaBodega && (descartarMerma === true || descartarMerma === "true")) {
        // Buscar stock en bodega de merma para TODOS los productos
        const [mermaStocks] = await connection.query(
          "SELECT sb.producto_id, sb.cantidad, p.nombre FROM stock_bodegas sb JOIN productos p ON sb.producto_id = p.id WHERE sb.bodega_id = ? AND sb.cantidad > 0",
          [mermaBodega.id]
        );

        for (const item of mermaStocks) {
          // Descartar merma (fijar a 0)
          await connection.query(
            "UPDATE stock_bodegas SET cantidad = 0 WHERE producto_id = ? AND bodega_id = ?",
            [item.producto_id, mermaBodega.id]
          );

          // Registrar en movimientos_bodega (salida/descarte)
          await connection.query(
            "INSERT INTO movimientos_bodega (producto_id, bodega_origen_id, bodega_destino_id, cantidad, motivo, usuario_id) VALUES (?, ?, NULL, ?, ?, ?)",
            [
              item.producto_id,
              mermaBodega.id,
              item.cantidad,
              `Salida por descarte general de merma autorizado antes de iniciar auditoría física #${countId}`,
              consultorId
            ]
          );

          // Registrar en bitácora
          await connection.query(
            "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, 'SALIDA_MERMA_AUTO', ?)",
            [
              consultorId,
              `Descarte automático general de ${item.cantidad} unidades de merma del producto "${item.nombre}" antes de iniciar la auditoría #${countId}.`
            ]
          );
        }
      }

      // Insertar detalles con stock del sistema al momento de iniciar
      for (const prod of products) {
        await connection.query(
          "INSERT INTO detalle_conteos_inventario (conteo_inventario_id, producto_id, cantidad_sistema) VALUES (?, ?, ?)",
          [countId, prod.id, prod.stock],
        );
      }

      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          consultorId,
          "INICIO_CONTEO_INVENTARIO",
          `Se inició el conteo #${countId} para la categoría ID: ${categoria_id}.`,
        ],
      );

      await connection.commit();
      res
        .status(201)
        .json({
          mensaje: "Conteo de inventario iniciado exitosamente.",
          countId,
        });
    } catch (error) {
      await connection.rollback();
      console.error("Error al iniciar conteo:", error);
      res
        .status(500)
        .json({ mensaje: "Error al iniciar conteo de inventario." });
    } finally {
      connection.release();
    }
  },
);

// Listar conteos de inventario
app.get(
  "/api/inventory-counts",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
      SELECT ci.*, cat.nombre as categoria_nombre, u.nombre as consultor_nombre 
      FROM conteos_inventario ci 
      LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
      LEFT JOIN usuarios u ON ci.consultor_id = u.id 
      ORDER BY ci.id DESC
    `);
      res.json(rows);
    } catch (error) {
      console.error("Error al obtener conteos:", error);
      res.status(500).json({ mensaje: "Error al obtener lista de conteos." });
    }
  },
);

// ==========================================
// MÓDULO DE CONTEOS — Historial y bloqueo
// IMPORTANTE: Esta ruta DEBE ir ANTES de /api/inventory-counts/:id
// ==========================================

app.get(
  "/api/inventory-counts/historial",
  verificarToken,
  verificarRol(["consultor", "admin"]),
  async (req, res) => {
    const consultorId = req.user.id;
    const esAdmin = req.user.rol === "admin";
    const { desde, hasta } = req.query; // filtros de fecha opcionales
    try {
      let whereClause = esAdmin
        ? "WHERE ci.estado = 'aplicado'"
        : "WHERE ci.consultor_id = ? AND ci.estado = 'aplicado'";
      let params = esAdmin ? [] : [consultorId];

      // Aplicar filtro de fecha si se proporcionan ambos valores
      if (desde && hasta) {
        whereClause += ` AND DATE(ci.fecha_aplicado) BETWEEN ? AND ?`;
        params = [...params, desde, hasta];
      } else if (desde) {
        whereClause += ` AND DATE(ci.fecha_aplicado) >= ?`;
        params = [...params, desde];
      } else if (hasta) {
        whereClause += ` AND DATE(ci.fecha_aplicado) <= ?`;
        params = [...params, hasta];
      }
      const [conteos] = await pool.query(
        `SELECT ci.id, ci.fecha_creacion, ci.fecha_aplicado, ci.bodega_id,
                cat.nombre as categoria_nombre, u.nombre as consultor_nombre,
                b.nombre as bodega_nombre,
                COALESCE(SUM(ABS(dci.diferencia)), 0) as total_diferencias,
                COALESCE(SUM(dci.cantidad_sistema), 0) as total_sistema,
                COALESCE(COUNT(dci.id), 0) as total_productos_contados
         FROM conteos_inventario ci
         LEFT JOIN categorias cat ON ci.categoria_id = cat.id
         LEFT JOIN usuarios u ON ci.consultor_id = u.id
         LEFT JOIN bodegas b ON ci.bodega_id = b.id
         LEFT JOIN detalle_conteos_inventario dci ON dci.conteo_inventario_id = ci.id
         ${whereClause}
         GROUP BY ci.id, ci.fecha_creacion, ci.fecha_aplicado, ci.bodega_id, cat.nombre, u.nombre, b.nombre
         ORDER BY ci.fecha_aplicado DESC LIMIT 50`,
        params
      );
      const historial = conteos.map(c => {
        const totalSistema = Number(c.total_sistema) || 0;
        const totalDiferencias = Number(c.total_diferencias) || 0;
        const precision = totalSistema > 0
          ? Math.max(0, 100 - (totalDiferencias / totalSistema * 100))
          : 100;
        return { ...c, porcentaje_precision: parseFloat(precision.toFixed(2)) };
      });

      // Verificar bloqueo: conteo reciente + ventas desde entonces
      const [[ultimoConteo]] = await pool.query(
        `SELECT fecha_aplicado FROM conteos_inventario WHERE estado = 'aplicado'
         ${esAdmin ? '' : 'AND consultor_id = ?'}
         ORDER BY fecha_aplicado DESC LIMIT 1`,
        esAdmin ? [] : [consultorId]
      );
      let bloqueoPorMovimiento = { bloqueado: false, ventasDesde: 0, ventasRequeridas: 5 };
      if (ultimoConteo?.fecha_aplicado) {
        const [[vRow]] = await pool.query(
          "SELECT COUNT(*) as count FROM ventas WHERE fecha > ? AND estado = 'completado'",
          [ultimoConteo.fecha_aplicado]
        );
        const ventasDesde = parseInt(vRow.count);
        bloqueoPorMovimiento = { bloqueado: ventasDesde < 5, ventasDesde, ventasRequeridas: 5 };
      }
      res.json({ historial, bloqueoPorMovimiento });
    } catch (error) {
      console.error("Error al obtener historial de conteos:", error);
      res.status(500).json({ mensaje: "Error al obtener el historial de auditorías." });
    }
  }
);

// Detalle de un conteo de inventario (Sirve para el Reporte Imprimible y captura)
app.get(
  "/api/inventory-counts/:id",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [header] = await pool.query(
        `
      SELECT ci.*, cat.nombre as categoria_nombre, b.nombre as bodega_nombre 
      FROM conteos_inventario ci 
      LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
      LEFT JOIN bodegas b ON ci.bodega_id = b.id
      WHERE ci.id = ?
    `,
        [id],
      );
      if (header.length === 0) {
        return res.status(404).json({ mensaje: "Conteo no encontrado." });
      }

      const [items] = await pool.query(
        `
      SELECT dci.*, p.nombre as producto_nombre, p.costo 
      FROM detalle_conteos_inventario dci 
      JOIN productos p ON dci.producto_id = p.id 
      WHERE dci.conteo_inventario_id = ?
      ORDER BY p.nombre ASC
    `,
        [id],
      );

      res.json({ header: header[0], items });
    } catch (error) {
      console.error("Error al obtener detalle de conteo:", error);
      res
        .status(500)
        .json({ mensaje: "Error al obtener detalles del conteo." });
    }
  },
);

// Guardar borrador del conteo
app.put(
  "/api/inventory-counts/:id",
  verificarToken,
  verificarRol(["consultor", "admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { items } = req.body; // items: [{ producto_id: number, cantidad_contada: number }]

    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ mensaje: "Falta información de cantidades contadas." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validar si el consultor está autorizado (Admin se salta esta verificación)
      const [[consultorCheck]] = await connection.query(
        "SELECT conteo_autorizado, rol FROM usuarios WHERE id = ?",
        [req.user.id],
      );
      if (consultorCheck.rol !== "admin" && (!consultorCheck || !consultorCheck.conteo_autorizado)) {
        await connection.rollback();
        return res
          .status(403)
          .json({
            mensaje:
              "No ha sido autorizado por su administrador para realizar conteos.",
          });
      }

      const [headerRows] = await connection.query(
        "SELECT estado FROM conteos_inventario WHERE id = ?",
        [id],
      );
      if (headerRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ mensaje: "Conteo no encontrado." });
      }
      if (headerRows[0].estado !== "borrador") {
        await connection.rollback();
        return res
          .status(400)
          .json({
            mensaje: "Este conteo ya fue aplicado y no se puede modificar.",
          });
      }

      for (const item of items) {
        const pId = item.producto_id;
        const cantC =
          item.cantidad_contada !== null && item.cantidad_contada !== undefined
            ? Number(item.cantidad_contada)
            : null;

        // Obtener cantidad_sistema
        const [dciRows] = await connection.query(
          "SELECT cantidad_sistema FROM detalle_conteos_inventario WHERE conteo_inventario_id = ? AND producto_id = ?",
          [id, pId],
        );
        if (dciRows.length > 0) {
          const sysQty = dciRows[0].cantidad_sistema;
          const diff = cantC !== null ? cantC - sysQty : null;
          await connection.query(
            "UPDATE detalle_conteos_inventario SET cantidad_contada = ?, diferencia = ? WHERE conteo_inventario_id = ? AND producto_id = ?",
            [cantC, diff, id, pId],
          );
        }
      }

      await connection.commit();
      res.json({
        mensaje: "Borrador del conteo de inventario guardado con éxito.",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error al guardar borrador:", error);
      res.status(500).json({ mensaje: "Error al guardar el borrador." });
    } finally {
      connection.release();
    }
  },
);

// Aplicar conteo a producción (VERIFICA CREDENCIALES DEL CONSULTOR O ADMINISTRADOR)
app.post(
  "/api/inventory-counts/:id/apply",
  verificarToken,
  verificarRol(["consultor", "admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({
          mensaje:
            "Credenciales requeridas para aplicar el conteo.",
        });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Validar credenciales
      const [userRows] = await connection.query(
        "SELECT * FROM usuarios WHERE email = ?",
        [email.trim().toLowerCase()],
      );
      if (userRows.length === 0) {
        await connection.rollback();
        return res.status(401).json({ mensaje: "Credenciales inválidas." });
      }
      const consultor = userRows[0];
      if (consultor.rol !== "consultor" && consultor.rol !== "admin") {
        await connection.rollback();
        return res
          .status(403)
          .json({
            mensaje:
              "Permiso denegado: solo el rol Consultor o Administrador puede firmar esta acción.",
          });
      }

      if (consultor.rol !== "admin" && !consultor.conteo_autorizado) {
        await connection.rollback();
        return res
          .status(403)
          .json({
            mensaje:
              "No ha sido autorizado por su administrador para realizar conteos.",
          });
      }

      const passwordMatch = await bcrypt.compare(password, consultor.password);
      if (!passwordMatch) {
        await connection.rollback();
        return res
          .status(401)
          .json({
            mensaje:
              "Contraseña incorrecta. Operación cancelada.",
          });
      }

      // 2. Verificar estado del conteo
      const [headerRows] = await connection.query(
        "SELECT * FROM conteos_inventario WHERE id = ?",
        [id],
      );
      if (headerRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ mensaje: "Conteo de inventario no encontrado." });
      }
      const header = headerRows[0];
      if (header.estado !== "borrador") {
        await connection.rollback();
        return res
          .status(400)
          .json({
            mensaje: "Este conteo ya fue aplicado a producción anteriormente.",
          });
      }

      const [items] = await connection.query(
        "SELECT * FROM detalle_conteos_inventario WHERE conteo_inventario_id = ?",
        [id],
      );
      const tieneVacios = items.some((i) => i.cantidad_contada === null);
      if (tieneVacios) {
        await connection.rollback();
        return res
          .status(400)
          .json({
            mensaje:
              "No puede aplicar el conteo porque aún hay productos sin contar en el borrador.",
          });
      }

      // 3. Aplicar conteo físico a la bodega correspondiente
      const bodegaId = header.bodega_id || 1;

      for (const item of items) {
        // Si es la Bodega Principal, actualizar el stock de catálogo en productos
        if (Number(bodegaId) === 1) {
          await connection.query("UPDATE productos SET stock = ? WHERE id = ?", [
            item.cantidad_contada,
            item.producto_id,
          ]);
        }

        // Actualizar la cantidad física de la bodega auditada en stock_bodegas
        await connection.query(
          `INSERT INTO stock_bodegas (producto_id, bodega_id, cantidad) 
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)`,
          [item.producto_id, bodegaId, item.cantidad_contada],
        );
      }

      // Actualizar cabecera
      await connection.query(
        "UPDATE conteos_inventario SET estado = ?, fecha_aplicado = NOW() WHERE id = ?",
        ["aplicado", id],
      );

      // Guardar en bitácora
      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "APLICAR_CONTEO_PRODUCCION",
          `Conteo #${id} verificado y aplicado por el consultor ${consultor.nombre}. El inventario real ha sido ajustado.`,
        ],
      );

      await connection.commit();
      res.json({
        mensaje:
          "El conteo ha sido verificado y aplicado exitosamente a las existencias reales en producción.",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error al aplicar conteo a producción:", error);
      res
        .status(500)
        .json({ mensaje: "Error al aplicar el conteo a producción." });
    } finally {
      connection.release();
    }
  },
);

// Toggle de autorización de conteo para consultores
app.post(
  "/api/users/:id/toggle-conteo",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [userRows] = await pool.query(
        "SELECT nombre, rol, conteo_autorizado FROM usuarios WHERE id = ?",
        [id],
      );
      if (userRows.length === 0) {
        return res.status(404).json({ mensaje: "Usuario no encontrado." });
      }
      const targetUser = userRows[0];
      if (targetUser.rol !== "consultor") {
        return res
          .status(400)
          .json({
            mensaje:
              "Solo se puede autorizar o bloquear a usuarios con rol Consultor.",
          });
      }

      const nuevoEstado = targetUser.conteo_autorizado ? 0 : 1;
      await pool.query(
        "UPDATE usuarios SET conteo_autorizado = ? WHERE id = ?",
        [nuevoEstado, id],
      );

      const descAccion = `Se ${nuevoEstado ? "autorizó" : "revocó la autorización de"} conteo de inventario al consultor ${targetUser.nombre} (ID: ${id}).`;
      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [req.user.id, "MODIFICAR_USUARIO_AUTORIZACION", descAccion],
      );

      res.json({
        mensaje: "Autorización de conteo actualizada correctamente.",
        nuevoEstado,
      });
    } catch (error) {
      console.error("Error al cambiar autorización de conteo:", error);
      res
        .status(500)
        .json({ mensaje: "Error al cambiar autorización de conteo." });
    }
  },
);

// ==========================================
// CRUD de Usuarios (Solo Administradores)
// ==========================================

// Crear usuario
app.post(
  "/api/users",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password || !rol) {
      return res
        .status(400)
        .json({ mensaje: "Todos los campos son obligatorios." });
    }

    try {
      const [existing] = await pool.query(
        "SELECT id FROM usuarios WHERE email = ?",
        [email],
      );
      if (existing.length > 0) {
        return res
          .status(400)
          .json({ mensaje: "El correo electrónico ya está registrado." });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      await pool.query(
        "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)",
        [nombre, email, hashedPassword, rol],
      );

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "CREAR_USUARIO",
          `Se creó el usuario ${nombre} con rol ${rol}.`,
        ],
      );

      res.status(201).json({ mensaje: "Usuario creado exitosamente." });
    } catch (error) {
      console.error("Error al crear usuario:", error);
      res.status(500).json({ mensaje: "Error al crear el usuario." });
    }
  },
);

// Modificar usuario
app.put(
  "/api/users/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !rol) {
      return res
        .status(400)
        .json({ mensaje: "Nombre, correo y rol son requeridos." });
    }

    if (Number(id) === req.user.id && rol !== "admin") {
      return res
        .status(400)
        .json({
          mensaje:
            "No puede degradar o cambiar su propio rol de administrador.",
        });
    }

    try {
      const [userRows] = await pool.query(
        "SELECT * FROM usuarios WHERE id = ?",
        [id],
      );
      if (userRows.length === 0) {
        return res.status(404).json({ mensaje: "Usuario no encontrado." });
      }

      const [existing] = await pool.query(
        "SELECT id FROM usuarios WHERE email = ? AND id != ?",
        [email, id],
      );
      if (existing.length > 0) {
        return res
          .status(400)
          .json({
            mensaje: "El correo electrónico ya está en uso por otro usuario.",
          });
      }

      if (password && password.trim() !== "") {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.query(
          "UPDATE usuarios SET nombre = ?, email = ?, password = ?, rol = ? WHERE id = ?",
          [nombre, email, hashedPassword, rol, id],
        );
      } else {
        await pool.query(
          "UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?",
          [nombre, email, rol, id],
        );
      }

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "MODIFICAR_USUARIO",
          `Se modificó el usuario ${nombre} (ID: ${id}).`,
        ],
      );

      res.json({ mensaje: "Usuario actualizado exitosamente." });
    } catch (error) {
      console.error("Error al actualizar usuario:", error);
      res.status(500).json({ mensaje: "Error al actualizar el usuario." });
    }
  },
);

// Eliminar usuario
app.delete(
  "/api/users/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;

    if (Number(id) === req.user.id) {
      return res
        .status(400)
        .json({ mensaje: "No puede eliminarse a sí mismo." });
    }

    try {
      const [userRows] = await pool.query(
        "SELECT nombre FROM usuarios WHERE id = ?",
        [id],
      );
      if (userRows.length === 0) {
        return res.status(404).json({ mensaje: "Usuario no encontrado." });
      }

      const userName = userRows[0].nombre;
      await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "ELIMINAR_USUARIO",
          `Se eliminó al usuario ${userName} (ID: ${id}).`,
        ],
      );

      res.json({ mensaje: "Usuario eliminado exitosamente." });
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      res.status(500).json({ mensaje: "Error al eliminar el usuario." });
    }
  },
);

// ==========================================
// MÓDULO DE PROVEEDORES
// ==========================================

// Listar proveedores
app.get(
  "/api/proveedores",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM proveedores ORDER BY nombre ASC");
      res.json(rows);
    } catch (error) {
      console.error("Error al listar proveedores:", error);
      res.status(500).json({ mensaje: "Error al obtener la lista de proveedores." });
    }
  }
);

// Crear proveedor (Requiere verificar contraseña del admin)
app.post(
  "/api/proveedores",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { nombre, telefono, email, direccion, password, adminPassword } = req.body;
    const passToVerify = password || adminPassword;

    if (!nombre) {
      return res.status(400).json({ mensaje: "El nombre del proveedor es obligatorio." });
    }

    if (!passToVerify) {
      return res.status(400).json({ mensaje: "Debe proporcionar su contraseña de administrador para confirmar." });
    }

    try {
      // Validar contraseña del administrador actual
      const [adminRows] = await pool.query("SELECT password FROM usuarios WHERE id = ?", [req.user.id]);
      if (adminRows.length === 0) {
        return res.status(401).json({ mensaje: "Usuario administrador no encontrado." });
      }

      const admin = adminRows[0];
      const match = await bcrypt.compare(passToVerify, admin.password);
      if (!match) {
        return res.status(401).json({ mensaje: "Contraseña de administrador incorrecta. Operación denegada." });
      }

      // Insertar el proveedor
      const [result] = await pool.query(
        "INSERT INTO proveedores (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)",
        [nombre.trim(), telefono?.trim() || null, email?.trim() || null, direccion?.trim() || null]
      );

      const providerId = result.insertId;

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "CREAR_PROVEEDOR",
          `Se creó el proveedor ${nombre} (ID: ${providerId}).`,
        ]
      );

      res.status(201).json({ mensaje: "Proveedor creado exitosamente.", id: providerId });
    } catch (error) {
      console.error("Error al crear proveedor:", error);
      res.status(500).json({ mensaje: "Error al crear el proveedor." });
    }
  }
);

// Actualizar proveedor
app.put(
  "/api/proveedores/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { nombre, telefono, email, direccion } = req.body;

    if (!nombre) {
      return res.status(400).json({ mensaje: "El nombre del proveedor es obligatorio." });
    }

    try {
      const [result] = await pool.query(
        "UPDATE proveedores SET nombre = ?, telefono = ?, email = ?, direccion = ? WHERE id = ?",
        [nombre.trim(), telefono?.trim() || null, email?.trim() || null, direccion?.trim() || null, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ mensaje: "Proveedor no encontrado." });
      }

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "MODIFICAR_PROVEEDOR",
          `Se modificó el proveedor ${nombre} (ID: ${id}).`,
        ]
      );

      res.json({ mensaje: "Proveedor actualizado exitosamente." });
    } catch (error) {
      console.error("Error al actualizar proveedor:", error);
      res.status(500).json({ mensaje: "Error al actualizar el proveedor." });
    }
  }
);

// Eliminar proveedor (Requiere credenciales de administrador: email y password)
app.delete(
  "/api/proveedores/:id",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ mensaje: "Debe proporcionar el correo y la contraseña de administrador para autorizar la eliminación." });
    }

    try {
      // Validar las credenciales del administrador proporcionado
      const [adminRows] = await pool.query(
        "SELECT * FROM usuarios WHERE email = ?",
        [email.trim().toLowerCase()]
      );
      if (adminRows.length === 0) {
        return res.status(401).json({ mensaje: "Usuario administrador no encontrado." });
      }

      const admin = adminRows[0];
      if (admin.rol !== "admin") {
        return res.status(403).json({ mensaje: "Acceso denegado: el usuario proporcionado no tiene rol de administrador." });
      }

      const match = await bcrypt.compare(password, admin.password);
      if (!match) {
        return res.status(401).json({ mensaje: "Contraseña de administrador incorrecta. Operación denegada." });
      }

      const [provRows] = await pool.query("SELECT nombre FROM proveedores WHERE id = ?", [id]);
      if (provRows.length === 0) {
        return res.status(404).json({ mensaje: "Proveedor no encontrado." });
      }

      const provName = provRows[0].nombre;
      await pool.query("DELETE FROM proveedores WHERE id = ?", [id]);

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "ELIMINAR_PROVEEDOR",
          `Se eliminó al proveedor ${provName} (ID: ${id}) tras validación de credenciales del administrador ${email}.`,
        ]
      );

      res.json({ mensaje: "Proveedor eliminado exitosamente." });
    } catch (error) {
      console.error("Error al eliminar proveedor:", error);
      res.status(500).json({ mensaje: "Error al eliminar el proveedor." });
    }
  }
);

// Asociar productos a proveedor - Obtener productos
app.get(
  "/api/proveedores/:id/productos",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [asociados] = await pool.query(
        `SELECT p.*, cat.nombre as categoria_nombre 
         FROM productos p
         JOIN proveedor_productos pp ON p.id = pp.producto_id
         LEFT JOIN categorias cat ON p.categoria_id = cat.id
         WHERE pp.proveedor_id = ?
         ORDER BY p.nombre ASC`,
        [id]
      );

      const [todos] = await pool.query(
        `SELECT p.*, cat.nombre as categoria_nombre 
         FROM productos p
         LEFT JOIN categorias cat ON p.categoria_id = cat.id
         ORDER BY p.nombre ASC`
      );

      res.json({ associated: asociados, catalog: todos });
    } catch (error) {
      console.error("Error al obtener productos del proveedor:", error);
      res.status(500).json({ mensaje: "Error al obtener productos del proveedor." });
    }
  }
);

// Guardar asociación de productos a proveedor
app.post(
  "/api/proveedores/:id/productos",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { productIds, producto_ids } = req.body;
    const idsToAssociate = productIds || producto_ids;

    if (!idsToAssociate || !Array.isArray(idsToAssociate)) {
      return res.status(400).json({ mensaje: "Debe proporcionar un arreglo de identificadores de producto." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query("DELETE FROM proveedor_productos WHERE proveedor_id = ?", [id]);

      for (const prodId of idsToAssociate) {
        await connection.query(
          "INSERT INTO proveedor_productos (proveedor_id, producto_id) VALUES (?, ?)",
          [id, prodId]
        );
      }

      const [provRows] = await connection.query("SELECT nombre FROM proveedores WHERE id = ?", [id]);
      const provName = provRows.length > 0 ? provRows[0].nombre : id;

      await connection.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [
          req.user.id,
          "ASOCIAR_PRODUCTOS_PROVEEDOR",
          `Se actualizaron los productos asociados al proveedor ${provName} (Total: ${idsToAssociate.length} productos).`,
        ]
      );

      await connection.commit();
      res.json({ mensaje: "Asociaciones de licores actualizadas exitosamente." });
    } catch (error) {
      await connection.rollback();
      console.error("Error al asociar productos:", error);
      res.status(500).json({ mensaje: "Error al actualizar las asociaciones de productos." });
    } finally {
      connection.release();
    }
  }
);

// ==========================================
// MÓDULO DE CAJA (Apertura/Cierre)
// ==========================================

// Apertura de caja del día (vendedor/admin)
app.post(
  "/api/caja/apertura",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    const { monto_apertura } = req.body;
    const vendedorId = req.user.id;
    const hoy = obtenerFechaNicaragua();
    try {
      await reconciliarCajasHuerfanas(pool);

      // 1. Evitar múltiples aperturas globales activas
      const [activeBox] = await pool.query(
        "SELECT c.id, u.nombre FROM cierres_caja c JOIN usuarios u ON c.vendedor_id = u.id WHERE c.tipo = 'apertura' AND c.estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') LIMIT 1"
      );
      if (activeBox.length > 0) {
        return res.status(409).json({ mensaje: `Ya existe una caja activa abierta por el usuario ${activeBox[0].nombre}.` });
      }

      // 2. Comprobar si ya se hizo cierre global hoy (caja del día es única)
      const [cierreHoy] = await pool.query(
        "SELECT id FROM cierres_caja WHERE fecha_caja = ? AND tipo = 'cierre' LIMIT 1",
        [hoy]
      );
      if (cierreHoy.length > 0 && req.user.rol !== 'admin') {
        return res.status(409).json({ mensaje: "La caja del día de hoy ya ha sido cerrada formalmente." });
      }

      const fondo = monto_apertura !== undefined && monto_apertura !== null && !isNaN(parseFloat(monto_apertura))
        ? parseFloat(monto_apertura)
        : 1000.00;

      await pool.query(
        "INSERT INTO cierres_caja (tipo, vendedor_id, fecha_caja, fondo_inicial, estado) VALUES ('apertura', ?, ?, ?, 'abierta')",
        [vendedorId, hoy, fondo]
      );
      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [vendedorId, "APERTURA_CAJA", `Apertura de caja del día ${hoy} con fondo de C$${fondo.toFixed(2)}.`]
      );
      res.status(201).json({ mensaje: "Caja abierta exitosamente.", fondo });
    } catch (error) {
      console.error("Error al abrir caja:", error);
      res.status(500).json({ mensaje: "Error al registrar la apertura de caja." });
    }
  }
);

// Estado de caja del día (global / activo)
app.get(
  "/api/caja/estado-hoy",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    const hoy = obtenerFechaNicaragua();
    try {
      await reconciliarCajasHuerfanas(pool);

      const [apertura] = await pool.query(
        `SELECT c.id, c.vendedor_id, u.nombre as vendedor_nombre, c.fondo_inicial, c.estado, c.fecha_creacion 
         FROM cierres_caja c 
         JOIN usuarios u ON c.vendedor_id = u.id 
         WHERE c.tipo = 'apertura' AND c.estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') 
         ORDER BY c.id DESC LIMIT 1`
      );
      const [cierre] = await pool.query(
        "SELECT id, efectivo_declarado, diferencia, total_ventas_sistema, fecha_creacion, vendedor_id FROM cierres_caja WHERE fecha_caja = ? AND tipo = 'cierre' ORDER BY id DESC LIMIT 1",
        [hoy]
      );
      res.json({
        aperturaActiva: apertura.length > 0 ? apertura[0] : null,
        cierreDia: cierre.length > 0 ? cierre[0] : null,
      });
    } catch (error) {
      console.error("Error al verificar estado de caja:", error);
      res.status(500).json({ mensaje: "Error al obtener el estado de caja." });
    }
  }
);

// Ventas del vendedor para hoy (o por vendedorId para el admin)
app.get(
  "/api/caja/ventas-hoy",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    const targetVendedorId = (req.user.rol === 'admin' && req.query.vendedorId) ? req.query.vendedorId : req.user.id;
    const hoy = obtenerFechaNicaragua();
    try {
      // Obtener la caja activa global
      const [activeBox] = await pool.query(
        "SELECT id, fecha_creacion, vendedor_id FROM cierres_caja WHERE tipo = 'apertura' AND estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') LIMIT 1"
      );

      let ventas = [];
      let totalDia = 0;

      if (activeBox.length > 0 && Number(activeBox[0].vendedor_id) === Number(targetVendedorId)) {
        [ventas] = await pool.query(
          `SELECT v.id, v.total, v.fecha, cl.nombre as cliente_nombre
           FROM ventas v
           LEFT JOIN clientes cl ON v.cliente_id = cl.id
           WHERE v.vendedor_id = ? AND v.fecha >= ? AND v.estado = 'completado'
           ORDER BY v.fecha DESC`,
          [targetVendedorId, activeBox[0].fecha_creacion]
        );
        totalDia = ventas.reduce((acc, v) => acc + Number(v.total), 0);
      }

      res.json({ ventas, totalDia, fecha: hoy });
    } catch (error) {
      console.error("Error al obtener ventas de hoy:", error);
      res.status(500).json({ mensaje: "Error al obtener las ventas del día." });
    }
  }
);

// Autorizar Pre-cierre de caja (credenciales de admin en el frontend de facturación)
app.post(
  "/api/caja/autorizar-cierre",
  verificarToken,
  async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ mensaje: "Debe ingresar el correo y contraseña del administrador." });
    }
    try {
      const [adminRows] = await pool.query(
        "SELECT id, password, rol FROM usuarios WHERE email = ?",
        [email.trim().toLowerCase()]
      );
      if (adminRows.length === 0) {
        return res.status(401).json({ mensaje: "Credenciales de administrador inválidas." });
      }
      const admin = adminRows[0];
      if (admin.rol !== 'admin') {
        return res.status(403).json({ mensaje: "Acceso denegado. Se requiere cuenta de administrador." });
      }
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res.status(401).json({ mensaje: "Contraseña de administrador incorrecta." });
      }

      // Obtener la caja abierta en el sistema
      const [aperturaActiva] = await pool.query(
        "SELECT id FROM cierres_caja WHERE tipo = 'apertura' AND estado = 'abierta' ORDER BY id DESC LIMIT 1"
      );
      if (aperturaActiva.length === 0) {
        return res.status(404).json({ mensaje: "No hay una caja activa abierta para pre-cerrar." });
      }

      await pool.query(
        "UPDATE cierres_caja SET estado = 'por_cerrar' WHERE id = ?",
        [aperturaActiva[0].id]
      );

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [admin.id, "AUTORIZAR_CIERRE_CAJA", `Autorización de cierre para la caja ID ${aperturaActiva[0].id}.`]
      );

      res.json({ mensaje: "Caja pre-cerrada (por cerrar). Ahora el administrador puede realizar el cierre final." });
    } catch (error) {
      console.error("Error al autorizar cierre de caja:", error);
      res.status(500).json({ mensaje: "Error interno en el servidor." });
    }
  }
);

// Cajas pendientes de cierre (GET para el dropdown del administrador)
app.get(
  "/api/caja/pendientes-cierre",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      await reconciliarCajasHuerfanas(pool);

      const [list] = await pool.query(
        `SELECT c.id as apertura_id, c.vendedor_id, u.nombre as vendedor_nombre, c.fecha_caja, c.fondo_inicial
         FROM cierres_caja c
         JOIN usuarios u ON c.vendedor_id = u.id
         WHERE c.tipo = 'apertura' AND c.estado IN ('listo_para_cierre', 'por_cerrar')`
      );
      res.json(list);
    } catch (error) {
      console.error("Error al obtener pendientes de cierre:", error);
      res.status(500).json({ mensaje: "Error al obtener las cajas pendientes de cierre." });
    }
  }
);

// Obtener cajas activas de hoy y sus ventas acumuladas en tiempo real (monitoreo admin)
app.get(
  "/api/caja/estado-cajas-activas",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      await reconciliarCajasHuerfanas(pool);
      const hoy = obtenerFechaNicaragua();

      // Consultar cajas de hoy que estén en estado abierta o por cerrar
      const [activas] = await pool.query(
        `SELECT c.id as apertura_id, c.vendedor_id, u.nombre as vendedor_nombre, c.fecha_caja, c.fondo_inicial, c.estado, c.fecha_creacion
         FROM cierres_caja c
         JOIN usuarios u ON c.vendedor_id = u.id
         WHERE c.tipo = 'apertura' 
           AND c.estado IN ('abierta', 'listo_para_cierre', 'por_cerrar')
           AND c.fecha_caja = ?`,
        [hoy]
      );

      const list = [];
      for (const box of activas) {
        const [[ventasRow]] = await pool.query(
          `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count 
           FROM ventas 
           WHERE vendedor_id = ? AND DATE(fecha) = ? AND estado = 'completado'`,
          [box.vendedor_id, hoy]
        );
        const totalVentas = Number(ventasRow.total);
        const totalVentasCount = Number(ventasRow.count);
        const fondo = Number(box.fondo_inicial);
        const esperado = totalVentas + fondo;

        list.push({
          apertura_id: box.apertura_id,
          vendedor_id: box.vendedor_id,
          vendedor_nombre: box.vendedor_nombre,
          fecha_caja: box.fecha_caja,
          fecha_creacion: box.fecha_creacion,
          estado: box.estado,
          total_ventas: totalVentas,
          total_ventas_count: totalVentasCount,
          fondo_inicial: fondo,
          esperado: esperado
        });
      }

      res.json(list);
    } catch (error) {
      console.error("Error al obtener estado de cajas activas:", error);
      res.status(500).json({ mensaje: "Error al obtener el estado de las cajas activas." });
    }
  }
);

// Cierre de caja final y arqueo (admin)
app.post(
  "/api/caja/cierre",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { efectivo_declarado, observaciones, vendedor_id } = req.body;
    const adminId = req.user.id;
    const hoy = obtenerFechaNicaragua();
    if (!vendedor_id) {
      return res.status(400).json({ mensaje: "Debe seleccionar la caja del vendedor a cerrar." });
    }
    if (efectivo_declarado === undefined || efectivo_declarado === null) {
      return res.status(400).json({ mensaje: "Debe ingresar el efectivo encontrado en caja." });
    }
    try {
      // 1. Obtener la apertura activa en estado listo_para_cierre o por_cerrar para este vendedor
      const [aperturas] = await pool.query(
        "SELECT id, fondo_inicial FROM cierres_caja WHERE vendedor_id = ? AND tipo = 'apertura' AND estado IN ('listo_para_cierre', 'por_cerrar') LIMIT 1",
        [vendedor_id]
      );
      if (aperturas.length === 0) {
        return res.status(404).json({ mensaje: "No se encontró una caja abierta lista para cierre para este vendedor." });
      }
      const aperturaId = aperturas[0].id;
      const fondo = Number(aperturas[0].fondo_inicial); // siempre 1000

      // 2. Obtener el total de ventas del vendedor para el día
      const [[ventasRow]] = await pool.query(
        `SELECT COALESCE(SUM(v.total), 0) as total 
         FROM ventas v 
         WHERE v.vendedor_id = ? AND DATE(v.fecha) = ? AND v.estado = 'completado'`,
        [vendedor_id, hoy]
      );
      const totalVentas = Number(ventasRow.total);
      const efectivoEsperado = totalVentas + fondo;
      const diferencia = Number(efectivo_declarado) - efectivoEsperado;

      // 3. Registrar el cierre
      await pool.query(
        `INSERT INTO cierres_caja (tipo, admin_id, vendedor_id, fecha_caja, fondo_inicial, total_ventas_sistema, efectivo_declarado, diferencia, observaciones, estado)
         VALUES ('cierre', ?, ?, ?, ?, ?, ?, ?, ?, 'cerrada')`,
        [adminId, vendedor_id, hoy, fondo, totalVentas, Number(efectivo_declarado), diferencia, observaciones || null]
      );

      // 4. Cambiar el estado de la apertura a 'cerrada'
      await pool.query(
        "UPDATE cierres_caja SET estado = 'cerrada' WHERE id = ?",
        [aperturaId]
      );

      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
        [adminId, "CIERRE_CAJA", `Cierre de caja del vendedor ID ${vendedor_id} realizado por Admin. Ventas: C$${totalVentas.toFixed(2)}, Efectivo: C$${Number(efectivo_declarado).toFixed(2)}, Diferencia: C$${diferencia.toFixed(2)}.`]
      );

      res.status(201).json({ mensaje: "Cierre de caja registrado.", totalVentas, fondo, efectivoEsperado, diferencia });
    } catch (error) {
      console.error("Error al registrar cierre de caja:", error);
      res.status(500).json({ mensaje: "Error al procesar el cierre de caja." });
    }
  }
);

// Detalle de venta para ticket
app.get(
  "/api/ventas/:id/detalle",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [[venta]] = await pool.query(
        `SELECT v.id, v.total, v.fecha, v.estado, cl.nombre as cliente_nombre, u.nombre as vendedor_nombre
         FROM ventas v
         LEFT JOIN clientes cl ON v.cliente_id = cl.id
         LEFT JOIN usuarios u ON v.vendedor_id = u.id
         WHERE v.id = ?`,
        [id]
      );
      if (!venta) return res.status(404).json({ mensaje: "Venta no encontrada." });
      const [items] = await pool.query(
        `SELECT p.nombre as producto_nombre, dv.cantidad, dv.precio_unitario,
                (dv.cantidad * dv.precio_unitario) as subtotal
         FROM detalle_ventas dv
         JOIN productos p ON dv.producto_id = p.id
         WHERE dv.venta_id = ?`,
        [id]
      );
      res.json({ venta, items });
    } catch (error) {
      console.error("Error al obtener detalle de venta:", error);
      res.status(500).json({ mensaje: "Error al obtener el detalle de la venta." });
    }
  }
);

// Historial de cajas cerradas (admin ve todas; vendedor ve las suyas)
app.get(
  "/api/caja/historial-cajas",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    try {
      const esAdmin = req.user.rol === "admin";
      const userId = req.user.id;

      let query = `
        SELECT 
          c.id,
          c.fecha_caja,
          c.fondo_inicial,
          c.total_ventas_sistema,
          c.efectivo_declarado,
          c.diferencia,
          c.observaciones,
          c.fecha_creacion,
          c.estado,
          u.nombre as vendedor_nombre,
          u.id as vendedor_id,
          a.nombre as admin_nombre
        FROM cierres_caja c
        JOIN usuarios u ON c.vendedor_id = u.id
        LEFT JOIN usuarios a ON c.admin_id = a.id
        WHERE c.tipo = 'cierre'
      `;
      const params = [];

      if (!esAdmin) {
        query += " AND c.vendedor_id = ?";
        params.push(userId);
      }

      query += " ORDER BY c.fecha_creacion DESC LIMIT 100";

      const [rows] = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      console.error("Error al obtener historial de cajas:", error);
      res.status(500).json({ mensaje: "Error al obtener el historial de cajas." });
    }
  }
);

// Ventas de una sesión de caja (por fecha y vendedor, tomadas desde la apertura hasta el cierre)
app.get(
  "/api/caja/sesion-ventas/:cajaId",
  verificarToken,
  verificarRol(["vendedor", "admin"]),
  async (req, res) => {
    const { cajaId } = req.params;
    try {
      // Obtener el cierre de caja para obtener vendedor_id y fecha_caja
      const [[caja]] = await pool.query(
        `SELECT c.vendedor_id, c.fecha_caja, c.fondo_inicial, c.total_ventas_sistema,
                c.efectivo_declarado, c.diferencia, u.nombre as vendedor_nombre
         FROM cierres_caja c
         JOIN usuarios u ON c.vendedor_id = u.id
         WHERE c.id = ? AND c.tipo = 'cierre'`,
        [cajaId]
      );

      if (!caja) {
        return res.status(404).json({ mensaje: "Sesión de caja no encontrada." });
      }

      // Verificar acceso: el vendedor solo puede ver sus propias cajas
      if (req.user.rol !== "admin" && caja.vendedor_id !== req.user.id) {
        return res.status(403).json({ mensaje: "No tienes acceso a esta sesión de caja." });
      }

      // Obtener la apertura correspondiente (misma fecha y vendedor)
      const [[apertura]] = await pool.query(
        `SELECT id, fecha_creacion FROM cierres_caja 
         WHERE vendedor_id = ? AND fecha_caja = ? AND tipo = 'apertura'
         ORDER BY id ASC LIMIT 1`,
        [caja.vendedor_id, caja.fecha_caja]
      );

      // Obtener ventas de esa sesión
      let ventas = [];
      if (apertura) {
        [ventas] = await pool.query(
          `SELECT v.id, v.total, v.fecha, v.estado, cl.nombre as cliente_nombre
           FROM ventas v
           LEFT JOIN clientes cl ON v.cliente_id = cl.id
           WHERE v.vendedor_id = ? 
             AND v.estado = 'completado'
             AND v.fecha >= ?
             AND DATE(v.fecha) = ?
           ORDER BY v.fecha DESC`,
          [caja.vendedor_id, apertura.fecha_creacion, caja.fecha_caja]
        );
      } else {
        // Fallback: todas las ventas de ese día para ese vendedor
        [ventas] = await pool.query(
          `SELECT v.id, v.total, v.fecha, v.estado, cl.nombre as cliente_nombre
           FROM ventas v
           LEFT JOIN clientes cl ON v.cliente_id = cl.id
           WHERE v.vendedor_id = ? AND DATE(v.fecha) = ? AND v.estado = 'completado'
           ORDER BY v.fecha DESC`,
          [caja.vendedor_id, caja.fecha_caja]
        );
      }

      res.json({ caja, ventas });
    } catch (error) {
      console.error("Error al obtener ventas de sesión:", error);
      res.status(500).json({ mensaje: "Error al obtener las ventas de la sesión." });
    }
  }
);

// ==========================================
// MÓDULO DE BODEGAS
// ==========================================

// Listar bodegas con stock total
app.get(
  "/api/bodegas",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    try {
      const [bodegas] = await pool.query("SELECT id, nombre, tipo, descripcion FROM bodegas ORDER BY id ASC");
      for (const bodega of bodegas) {
        const [[stockRow]] = await pool.query(
          "SELECT COALESCE(SUM(cantidad), 0) as totalUnidades, COUNT(DISTINCT producto_id) as totalProductos FROM stock_bodegas WHERE bodega_id = ? AND cantidad > 0",
          [bodega.id]
        );
        bodega.totalUnidades = parseInt(stockRow.totalUnidades);
        bodega.totalProductos = parseInt(stockRow.totalProductos);
      }
      res.json(bodegas);
    } catch (error) {
      console.error("Error al listar bodegas:", error);
      res.status(500).json({ mensaje: "Error al obtener las bodegas." });
    }
  }
);

// Stock detallado de una bodega
app.get(
  "/api/bodegas/:tipo/stock",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    const { tipo } = req.params;
    if (!["principal", "merma", "debito"].includes(tipo)) {
      return res.status(400).json({ mensaje: "Tipo de bodega no válido." });
    }
    try {
      const [[bodega]] = await pool.query("SELECT id, nombre FROM bodegas WHERE tipo = ?", [tipo]);
      if (!bodega) return res.status(404).json({ mensaje: "Bodega no encontrada." });
      const [stock] = await pool.query(
        `SELECT p.id, p.nombre, p.descripcion, p.categoria_id, cat.nombre as categoria, sb.cantidad, p.costo
         FROM stock_bodegas sb
         JOIN productos p ON sb.producto_id = p.id
         LEFT JOIN categorias cat ON p.categoria_id = cat.id
         WHERE sb.bodega_id = ? AND sb.cantidad > 0
         ORDER BY p.nombre ASC`,
        [bodega.id]
      );
      res.json({ bodega: bodega.nombre, tipo, items: stock });
    } catch (error) {
      console.error("Error al obtener stock de bodega:", error);
      res.status(500).json({ mensaje: "Error al obtener el stock de la bodega." });
    }
  }
);

// Verificar si todas las categorías con stock han sido auditadas o si el conteo está bloqueado por falta de ventas
app.get(
  "/api/bodegas/:id/check-audit-status",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      // 1. Obtener la fecha del último conteo aplicado en esta bodega
      const [[lastAudit]] = await pool.query(
        `SELECT MAX(fecha_aplicado) as last_applied 
         FROM conteos_inventario 
         WHERE bodega_id = ? AND estado = 'aplicado'`,
        [id]
      );

      let salesCount = 0;
      let salesNeeded = 5;
      let restrictionActive = false;

      if (lastAudit && lastAudit.last_applied) {
        // 2. Contar ventas completadas después de la fecha del último conteo
        const [[{ count: countSales }]] = await pool.query(
          `SELECT COUNT(*) as count 
           FROM ventas 
           WHERE estado = 'completado' AND fecha > ?`,
          [lastAudit.last_applied]
        );
        salesCount = countSales;
        if (salesCount < salesNeeded) {
          restrictionActive = true;
        }
      }

      // 3. Obtener categorías con stock > 0 en esta bodega
      const [activeCats] = await pool.query(
        `SELECT DISTINCT p.categoria_id
         FROM stock_bodegas sb
         JOIN productos p ON sb.producto_id = p.id
         WHERE sb.bodega_id = ? AND sb.cantidad > 0`,
        [id]
      );

      // 4. Obtener categorías con conteo (borrador o aplicado hoy) en esta bodega
      const [todayCats] = await pool.query(
        `SELECT DISTINCT categoria_id
         FROM conteos_inventario
         WHERE bodega_id = ? AND (estado = 'borrador' OR (estado = 'aplicado' AND DATE(fecha_aplicado) = CURDATE()))`,
        [id]
      );

      const activeCatIds = activeCats.map(c => c.categoria_id).filter(Boolean);
      const todayCatIds = todayCats.map(c => c.categoria_id).filter(Boolean);

      // Bloqueado si la bodega está vacía (como merma vacía), si ya se auditó todo hoy, o si falta registrar ventas
      const allCategoriesCounted = activeCatIds.length === 0 || activeCatIds.every(
        catId => todayCatIds.includes(catId)
      );

      res.json({
        allCategoriesCounted: allCategoriesCounted || restrictionActive,
        restrictionActive,
        salesCount,
        salesNeeded,
        lastAppliedDate: lastAudit ? lastAudit.last_applied : null
      });
    } catch (error) {
      console.error("Error al verificar estado de auditoría de bodega:", error);
      res.status(500).json({ mensaje: "Error al verificar estado de la bodega." });
    }
  }
);

// Descartar de forma manual toda la bodega de merma (baja general de inventario)
app.post(
  "/api/bodegas/merma/descartar",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[mermaBodega]] = await connection.query("SELECT id, nombre FROM bodegas WHERE tipo = 'merma'");
      if (!mermaBodega) {
        await connection.rollback();
        return res.status(404).json({ mensaje: "Bodega de merma no encontrada." });
      }

      // Obtener todos los productos que tienen stock en la bodega de merma
      const [mermaStocks] = await connection.query(
        `SELECT sb.producto_id as id, sb.cantidad, p.nombre, p.costo 
         FROM stock_bodegas sb 
         JOIN productos p ON sb.producto_id = p.id 
         WHERE sb.bodega_id = ? AND sb.cantidad > 0`,
        [mermaBodega.id]
      );

      if (mermaStocks.length === 0) {
        await connection.rollback();
        return res.status(400).json({ mensaje: "No hay productos registrados con stock en la Bodega de Merma." });
      }

      for (const item of mermaStocks) {
        // Poner stock a 0
        await connection.query(
          "UPDATE stock_bodegas SET cantidad = 0 WHERE producto_id = ? AND bodega_id = ?",
          [item.id, mermaBodega.id]
        );

        // Registrar en movimientos_bodega (salida/descarte)
        await connection.query(
          "INSERT INTO movimientos_bodega (producto_id, bodega_origen_id, bodega_destino_id, cantidad, motivo, usuario_id) VALUES (?, ?, NULL, ?, ?, ?)",
          [
            item.id,
            mermaBodega.id,
            item.cantidad,
            "Salida por descarte general manual de merma autorizado",
            req.user.id
          ]
        );

        // Registrar en bitácora
        await connection.query(
          "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, 'SALIDA_MERMA_MANUAL', ?)",
          [
            req.user.id,
            `Descarte manual general autorizado de ${item.cantidad} unidades de merma del producto "${item.nombre}".`
          ]
        );
      }

      await connection.commit();
      res.json({
        mensaje: "Descarte general de merma procesado exitosamente.",
        items: mermaStocks
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error al procesar descarte general de merma:", error);
      res.status(500).json({ mensaje: "Error interno al procesar el descarte general." });
    } finally {
      connection.release();
    }
  }
);

// Transferir entre bodegas (Admite bulk con { items: [{ producto_id, cantidad }] })
app.post(
  "/api/bodegas/transferir",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { items, producto_id, cantidad, bodega_origen_tipo, bodega_destino_tipo, motivo } = req.body;

    if (!bodega_origen_tipo || !bodega_destino_tipo) {
      return res.status(400).json({ mensaje: "Faltan las bodegas de origen y destino." });
    }
    if (bodega_origen_tipo === bodega_destino_tipo) {
      return res.status(400).json({ mensaje: "La bodega de origen y destino deben ser diferentes." });
    }

    // Preparar lista de artículos
    let itemsList = [];
    if (items && Array.isArray(items)) {
      itemsList = items;
    } else {
      if (!producto_id || cantidad === undefined || cantidad === null) {
        return res.status(400).json({ mensaje: "Debe enviar al menos un artículo para transferir." });
      }
      itemsList = [{ producto_id, cantidad }];
    }

    if (itemsList.length === 0) {
      return res.status(400).json({ mensaje: "La lista de transferencia está vacía." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const codigoTraslado = `TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const [[bodegaOrigen]] = await connection.query("SELECT id, nombre FROM bodegas WHERE tipo = ?", [bodega_origen_tipo]);
      const [[bodegaDestino]] = await connection.query("SELECT id, nombre FROM bodegas WHERE tipo = ?", [bodega_destino_tipo]);
      if (!bodegaOrigen || !bodegaDestino) {
        await connection.rollback();
        return res.status(404).json({ mensaje: "Una o ambas bodegas no existen." });
      }

      const itemsProcesados = [];

      for (const item of itemsList) {
        const pId = item.producto_id;
        const cant = parseInt(item.cantidad);

        if (!pId || isNaN(cant) || cant <= 0) {
          throw new Error("Datos de artículo no válidos en la lista de transferencia.");
        }

        // Obtener nombre del producto
        const [[prod]] = await connection.query("SELECT nombre FROM productos WHERE id = ?", [pId]);
        if (!prod) {
          throw new Error(`Producto con ID ${pId} no encontrado.`);
        }

        // Validar stock disponible
        const [[stockOrigen]] = await connection.query(
          "SELECT cantidad FROM stock_bodegas WHERE producto_id = ? AND bodega_id = ?",
          [pId, bodegaOrigen.id]
        );
        const cantDisponible = stockOrigen ? parseInt(stockOrigen.cantidad) : 0;
        if (cantDisponible < cant) {
          throw new Error(`Stock insuficiente en ${bodegaOrigen.nombre} para "${prod.nombre}". Disponible: ${cantDisponible} u., Requerido: ${cant} u.`);
        }

        // Restar de origen
        await connection.query(
          "UPDATE stock_bodegas SET cantidad = cantidad - ? WHERE producto_id = ? AND bodega_id = ?",
          [cant, pId, bodegaOrigen.id]
        );

        // Sumar en destino
        await connection.query(
          `INSERT INTO stock_bodegas (producto_id, bodega_id, cantidad) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
          [pId, bodegaDestino.id, cant]
        );

        // Sincronizar productos.stock si interviene la Bodega Principal
        if (bodega_origen_tipo === 'principal') {
          await connection.query(
            "UPDATE productos SET stock = stock - ? WHERE id = ?",
            [cant, pId]
          );
        }
        if (bodega_destino_tipo === 'principal') {
          await connection.query(
            "UPDATE productos SET stock = stock + ? WHERE id = ?",
            [cant, pId]
          );
        }

        // Registrar movimiento
        await connection.query(
          "INSERT INTO movimientos_bodega (producto_id, bodega_origen_id, bodega_destino_id, cantidad, motivo, usuario_id, codigo_traslado) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [pId, bodegaOrigen.id, bodegaDestino.id, cant, motivo || null, req.user.id, codigoTraslado]
        );

        // Registrar en bitácora
        await connection.query(
          "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)",
          [req.user.id, "TRANSFERENCIA_BODEGA", `Transferencia de ${cant} u. de "${prod.nombre}" de ${bodegaOrigen.nombre} a ${bodegaDestino.nombre}. Motivo: ${motivo || 'N/A'}.`]
        );

        itemsProcesados.push({
          producto_id: pId,
          nombre: prod.nombre,
          cantidad: cant
        });
      }

      await connection.commit();

      res.json({
        mensaje: `Transferencia completada: ${itemsProcesados.length} artículo(s) trasladado(s) de ${bodegaOrigen.nombre} a ${bodegaDestino.nombre}.`,
        detalles: {
          codigo_traslado: codigoTraslado,
          bodega_origen: bodegaOrigen.nombre,
          bodega_destino: bodegaDestino.nombre,
          motivo: motivo || 'N/A',
          items: itemsProcesados,
          fecha: new Date(),
          usuario: req.user.nombre || 'Administrador'
        }
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error en transferencia:", error);
      res.status(400).json({ mensaje: error.message || "Error al procesar la transferencia." });
    } finally {
      connection.release();
    }
  }
);

// Historial de movimientos inter-bodega
app.get(
  "/api/bodegas/movimientos",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const [movimientos] = await pool.query(
        `SELECT mb.id, mb.cantidad, mb.motivo, mb.fecha, mb.codigo_traslado,
                p.nombre as producto_nombre, p.id as producto_id,
                bo.nombre as bodega_origen, bo.tipo as tipo_origen,
                bd.nombre as bodega_destino, bd.tipo as tipo_destino,
                u.nombre as usuario
         FROM movimientos_bodega mb
         LEFT JOIN productos p ON mb.producto_id = p.id
         LEFT JOIN bodegas bo ON mb.bodega_origen_id = bo.id
         LEFT JOIN bodegas bd ON mb.bodega_destino_id = bd.id
         LEFT JOIN usuarios u ON mb.usuario_id = u.id
         ORDER BY mb.fecha DESC LIMIT 100`
      );
      res.json(movimientos);
    } catch (error) {
      console.error("Error al obtener movimientos de bodega:", error);
      res.status(500).json({ mensaje: "Error al obtener el historial de movimientos." });
    }
  }
);
// === MÓDULO DE RESPALDO Y RESTAURACIÓN DE BASE DE DATOS ===

const TABLES_TO_BACKUP = [
  "usuarios",
  "clientes",
  "categorias",
  "productos",
  "ventas",
  "detalle_ventas",
  "consultas",
  "bitacora",
  "ordenes_compra",
  "detalle_ordenes_compra",
  "proveedores",
  "proveedor_productos",
  "notas_debito",
  "conteos_inventario",
  "detalle_conteos_inventario",
  "cierres_caja",
  "bodegas",
  "stock_bodegas",
  "movimientos_bodega"
];

// Generar copia de seguridad (Backup)
app.get(
  "/api/database/backup",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    try {
      const backupData = {};
      
      // Consultar secuencialmente el contenido de cada tabla
      for (const table of TABLES_TO_BACKUP) {
        const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
        // Formatear fechas a cadenas locales YYYY-MM-DD HH:mm:ss para preservar la zona horaria original
        const formattedRows = rows.map(row => {
          const newRow = { ...row };
          for (const key in newRow) {
            if (newRow[key] instanceof Date) {
              const d = newRow[key];
              const pad = (n) => String(n).padStart(2, '0');
              newRow[key] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            }
          }
          return newRow;
        });
        backupData[table] = formattedRows;
      }

      const backupFile = {
        version: "1.2.0",
        fecha: new Date().toISOString(),
        tables: backupData
      };

      res.setHeader("Content-Disposition", 'attachment; filename="licostock_backup.json"');
      res.setHeader("Content-Type", "application/json");
      res.json(backupFile);
    } catch (error) {
      console.error("Error al generar copia de seguridad:", error);
      res.status(500).json({ mensaje: "Error al generar la copia de seguridad de la base de datos." });
    }
  }
);

// Restaurar copia de seguridad (Restore)
app.post(
  "/api/database/restore",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { tables } = req.body;

    if (!tables || typeof tables !== "object") {
      return res.status(400).json({ mensaje: "Estructura de respaldo inválida. Falta el mapa de tablas." });
    }

    // Verificar que contenga al menos tablas críticas
    if (!tables.usuarios || !tables.productos) {
      return res.status(400).json({ mensaje: "El archivo de respaldo está incompleto o corrupto (faltan tablas críticas)." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("SET FOREIGN_KEY_CHECKS = 0");

      // Truncar y repoblar cada tabla en el orden definido
      for (const table of TABLES_TO_BACKUP) {
        // 1. Limpiar tabla actual
        await connection.query(`TRUNCATE TABLE \`${table}\``);

        // 2. Insertar filas si existen en el backup
        const rows = tables[table];
        if (rows && Array.isArray(rows) && rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const values = rows.map(row => columns.map(col => {
            const val = row[col];
            // Validar formato de fecha ISO para parsearlo
            if (val && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
              const parsedDate = new Date(val);
              if (!isNaN(parsedDate.getTime())) {
                return parsedDate;
              }
            }
            return val;
          }));

          const query = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES ?`;
          await connection.query(query, [values]);
        }
      }

      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      await connection.commit();

      // Registrar en la bitácora
      await pool.query(
        "INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, 'RESTAURACION_BD', ?)",
        [
          req.user.id,
          `Restauración completa de la base de datos realizada con éxito desde un archivo de respaldo.`
        ]
      );

      res.json({ mensaje: "Base de datos restaurada exitosamente." });
    } catch (error) {
      await connection.rollback();
      try {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      } catch (err) {}
      console.error("Error al restaurar base de datos:", error);
      res.status(500).json({ mensaje: "Error al restaurar la base de datos: " + error.message });
    } finally {
      connection.release();
    }
  }
);

// Inicializar base de datos y arrancar el servidor
inicializarBaseDatos().then(async () => {
  const timestamp = obtenerTimestampLog();
  console.log(`${timestamp} [RECONCILIACIÓN] Verificando cierres de caja huérfanos de días anteriores...`);
  try {
    await reconciliarCajasHuerfanas(pool);
  } catch (err) {
    console.error(`${timestamp} [RECONCILIACIÓN ERROR] Error en reconciliación inicial:`, err);
  }

  app.listen(PORT, "0.0.0.0", () => {
    const interfaces = os.networkInterfaces();
    const ipsLocales = [];
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipsLocales.push(iface.address);
        }
      }
    }

    const redInfo = ipsLocales.length > 0 
      ? ipsLocales.map(ip => `   • Red Local:    http://${ip}:${PORT}  <-- Usar esta IP en la App Móvil`).join('\n')
      : '   • Red Local:    No se detectó otra interfaz de red';

    console.log(`
===================================================================
SERVIDOR BACKEND INICIADO Y ESCUCHANDO CONEXIONES EN TODO MOMENTO
===================================================================
[CONFIGURACION DE CONEXION BASE DE DATOS (.env)]
   • Host DB:      ${process.env.DB_HOST || '127.0.0.1'}
   • Usuario DB:   ${process.env.DB_USER || 'root'}
   • Base Datos:   ${process.env.DB_NAME || 'proyecto_db'}
   • Puerto App:   ${PORT}

[URLS DE ACCESO PARA DISPOSITIVOS MOVILES / WEB]
   • Localhost:    http://localhost:${PORT}
${redInfo}
===================================================================
[MONITOREO ACTIVO] Registrando conexiones y peticiones en tiempo real...
`);
  });
});
