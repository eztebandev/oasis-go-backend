const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

// Obtener productos con filtros dinámicos
app.get('/api/products', async (req, res) => {
  const { productsCategoryId, storeId, term } = req.query;

  let query = 'SELECT * FROM product WHERE 1 = 1 AND active = 1';
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

  try {
    // Traer productos filtrados
    const [products] = await pool.query(query, params);

    // Traer el total de registros que cumplen la condición
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    // Estructura de respuesta solicitada
    res.json({
      data: {
        products,
        total
      }
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
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

