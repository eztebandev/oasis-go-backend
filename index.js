const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

// Importar la biblioteca de Google Maps Fleet Routing
const { google } = require('googleapis');
const axios = require('axios');

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

// Configuración de la API de Google Maps Fleet Routing
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const fleetRoutingBaseUrl = 'https://fleetrouting.googleapis.com/v1';

app.post('/api/register-user', async (req, res) => {
  const { name, email, password } = req.body;
  const [rows] = await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password]);
  res.json(rows);
});

app.get('/api/my-store', async (req, res) => {
  const { userId } = req.query;
  const [rows] = await pool.query('SELECT * FROM stores WHERE userId = ?', [userId]);
  res.json(rows);
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

// Endpoint para optimizar rutas de entrega
app.post('/api/optimize-routes', async (req, res) => {
  try {
    const { 
      vehicles, 
      deliveryLocations,
      depot,
      timeWindows
    } = req.body;
    
    // Construir la solicitud para la API de Fleet Routing
    const requestBody = {
      model: {
        globalStartTime: {
          seconds: Math.floor(Date.now() / 1000)
        },
        globalEndTime: {
          seconds: Math.floor(Date.now() / 1000) + 86400 // 24 horas después
        },
        vehicles: vehicles.map((vehicle, index) => ({
          vehicleId: vehicle.id.toString(),
          loadLimits: {
            weight: {
              maxLoad: vehicle.maxWeight || 1000
            }
          },
          startLocation: {
            latitude: depot.latitude,
            longitude: depot.longitude
          },
          endLocation: {
            latitude: depot.latitude,
            longitude: depot.longitude
          }
        })),
        shipments: deliveryLocations.map((location, index) => ({
          shipmentId: location.id.toString(),
          deliveries: [{
            arrivalLocation: {
              latitude: location.latitude,
              longitude: location.longitude
            },
            duration: {
              seconds: 300 // 5 minutos para la entrega
            },
            timeWindows: timeWindows ? [{
              startTime: {
                seconds: Math.floor(new Date(timeWindows.start).getTime() / 1000)
              },
              endTime: {
                seconds: Math.floor(new Date(timeWindows.end).getTime() / 1000)
              }
            }] : []
          }],
          loadDemands: {
            weight: {
              amount: location.weight || 1
            }
          }
        }))
      },
      solvingMode: 'SOLVE'
    };
    
    // Realizar la solicitud a la API de Fleet Routing
    const response = await axios.post(
      `${fleetRoutingBaseUrl}/optimizeRoutes?key=${GOOGLE_MAPS_API_KEY}`,
      requestBody
    );
    
    // Procesar y devolver los resultados
    res.json({
      data: {
        routes: response.data.routes,
        metrics: response.data.metrics
      }
    });
  } catch (error) {
    console.error('Error al optimizar rutas:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error al optimizar rutas',
      details: error.response?.data || error.message
    });
  }
});

// Endpoint para obtener información de ruta entre dos puntos
app.post('/api/route-info', async (req, res) => {
  try {
    const { origin, destination, waypoints, mode = 'driving' } = req.body;
    
    // Construir la URL para la API de Directions
    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;
    
    // Agregar waypoints si existen
    if (waypoints && waypoints.length > 0) {
      const waypointsStr = waypoints.map(wp => `${wp.latitude},${wp.longitude}`).join('|');
      url += `&waypoints=${waypointsStr}`;
    }
    
    // Realizar la solicitud a la API de Directions
    const response = await axios.get(url);
    
    // Procesar y devolver los resultados
    res.json({
      data: {
        routes: response.data.routes,
        distance: response.data.routes[0]?.legs.reduce((acc, leg) => acc + leg.distance.value, 0) || 0,
        duration: response.data.routes[0]?.legs.reduce((acc, leg) => acc + leg.duration.value, 0) || 0,
        status: response.data.status
      }
    });
  } catch (error) {
    console.error('Error al obtener información de ruta:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error al obtener información de ruta',
      details: error.response?.data || error.message
    });
  }
});

// Endpoint para geocodificar direcciones
app.post('/api/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    
    // Realizar la solicitud a la API de Geocoding
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    // Procesar y devolver los resultados
    res.json({
      data: {
        results: response.data.results,
        status: response.data.status
      }
    });
  } catch (error) {
    console.error('Error al geocodificar dirección:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error al geocodificar dirección',
      details: error.response?.data || error.message
    });
  }
});

// Endpoint para geocodificación inversa (coordenadas a dirección)
app.post('/api/reverse-geocode', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    // Realizar la solicitud a la API de Geocoding inversa
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    // Procesar y devolver los resultados
    res.json({
      data: {
        results: response.data.results,
        status: response.data.status
      }
    });
  } catch (error) {
    console.error('Error en geocodificación inversa:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error en geocodificación inversa',
      details: error.response?.data || error.message
    });
  }
});

// Endpoint para guardar una ruta planificada
app.post('/api/save-route', async (req, res) => {
  try {
    const { 
      name,
      description,
      vehicleId,
      stops,
      estimatedDistance,
      estimatedDuration,
      scheduledDate,
      storeId
    } = req.body;
    
    // Insertar la ruta en la base de datos
    const [routeResult] = await pool.query(
      'INSERT INTO routes (name, description, vehicleId, estimatedDistance, estimatedDuration, scheduledDate, storeId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description, vehicleId, estimatedDistance, estimatedDuration, scheduledDate, storeId]
    );
    
    const routeId = routeResult.insertId;
    
    // Insertar las paradas de la ruta
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      await pool.query(
        'INSERT INTO route_stops (routeId, orderId, address, latitude, longitude, stopOrder, estimatedArrivalTime) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [routeId, stop.orderId, stop.address, stop.latitude, stop.longitude, i, stop.estimatedArrivalTime]
      );
    }
    
    res.status(201).json({
      data: {
        id: routeId,
        name,
        description,
        vehicleId,
        stops,
        estimatedDistance,
        estimatedDuration,
        scheduledDate,
        storeId
      }
    });
  } catch (error) {
    console.error('Error al guardar ruta:', error);
    res.status(500).json({ error: 'Error al guardar ruta' });
  }
});

// Endpoint para obtener rutas planificadas
app.get('/api/routes', async (req, res) => {
  try {
    const { storeId, date, page = 1 } = req.query;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM routes WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM routes WHERE 1=1';
    const params = [];
    const countParams = [];
    
    if (storeId) {
      query += ' AND storeId = ?';
      countQuery += ' AND storeId = ?';
      params.push(storeId);
      countParams.push(storeId);
    }
    
    if (date) {
      query += ' AND DATE(scheduledDate) = DATE(?)';
      countQuery += ' AND DATE(scheduledDate) = DATE(?)';
      params.push(date);
      countParams.push(date);
    }
    
    query += ' ORDER BY scheduledDate DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [routes] = await pool.query(query, params);
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;
    
    // Para cada ruta, obtener sus paradas
    for (const route of routes) {
      const [stops] = await pool.query(
        'SELECT * FROM route_stops WHERE routeId = ? ORDER BY stopOrder',
        [route.id]
      );
      route.stops = stops;
    }
    
    res.json({
      data: {
        routes,
        pagination: {
          total,
          page: parseInt(page),
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener rutas:', error);
    res.status(500).json({ error: 'Error al obtener rutas' });
  }
});

// Endpoint para obtener una ruta específica
app.get('/api/routes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [routes] = await pool.query('SELECT * FROM routes WHERE id = ?', [id]);
    
    if (routes.length === 0) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }
    
    const route = routes[0];
    
    // Obtener las paradas de la ruta
    const [stops] = await pool.query(
      'SELECT * FROM route_stops WHERE routeId = ? ORDER BY stopOrder',
      [id]
    );
    
    route.stops = stops;
    
    res.json({
      data: {
        route
      }
    });
  } catch (error) {
    console.error('Error al obtener ruta:', error);
    res.status(500).json({ error: 'Error al obtener ruta' });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

