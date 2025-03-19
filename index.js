const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de S3
const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY
  }
});


// Configuración de multer para subir archivos
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Conexión a RDS MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

// Obtener usuarios
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Obtener categorías
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM productsCategory');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Obtener productos con filtros dinámicos y paginación
app.get('/api/products-admin', async (req, res) => {
  const { productsCategoryId, storeId, term, page = 1 } = req.query;
  const limit = 10;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM product WHERE 1 = 1';
  let countQuery = 'SELECT COUNT(*) as total FROM product WHERE 1 = 1';
  const params = [];
  const countParams = [];

  if (productsCategoryId) {
    query += ' AND productsCategoryId = ?';
    countQuery += ' AND productsCategoryId = ?';

    params.push(productsCategoryId);
    countParams.push(productsCategoryId);
  }

  if (storeId) {
    query += ' AND storeId = ?';
    countQuery += ' AND storeId = ?';

    params.push(storeId);
    countParams.push(storeId);
  }

  if (term) {
    query += ' AND name LIKE ?';
    countQuery += ' AND name LIKE ?';

    const likeTerm = `%${term}%`;
    params.push(likeTerm);
    countParams.push(likeTerm);
  }

  // Agregar paginación
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  try {
    // Traer productos filtrados y paginados
    const [products] = await pool.query(query, params);

    // Traer el total de registros que cumplen la condición
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Estructura de respuesta solicitada
    res.json({
      data: {
        products,
        pagination: {
          total,
          page: parseInt(page),
          limit,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Obtener productos con filtros dinámicos y paginación
app.get('/api/products', async (req, res) => {
  const { productsCategoryId, storeId, term, page = 1 } = req.query;
  const limit = 10;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM product WHERE 1 = 1 AND active = 1';
  let countQuery = 'SELECT COUNT(*) as total FROM product WHERE 1 = 1 AND active = 1';
  const params = [];
  const countParams = [];

  if (productsCategoryId) {
    query += ' AND productsCategoryId = ?';
    countQuery += ' AND productsCategoryId = ?';

    params.push(productsCategoryId);
    countParams.push(productsCategoryId);
  }

  if (storeId) {
    query += ' AND storeId = ?';
    countQuery += ' AND storeId = ?';

    params.push(storeId);
    countParams.push(storeId);
  }

  if (term) {
    query += ' AND name LIKE ?';
    countQuery += ' AND name LIKE ?';

    const likeTerm = `%${term}%`;
    params.push(likeTerm);
    countParams.push(likeTerm);
  }

  // Agregar paginación
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  try {
    // Traer productos filtrados y paginados
    const [products] = await pool.query(query, params);

    // Traer el total de registros que cumplen la condición
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Estructura de respuesta solicitada
    res.json({
      data: {
        products,
        pagination: {
          total,
          page: parseInt(page),
          limit,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Obtener un producto específico por ID
app.get('/api/product/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM product WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json({
      data: {
        product: rows[0]
      }
    });
  } catch (error) {
    console.error('Error al obtener el producto:', error);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
});

// Crear un nuevo producto
app.post('/api/create-product', upload.single('image'), async (req, res) => {
  const { name, description, price, stock, productsCategoryId, storeId } = req.body;
  let imageUrl = null;
  let imageKey = null;
  
  try {
    // Si hay una imagen, subirla a S3
    if (req.file) {
      // Generar nombre único para la imagen
      const nameWithoutSpaces = name.replace(/\s+/g, '');
      const hash = crypto.randomBytes(8).toString('hex');
      imageKey = `products/${nameWithoutSpaces}-${hash}`;
      
      // Subir a S3
      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: imageKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      };
      
      await s3Client.send(new PutObjectCommand(params));
      
      // Generar URL de la imagen
      imageUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${imageKey}`;
    }
    
    // Insertar en la base de datos
    const [result] = await pool.query(
      'INSERT INTO product (name, description, price, stock, active, imageUrl, imageKey, productsCategoryId, storeId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description, price, stock, 1, imageUrl, imageKey, productsCategoryId, storeId]
    );
    
    res.status(201).json({
      data: {
        id: result.insertId,
        name,
        description,
        price,
        stock,
        active: 1,
        imageUrl,
        imageKey,
        productsCategoryId,
        storeId
      }
    });
  } catch (error) {
    console.error('Error al crear el producto:', error);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

// Actualizar un producto
app.put('/api/update-product/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price, stock, active, productsCategoryId, storeId } = req.body;
  
  try {
    // Obtener el producto actual
    const [currentProduct] = await pool.query('SELECT * FROM product WHERE id = ?', [id]);
    
    if (currentProduct.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    let imageUrl = currentProduct[0].imageUrl;
    let imageKey = currentProduct[0].imageKey;
    
    // Si hay una nueva imagen, actualizar en S3
    if (req.file) {
      // Eliminar imagen anterior si existe
      if (imageKey) {
        const deleteParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: imageKey
        };
        
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      }
      
      // Generar nuevo nombre para la imagen
      const nameWithoutSpaces = name.replace(/\s+/g, '');
      const hash = crypto.randomBytes(8).toString('hex');
      imageKey = `products/${nameWithoutSpaces}-${hash}`;
      
      // Subir nueva imagen a S3
      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: imageKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      };
      
      await s3Client.send(new PutObjectCommand(params));
      
      // Actualizar URL de la imagen
      imageUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${imageKey}`;
    }
    
    // Actualizar en la base de datos
    await pool.query(
      'UPDATE product SET name = ?, description = ?, price = ?, stock = ?, active = ?, imageUrl = ?, imageKey = ?, productsCategoryId = ?, storeId = ? WHERE id = ?',
      [name, description, price, stock, active, imageUrl, imageKey, productsCategoryId, storeId, id]
    );
    
    res.json({
      data: {
        id: parseInt(id),
        name,
        description,
        price,
        stock,
        active,
        imageUrl,
        imageKey,
        productsCategoryId,
        storeId
      }
    });
  } catch (error) {
    console.error('Error al actualizar el producto:', error);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

// Eliminar un producto
app.delete('/api/delete-product/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Obtener información del producto para eliminar la imagen
    const [product] = await pool.query('SELECT imageKey FROM product WHERE id = ?', [id]);
    
    if (product.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    // Si hay una imagen, eliminarla de S3
    if (product[0].imageKey) {
      const deleteParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: product[0].imageKey
      };
      
      await s3Client.send(new DeleteObjectCommand(deleteParams));
    }
    
    // Eliminar de la base de datos
    await pool.query('DELETE FROM product WHERE id = ?', [id]);
    
    res.json({
      message: 'Producto eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar el producto:', error);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});

app.get('/api/stores', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM stores');

        res.json({
            data: {
                stores: rows,
                total: rows.length
            }
        });
    } catch (error) {
        console.error('Error al obtener stores:', error);
        res.status(500).json({ error: 'Error al obtener stores' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

