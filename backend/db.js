import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'proyecto_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const obtenerTimestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
};

export async function inicializarBaseDatos() {
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbUser = process.env.DB_USER || 'root';
  const dbName = process.env.DB_NAME || 'proyecto_db';

  console.log(`${obtenerTimestamp()} [BD INTENTO] Estableciendo contacto con el servidor MySQL (${dbHost}) como usuario '${dbUser}'...`);

  try {
    // 1. Crear conexión temporal para asegurar la existencia de la Base de Datos
    const tempConnection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: process.env.DB_PASSWORD || ''
    });

    console.log(`${obtenerTimestamp()} [BD CHECK] Verificando/Creando base de datos '${dbName}'...`);
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConnection.end();
    console.log(`${obtenerTimestamp()} [BD OK] Base de datos '${dbName}' verificada y lista.`);

    // 2. Conectar mediante el pool normal
    console.log(`${obtenerTimestamp()} [BD POOL] Obteniendo conexión desde el pool de MySQL (Límite: 10 conex)...`);
    const connection = await pool.getConnection();
    console.log(`${obtenerTimestamp()} [BD CONECTADO] Conexión MySQL establecida y activa en el pool.`);

    // Crear tablas base si no existen (en orden de dependencias)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        rol ENUM('admin', 'consultor', 'vendedor') NOT NULL,
        conteo_autorizado TINYINT(1) DEFAULT 1,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        telefono VARCHAR(20) NOT NULL,
        email VARCHAR(100) NOT NULL,
        direccion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        precio DECIMAL(10, 2) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        categoria_id INT,
        costo DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        iva_porcentaje DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
        utilidad_porcentaje DECIMAL(5, 2) NOT NULL DEFAULT 30.00,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_id INT,
        vendedor_id INT,
        total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado ENUM('pendiente', 'completado', 'cancelado') NOT NULL DEFAULT 'completado',
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venta_id INT NOT NULL,
        producto_id INT,
        cantidad INT NOT NULL,
        precio_unitario DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS consultas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_id INT,
        consultor_id INT,
        fecha DATETIME NOT NULL,
        notas TEXT,
        estado ENUM('programada', 'realizada', 'cancelada') NOT NULL DEFAULT 'programada',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (consultor_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS bitacora (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT,
        accion VARCHAR(100) NOT NULL,
        descripcion TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // Asegurar columna conteo_autorizado en la tabla usuarios (por compatibilidad)
    try {
      await connection.query("SELECT conteo_autorizado FROM usuarios LIMIT 1");
    } catch (err) {
      console.log("Agregando columna 'conteo_autorizado' a la tabla 'usuarios'...");
      await connection.query("ALTER TABLE usuarios ADD COLUMN conteo_autorizado TINYINT(1) DEFAULT 1");
    }

    // Asegurar columnas de parametrización en la tabla productos (por compatibilidad)
    const columnasProductos = [
      { nombre: 'costo', definicion: "DECIMAL(10, 2) NOT NULL DEFAULT 0.00" },
      { nombre: 'iva_porcentaje', definicion: "DECIMAL(5, 2) NOT NULL DEFAULT 15.00" },
      { nombre: 'utilidad_porcentaje', definicion: "DECIMAL(5, 2) NOT NULL DEFAULT 30.00" }
    ];

    for (const col of columnasProductos) {
      try {
        await connection.query(`SELECT ${col.nombre} FROM productos LIMIT 1`);
      } catch (err) {
        console.log(`Agregando columna '${col.nombre}' a la tabla 'productos'...`);
        await connection.query(`ALTER TABLE productos ADD COLUMN ${col.nombre} ${col.definicion}`);
        if (col.nombre === 'costo') {
          console.log("Inicializando costo de productos existentes basados en precio...");
          // costo = precio / (1.15 * 1.30) = precio / 1.495
          await connection.query("UPDATE productos SET costo = precio / 1.495 WHERE costo = 0.00 AND precio > 0.00");
        }
      }
    }

    // Crear tablas de órdenes de compra, notas de débito y conteos de inventario
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ordenes_compra (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proveedor_nombre VARCHAR(100) NOT NULL,
        total_costo DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        iva DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total_con_iva DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        estado ENUM('pendiente', 'ingresado', 'discrepancia') NOT NULL DEFAULT 'pendiente',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS detalle_ordenes_compra (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orden_compra_id INT NOT NULL,
        producto_id INT NOT NULL,
        cantidad_ordenada INT NOT NULL,
        cantidad_recibida INT DEFAULT 0,
        costo_unitario DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (orden_compra_id) REFERENCES ordenes_compra(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        telefono VARCHAR(20),
        email VARCHAR(100),
        direccion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS proveedor_productos (
        proveedor_id INT NOT NULL,
        producto_id INT NOT NULL,
        PRIMARY KEY (proveedor_id, producto_id),
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notas_debito (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orden_compra_id INT NOT NULL,
        factura_proveedor VARCHAR(50) NOT NULL,
        monto_diferencia DECIMAL(10, 2) NOT NULL,
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (orden_compra_id) REFERENCES ordenes_compra(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Asegurar nuevas columnas en la tabla notas_debito (por compatibilidad)
    const columnasNotasDebito = [
      { nombre: 'tipo', definicion: "ENUM('monto', 'cantidad', 'monto_y_cantidad') NOT NULL DEFAULT 'monto'" },
      { nombre: 'factura_subtotal', definicion: "DECIMAL(10, 2) NOT NULL DEFAULT 0.00" },
      { nombre: 'factura_iva', definicion: "DECIMAL(10, 2) NOT NULL DEFAULT 0.00" },
      { nombre: 'factura_total', definicion: "DECIMAL(10, 2) NOT NULL DEFAULT 0.00" },
      { nombre: 'subtotal_diferencia', definicion: "DECIMAL(10, 2) NOT NULL DEFAULT 0.00" },
      { nombre: 'iva_diferencia', definicion: "DECIMAL(10, 2) NOT NULL DEFAULT 0.00" }
    ];

    for (const col of columnasNotasDebito) {
      try {
        await connection.query(`SELECT ${col.nombre} FROM notas_debito LIMIT 1`);
      } catch (err) {
        console.log(`Agregando columna '${col.nombre}' a la tabla 'notas_debito'...`);
        await connection.query(`ALTER TABLE notas_debito ADD COLUMN ${col.nombre} ${col.definicion}`);
      }
    }


    await connection.query(`
      CREATE TABLE IF NOT EXISTS conteos_inventario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        categoria_id INT,
        bodega_id INT DEFAULT 1,
        consultor_id INT,
        estado ENUM('borrador', 'aplicado') NOT NULL DEFAULT 'borrador',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_aplicado TIMESTAMP NULL,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
        FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
        FOREIGN KEY (consultor_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS detalle_conteos_inventario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conteo_inventario_id INT NOT NULL,
        producto_id INT NOT NULL,
        cantidad_sistema INT NOT NULL DEFAULT 0,
        cantidad_contada INT DEFAULT NULL,
        diferencia INT DEFAULT NULL,
        FOREIGN KEY (conteo_inventario_id) REFERENCES conteos_inventario(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Asegurar columna 'observaciones' en detalle_conteos_inventario (compatibilidad)
    try {
      await connection.query("SELECT observaciones FROM detalle_conteos_inventario LIMIT 1");
    } catch (err) {
      console.log("Agregando columna 'observaciones' a 'detalle_conteos_inventario'...");
      await connection.query("ALTER TABLE detalle_conteos_inventario ADD COLUMN observaciones TEXT DEFAULT NULL");
    }

    // Asegurar columna 'bodega_id' en conteos_inventario (compatibilidad)
    try {
      await connection.query("SELECT bodega_id FROM conteos_inventario LIMIT 1");
    } catch (err) {
      console.log("Agregando columna 'bodega_id' a 'conteos_inventario'...");
      await connection.query("ALTER TABLE conteos_inventario ADD COLUMN bodega_id INT DEFAULT 1");
      await connection.query("ALTER TABLE conteos_inventario ADD CONSTRAINT fk_conteos_bodegas FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL");
    }

    // === NUEVAS TABLAS: SISTEMA DE CAJA ===
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cierres_caja (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo ENUM('apertura', 'cierre') NOT NULL,
        vendedor_id INT,
        admin_id INT,
        fecha_caja DATE NOT NULL,
        fondo_inicial DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
        total_ventas_sistema DECIMAL(10,2) DEFAULT 0.00,
        efectivo_declarado DECIMAL(10,2) DEFAULT 0.00,
        diferencia DECIMAL(10,2) DEFAULT 0.00,
        estado ENUM('abierta', 'listo_para_cierre', 'por_cerrar', 'cerrada') DEFAULT 'abierta',
        observaciones TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (admin_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // Asegurar columna 'estado' en cierres_caja (compatibilidad)
    try {
      await connection.query("SELECT estado FROM cierres_caja LIMIT 1");
      // Asegurar que el ENUM incluya 'por_cerrar'
      await connection.query("ALTER TABLE cierres_caja MODIFY COLUMN estado ENUM('abierta', 'listo_para_cierre', 'por_cerrar', 'cerrada') DEFAULT 'abierta'");
    } catch (err) {
      console.log("Agregando columna 'estado' a 'cierres_caja'...");
      await connection.query("ALTER TABLE cierres_caja ADD COLUMN estado ENUM('abierta', 'listo_para_cierre', 'por_cerrar', 'cerrada') DEFAULT 'abierta'");
    }

    // Auto-cerrar cajas huérfanas de días anteriores
    try {
      const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hoyNica = formatter.format(new Date());
      await connection.query(
        "UPDATE cierres_caja SET estado = 'cerrada' WHERE tipo = 'apertura' AND estado IN ('abierta', 'listo_para_cierre', 'por_cerrar') AND fecha_caja < ?",
        [hoyNica]
      );
    } catch (e) {
      console.error("Error al auto-cerrar cajas huérfanas en db.js:", e.message);
    }

    // === NUEVAS TABLAS: SISTEMA DE BODEGAS ===
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bodegas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        tipo ENUM('principal', 'merma', 'debito') NOT NULL UNIQUE,
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Poblar bodegas iniciales si no existen
    const [bodegasCheck] = await connection.query("SELECT COUNT(*) as count FROM bodegas");
    if (bodegasCheck[0].count === 0) {
      console.log('Creando bodegas iniciales (Principal, Merma, Débito)...');
      await connection.query(`
        INSERT INTO bodegas (nombre, tipo, descripcion) VALUES
          ('Bodega Principal', 'principal', 'Inventario activo disponible para ventas'),
          ('Bodega de Merma', 'merma', 'Productos dañados, vencidos o con pérdida física'),
          ('Bodega de Débito', 'debito', 'Productos en disputa o retorno por nota de débito')
      `);
      console.log('Bodegas iniciales creadas.');
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS stock_bodegas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT NOT NULL,
        bodega_id INT NOT NULL,
        cantidad INT NOT NULL DEFAULT 0,
        UNIQUE KEY unique_producto_bodega (producto_id, bodega_id),
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
        FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS movimientos_bodega (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT,
        bodega_origen_id INT,
        bodega_destino_id INT,
        cantidad INT NOT NULL,
        motivo TEXT,
        usuario_id INT,
        codigo_traslado VARCHAR(50) DEFAULT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
        FOREIGN KEY (bodega_origen_id) REFERENCES bodegas(id) ON DELETE SET NULL,
        FOREIGN KEY (bodega_destino_id) REFERENCES bodegas(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // Asegurar columna codigo_traslado en movimientos_bodega (compatibilidad)
    try {
      await connection.query("SELECT codigo_traslado FROM movimientos_bodega LIMIT 1");
    } catch (err) {
      console.log("Agregando columna 'codigo_traslado' a 'movimientos_bodega'...");
      await connection.query("ALTER TABLE movimientos_bodega ADD COLUMN codigo_traslado VARCHAR(50) DEFAULT NULL");
    }

    // Verificar si hay que migrar a Licorería
    const [catCheck] = await connection.query("SELECT id FROM categorias WHERE nombre = 'Ron'");
    if (catCheck.length === 0) {
      console.log('Detectada estructura antigua. Limpiando y migrando a Licorería...');
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      await connection.query('TRUNCATE TABLE detalle_ventas');
      await connection.query('TRUNCATE TABLE ventas');
      await connection.query('TRUNCATE TABLE consultas');
      await connection.query('TRUNCATE TABLE productos');
      await connection.query('TRUNCATE TABLE categorias');
      await connection.query('TRUNCATE TABLE detalle_conteos_inventario');
      await connection.query('TRUNCATE TABLE conteos_inventario');
      await connection.query('TRUNCATE TABLE notas_debito');
      await connection.query('TRUNCATE TABLE detalle_ordenes_compra');
      await connection.query('TRUNCATE TABLE ordenes_compra');
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    // 1. Verificar si hay usuarios
    const [usuarios] = await connection.query('SELECT COUNT(*) as count FROM usuarios');
    if (usuarios[0].count === 0) {
      console.log('Insertando usuarios semilla...');
      const salt = await bcrypt.genSalt(10);
      const passAdmin = await bcrypt.hash('admin123', salt);
      const passConsultor = await bcrypt.hash('consultor123', salt);
      const passVendedor = await bcrypt.hash('vendedor123', salt);
      
      await connection.query(
        'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
        ['Admin Sistema', 'admin@sistema.com', passAdmin, 'admin']
      );
      await connection.query(
        'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
        ['Consultor Técnico', 'consultor@sistema.com', passConsultor, 'consultor']
      );
      await connection.query(
        'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
        ['Vendedor Comercial', 'vendedor@sistema.com', passVendedor, 'vendedor']
      );
      console.log('Usuarios semilla creados.');
    }

    // 2. Verificar si hay clientes
    const [clientes] = await connection.query('SELECT COUNT(*) as count FROM clientes');
    if (clientes[0].count === 0) {
      console.log('Insertando clientes semilla...');
      await connection.query(
        'INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)',
        ['Cliente General', '000-0000', 'general@sistema.com', 'Sin dirección especificada']
      );
      await connection.query(
        'INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)',
        ['Juan Pérez', '555-0199', 'juan.perez@email.com', 'Av. Reforma 123, Ciudad de México']
      );
      await connection.query(
        'INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)',
        ['María Gómez', '555-0244', 'maria.gomez@email.com', 'Calle 50 #456, Guadalajara']
      );
      await connection.query(
        'INSERT INTO clientes (nombre, telefono, email, direccion) VALUES (?, ?, ?, ?)',
        ['Carlos López', '555-0377', 'carlos.lopez@email.com', 'Av. Constitución 789, Monterrey']
      );
      console.log('Clientes semilla creados.');
    }

    // 3. Verificar si hay categorias
    const [categorias] = await connection.query('SELECT COUNT(*) as count FROM categorias');
    if (categorias[0].count === 0) {
      console.log('Insertando categorías de Licorería...');
      await connection.query("INSERT INTO categorias (nombre, descripcion) VALUES ('Ron', 'Rones nacionales e internacionales')");
      await connection.query("INSERT INTO categorias (nombre, descripcion) VALUES ('Whisky', 'Whiskies de malta y mezclados')");
      await connection.query("INSERT INTO categorias (nombre, descripcion) VALUES ('Aguardiente', 'Aguardientes tradicionales y licores anisados')");
      await connection.query("INSERT INTO categorias (nombre, descripcion) VALUES ('Tabaco', 'Cigarrillos, habanos y tabacos')");
      await connection.query("INSERT INTO categorias (nombre, descripcion) VALUES ('Cerveza', 'Cervezas nacionales y de importación')");
      console.log('Categorías de Licorería creadas.');
    }

    // 4. Verificar si hay productos
    const [productos] = await connection.query('SELECT COUNT(*) as count FROM productos');
    if (productos[0].count === 0) {
      console.log('Insertando productos de Licorería...');
      const [cats] = await connection.query('SELECT id, nombre FROM categorias');
      const ronId = cats.find(c => c.nombre === 'Ron')?.id;
      const whiskyId = cats.find(c => c.nombre === 'Whisky')?.id;
      const aguardienteId = cats.find(c => c.nombre === 'Aguardiente')?.id;
      const tabacoId = cats.find(c => c.nombre === 'Tabaco')?.id;
      const cervezaId = cats.find(c => c.nombre === 'Cerveza')?.id;

      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Ron Flor de Caña 12 Años', 'Ron premium de Nicaragua añejado 12 años, botella 750ml', 35.00, 15, ronId, 23.41, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Ron Zacapa Centenario 23', 'Ron ultra premium de Guatemala, sistema solera, botella 750ml', 55.00, 8, ronId, 36.79, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Whisky Johnnie Walker Black Label', 'Whisky escocés de mezcla añejado 12 años, botella 750ml', 40.00, 20, whiskyId, 26.76, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Whisky Chivas Regal 12 Años', 'Whisky escocés blend premium de 12 años, botella 750ml', 38.00, 12, whiskyId, 25.42, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Aguardiente Antioqueño Sin Azúcar', 'Aguardiente colombiano anisado tradicional, tapa azul, botella 750ml', 18.00, 30, aguardienteId, 12.04, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Aguardiente Néctar Azul', 'Aguardiente anisado sin azúcar, botella 750ml', 16.00, 25, aguardienteId, 10.70, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Cigarros Marlboro Rojo Box 20', 'Cajetilla de cigarros americanos Marlboro Rojo, 20 unidades', 5.00, 100, tabacoId, 3.34, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Cigarros Dunhill Switch', 'Cajetilla de cigarros Dunhill con cápsula de mentol, 20 unidades', 6.50, 50, tabacoId, 4.35, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Cerveza Corona Extra 355ml', 'Cerveza clara mexicana premium, botella de vidrio', 2.00, 200, cervezaId, 1.34, 15.00, 30.00]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, costo, iva_porcentaje, utilidad_porcentaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Cerveza Heineken Botella 330ml', 'Cerveza lager premium holandesa, botella de vidrio', 2.20, 150, cervezaId, 1.47, 15.00, 30.00]
      );
      console.log('Productos de Licorería creados.');
    }

    // 5 y 6. Verificar si hay ventas
    const [ventas] = await connection.query('SELECT COUNT(*) as count FROM ventas');
    if (ventas[0].count === 0) {
      console.log('Insertando ventas de prueba de Licorería...');
      const [vendedores] = await connection.query("SELECT id FROM usuarios WHERE rol = 'vendedor'");
      const vendedorId = vendedores[0]?.id;
      const [cli] = await connection.query('SELECT id FROM clientes');
      const clienteId = cli[0]?.id;
      const [prod] = await connection.query('SELECT id, precio FROM productos LIMIT 1');

      if (vendedorId && clienteId && prod.length > 0) {
        const totalVenta = Number(prod[0].price || prod[0].precio) * 2;
        await connection.query(
          'INSERT INTO ventas (cliente_id, vendedor_id, total, estado) VALUES (?, ?, ?, ?)',
          [clienteId, vendedorId, totalVenta, 'completado']
        );
        const [lastVenta] = await connection.query('SELECT LAST_INSERT_ID() as id');
        const ventaId = lastVenta[0].id;
        
        await connection.query(
          'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
          [ventaId, prod[0].id, 2, prod[0].precio]
        );
      }
      console.log('Ventas de prueba creadas.');
    }

    // Sincronizar stock_bodegas para la Bodega Principal con los productos existentes
    console.log('Verificando y sincronizando stock_bodegas para la Bodega Principal...');
    await connection.query(`
      INSERT INTO stock_bodegas (producto_id, bodega_id, cantidad)
      SELECT p.id, b.id, p.stock
      FROM productos p
      JOIN bodegas b ON b.tipo = 'principal'
      ON DUPLICATE KEY UPDATE cantidad = p.stock
    `);
    console.log('Stock de Bodega Principal sincronizado.');

    // Loggear inicialización
    const [adminUser] = await connection.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
    if (adminUser.length > 0) {
      await connection.query(
        'INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)',
        [adminUser[0].id, 'INICIO_SISTEMA', 'La base de datos de la Licorería ha sido inicializada y semillada exitosamente.']
      );
    }

    connection.release();
    console.log(`${obtenerTimestamp()} [BD OK] Todas las tablas y semillas de la base de datos están sincronizadas correctamente.`);
  } catch (error) {
    console.error(`${obtenerTimestamp()} [BD ERROR CRÍTICO] Fallo al inicializar la base de datos MySQL: ${error.message}`);
    console.error(`${obtenerTimestamp()} [BD CONSEJO] Por favor verifica que XAMPP / MySQL esté iniciado en el host '${process.env.DB_HOST || '127.0.0.1'}' y que el usuario '${process.env.DB_USER || 'root'}' tenga permisos.`);
  }
}

export default pool;
