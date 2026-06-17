import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool, { inicializarBaseDatos } from "./db.js";
import { verificarToken, verificarRol } from "./auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "clave_secreta_para_jwt_12345";

app.use(cors());
app.use(express.json());

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
      });
    } catch (error) {
      console.error("Error en dashboard admin:", error);
      res
        .status(500)
        .json({ mensaje: "Error al cargar los datos del dashboard." });
    }
  },
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

      // Obtener últimos conteos
      let conteos;
      if (esAdmin) {
        [conteos] = await pool.query(`
        SELECT ci.*, cat.nombre as categoria_nombre, u.nombre as consultor_nombre 
        FROM conteos_inventario ci 
        LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
        LEFT JOIN usuarios u ON ci.consultor_id = u.id 
        ORDER BY ci.id DESC LIMIT 10
      `);
      } else {
        [conteos] = await pool.query(
          `
        SELECT ci.*, cat.nombre as categoria_nombre, u.nombre as consultor_nombre 
        FROM conteos_inventario ci 
        LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
        LEFT JOIN usuarios u ON ci.consultor_id = u.id 
        WHERE ci.consultor_id = ? 
        ORDER BY ci.id DESC LIMIT 10
      `,
          [consultorId],
        );
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
      const totalVendido = ventas.reduce(
        (acc, current) => acc + Number(current.total),
        0,
      );

      res.json({
        ventas,
        productos,
        categorias,
        clientes,
        resumen: {
          totalVentasCount: ventas.length,
          totalVendido,
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
// MÓDULO DE ÓRDENES DE COMPRA (Admin)
// ==========================================

// Crear orden de compra (Costo + IVA 16%)
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
      const iva = totalCosto * 0.16;
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
          `Orden de compra #${poId} por $${totalConIva.toFixed(2)} (IVA inc.) para ${proveedor_nombre}.`,
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
      SELECT doc.*, p.nombre as producto_nombre 
      FROM detalle_ordenes_compra doc 
      JOIN productos p ON doc.producto_id = p.id 
      WHERE doc.orden_compra_id = ?
    `,
        [id],
      );
      res.json({ header: poHeader[0], items: poDetails });
    } catch (error) {
      console.error("Error al obtener detalle de orden de compra:", error);
      res
        .status(500)
        .json({ mensaje: "Error al obtener detalle de la orden de compra." });
    }
  },
);

// Dar entrada a mercancía de una orden de compra (Valida discrepancia y genera Nota de Débito)
app.post(
  "/api/purchase-orders/:id/receive",
  verificarToken,
  verificarRol(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { factura_proveedor, items_recibidos } = req.body; // items_recibidos: [{ producto_id: number, cantidad_recibida: number }]

    if (
      !factura_proveedor ||
      !items_recibidos ||
      !Array.isArray(items_recibidos)
    ) {
      return res
        .status(400)
        .json({ mensaje: "Faltan datos de factura o cantidades recibidas." });
    }

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

      const [detailsRows] = await connection.query(
        "SELECT * FROM detalle_ordenes_compra WHERE orden_compra_id = ?",
        [id],
      );

      let totalDiferenciaCosto = 0;
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

        const cantOrdenada = orderedItem.cantidad_ordenada;
        if (cantRecibida !== cantOrdenada) {
          tieneDiscrepancia = true;
          if (cantRecibida < cantOrdenada) {
            const diff = cantOrdenada - cantRecibida;
            const diffCosto = diff * Number(orderedItem.costo_unitario);
            totalDiferenciaCosto += diffCosto;
            discrepancyDetails.push(
              `Prod. ID ${prodId}: ordenados ${cantOrdenada}, recibidos ${cantRecibida} (costo unitario $${orderedItem.costo_unitario})`,
            );
          }
        }
      }

      let notaDebitoCreada = false;
      let finalEstado = "ingresado";
      let montoDebito = 0;

      // Si hay discrepancias (faltó mercadería), generar nota de débito (Costo + IVA 16%)
      if (tieneDiscrepancia && totalDiferenciaCosto > 0) {
        finalEstado = "discrepancia";
        montoDebito = totalDiferenciaCosto * 1.16; // Con IVA 16%

        const descNota = `Nota de débito por faltante en O.C. #${id}. Factura proveedor: ${factura_proveedor}. Detalle: ${discrepancyDetails.join(" | ")}`;
        await connection.query(
          "INSERT INTO notas_debito (orden_compra_id, factura_proveedor, monto_diferencia, descripcion) VALUES (?, ?, ?, ?)",
          [id, factura_proveedor.trim(), montoDebito, descNota],
        );
        notaDebitoCreada = true;
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
          `O.C. #${id} recibida. Factura: ${factura_proveedor}. Nota de débito: ${notaDebitoCreada ? `$${montoDebito.toFixed(2)}` : "Ninguna"}.`,
        ],
      );

      await connection.commit();
      res.json({
        mensaje: "Entrada de mercadería registrada exitosamente.",
        estado: finalEstado,
        notaDebitoCreada,
        montoDiferencia: montoDebito,
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

// Listar todas las notas de débito
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

// ==========================================
// MÓDULO DE CONTEOS DE INVENTARIO (Consultor)
// ==========================================

// Iniciar un conteo de inventario por categoría
app.post(
  "/api/inventory-counts",
  verificarToken,
  verificarRol(["admin", "consultor"]),
  async (req, res) => {
    const { categoria_id } = req.body;
    if (!categoria_id) {
      return res
        .status(400)
        .json({ mensaje: "Debe seleccionar una categoría para el conteo." });
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

      // Validar si la categoría tiene productos
      const [products] = await connection.query(
        "SELECT id, stock FROM productos WHERE categoria_id = ?",
        [categoria_id],
      );
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
        "INSERT INTO conteos_inventario (categoria_id, consultor_id, estado) VALUES (?, ?, ?)",
        [categoria_id, consultorId, "borrador"],
      );
      const countId = result.insertId;

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
      SELECT ci.*, cat.nombre as categoria_nombre 
      FROM conteos_inventario ci 
      LEFT JOIN categorias cat ON ci.categoria_id = cat.id 
      WHERE ci.id = ?
    `,
        [id],
      );
      if (header.length === 0) {
        return res.status(404).json({ mensaje: "Conteo no encontrado." });
      }

      const [items] = await pool.query(
        `
      SELECT dci.*, p.nombre as producto_nombre 
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
  verificarRol(["consultor"]),
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

      // Validar si el consultor está autorizado
      const [[consultorCheck]] = await connection.query(
        "SELECT conteo_autorizado FROM usuarios WHERE id = ?",
        [req.user.id],
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

// Aplicar conteo a producción (VERIFICA CREDENCIALES DEL CONSULTOR)
app.post(
  "/api/inventory-counts/:id/apply",
  verificarToken,
  verificarRol(["consultor"]),
  async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({
          mensaje:
            "Credenciales del Consultor requeridas para aplicar el conteo.",
        });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Validar credenciales de Consultor
      const [userRows] = await connection.query(
        "SELECT * FROM usuarios WHERE email = ?",
        [email.trim().toLowerCase()],
      );
      if (userRows.length === 0) {
        await connection.rollback();
        return res.status(401).json({ mensaje: "Credenciales inválidas." });
      }
      const consultor = userRows[0];
      if (consultor.rol !== "consultor") {
        await connection.rollback();
        return res
          .status(403)
          .json({
            mensaje:
              "Permiso denegado: solo el rol Consultor puede firmar esta acción.",
          });
      }

      if (!consultor.conteo_autorizado) {
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
              "Contraseña del Consultor incorrecta. Operación cancelada.",
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

      // 3. Aplicar conteo física a stock de catálogo
      for (const item of items) {
        await connection.query("UPDATE productos SET stock = ? WHERE id = ?", [
          item.cantidad_contada,
          item.producto_id,
        ]);
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

// Inicializar base de datos y arrancar el servidor
inicializarBaseDatos().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
  });
});
