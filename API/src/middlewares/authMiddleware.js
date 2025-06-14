const jwt = require('jsonwebtoken');
const pool = require('../config/database');

exports.verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        status: 'error',
        message: 'Tidak ada token yang diberikan'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          status: 'error',
          message: 'Token tidak valid'
        });
      }
      
      // Verifikasi apakah user masih ada di database
      const result = await pool.query(
        'SELECT id_user FROM sigab_app."user_app" WHERE id_user = $1',
        [decoded.id_user]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          status: 'error',
          message: 'User tidak ditemukan'
        });
      }
      
      req.userId = decoded.id_user; // id_user dari token disimpan di req.userId
      next();
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat verifikasi token'
    });
  }
};