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

export async function inicializarBaseDatos() {
  const dbName = process.env.DB_NAME || 'proyecto_db';
  try {
    // 1. Crear conexión temporal para asegurar la existencia de la Base de Datos
    const tempConnection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    console.log(`Verificando existencia de la base de datos '${dbName}'...`);
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConnection.end();
    console.log(`Base de datos '${dbName}' asegurada.`);

    // 2. Conectar mediante el pool normal
    const connection = await pool.getConnection();
    console.log('Conexión con MySQL establecida correctamente.');

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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS conteos_inventario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        categoria_id INT,
        consultor_id INT,
        estado ENUM('borrador', 'aplicado') NOT NULL DEFAULT 'borrador',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_aplicado TIMESTAMP NULL,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
        FOREIGN KEY (consultor_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS detalle_conteos_inventario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conteo_inventario_id INT NOT NULL,
        producto_id INT NOT NULL,
        cantidad_sistema INT NOT NULL,
        cantidad_contada INT DEFAULT NULL,
        diferencia INT DEFAULT NULL,
        FOREIGN KEY (conteo_inventario_id) REFERENCES conteos_inventario(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    
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
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Ron Flor de Caña 12 Años', 'Ron premium de Nicaragua añejado 12 años, botella 750ml', 35.00, 15, ronId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Ron Zacapa Centenario 23', 'Ron ultra premium de Guatemala, sistema solera, botella 750ml', 55.00, 8, ronId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Whisky Johnnie Walker Black Label', 'Whisky escocés de mezcla añejado 12 años, botella 750ml', 40.00, 20, whiskyId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Whisky Chivas Regal 12 Años', 'Whisky escocés blend premium de 12 años, botella 750ml', 38.00, 12, whiskyId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Aguardiente Antioqueño Sin Azúcar', 'Aguardiente colombiano anisado tradicional, tapa azul, botella 750ml', 18.00, 30, aguardienteId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Aguardiente Néctar Azul', 'Aguardiente anisado sin azúcar, botella 750ml', 16.00, 25, aguardienteId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Cigarros Marlboro Rojo Box 20', 'Cajetilla de cigarros americanos Marlboro Rojo, 20 unidades', 5.00, 100, tabacoId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Cigarros Dunhill Switch', 'Cajetilla de cigarros Dunhill con cápsula de mentol, 20 unidades', 6.50, 50, tabacoId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Cerveza Corona Extra 355ml', 'Cerveza clara mexicana premium, botella de vidrio', 2.00, 200, cervezaId]
      );
      await connection.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)',
        ['Cerveza Heineken Botella 330ml', 'Cerveza lager premium holandesa, botella de vidrio', 2.20, 150, cervezaId]
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

    // Loggear inicialización
    const [adminUser] = await connection.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
    if (adminUser.length > 0) {
      await connection.query(
        'INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES (?, ?, ?)',
        [adminUser[0].id, 'INICIO_SISTEMA', 'La base de datos de la Licorería ha sido inicializada y semillada exitosamente.']
      );
    }

    connection.release();
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error.message);
  }
}

export default pool;
