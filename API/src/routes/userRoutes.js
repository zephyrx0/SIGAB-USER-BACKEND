const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Endpoint untuk register dan login (tidak memerlukan token)
router.post('/register', userController.register);
router.post('/login', userController.login);

// Endpoint yang memerlukan verifikasi token
router.post('/logout', verifyToken, userController.logoutUser);
router.get('/profile', verifyToken, userController.viewProfile);
router.put('/profile', verifyToken, userController.changeProfile);
router.put('/password', verifyToken, userController.changePassword);

// Endpoint untuk forgot password
router.post('/forgot-password', userController.requestResetPassword);
router.post('/reset-password', userController.resetPassword);

module.exports = router;