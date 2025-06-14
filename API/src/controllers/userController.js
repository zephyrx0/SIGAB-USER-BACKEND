const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Fungsi untuk memformat nomor WA
const formatPhoneNumber = (phone) => {
  // Jika nomor dimulai dengan +62, ganti dengan 0
  if (phone.startsWith('+62')) {
    return '0' + phone.substring(3);
  }
  
  // Jika nomor tidak dimulai dengan 0, tambahkan 0
  if (!phone.startsWith('0')) {
    return '0' + phone;
  }
  
  return phone;
};

// Register user baru
exports.register = async (req, res) => {
  try {
    const { nomor_wa, password, nama } = req.body;
    
    // Validasi input
    if (!nomor_wa || !password || !nama) {
      return res.status(400).json({
        status: 'error',
        message: 'Nomor WA, password, dan nama harus diisi'
      });
    }
    
    // Format nomor WA
    const formattedNomorWa = formatPhoneNumber(nomor_wa);
    
    // Cek apakah nomor WA sudah terdaftar
    const checkUser = await pool.query(
      'SELECT * FROM sigab_app."user_app" WHERE nomor_wa = $1',
      [formattedNomorWa]
    );
    
    if (checkUser.rows.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Nomor WA sudah terdaftar'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user baru dengan nama
    const result = await pool.query(
      'INSERT INTO sigab_app."user_app" (nomor_wa, password, nama) VALUES ($1, $2, $3) RETURNING id_user, nomor_wa, nama',
      [formattedNomorWa, hashedPassword, nama]
    );
    
    res.status(201).json({
      status: 'success',
      message: 'Registrasi berhasil',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat registrasi'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { nomor_wa, password } = req.body;
    
    // Validasi input
    if (!nomor_wa || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Nomor WA dan password harus diisi'
      });
    }
    
    // Format nomor WA
    const formattedNomorWa = formatPhoneNumber(nomor_wa);
    
    // Cari user berdasarkan nomor WA
    const result = await pool.query(
      'SELECT id_user, nomor_wa, nama, password FROM sigab_app."user_app" WHERE nomor_wa = $1',
      [formattedNomorWa]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Nomor WA atau password salah'
      });
    }
    
    const user = result.rows[0];
    
    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Nomor WA atau password salah'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id_user: user.id_user,
        nama: user.nama 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Hapus password dari response
    delete user.password;
    
    res.status(200).json({
      status: 'success',
      message: 'Login berhasil',
      data: { 
        ...user,
        token // Token dikirim ke klien
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat login'
    });
  }
};

// Logout user
exports.logoutUser = async (req, res) => {
  try {
    // Since we're using JWT tokens, there's no need to store tokens on the server
    // The client should simply remove the token from local storage
    // This endpoint is just for consistency and future-proofing
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// View user profile
exports.viewProfile = async (req, res) => {
  try {
    const id_user = req.userId; // Menggunakan req.userId sesuai dengan authMiddleware

    const result = await pool.query(
      'SELECT id_user, nomor_wa, nama FROM sigab_app."user_app" WHERE id_user = $1',
      [id_user]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User tidak ditemukan'
      });
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mengambil profil'
    });
  }
};

// Change user profile
exports.changeProfile = async (req, res) => {
  try {
    const id_user = req.userId; // Menggunakan req.userId sesuai dengan authMiddleware
    const { nama, nomor_wa } = req.body;

    if (!nama && !nomor_wa) {
      return res.status(400).json({
        status: 'error',
        message: 'Nama atau Nomor WA harus diisi untuk perubahan'
      });
    }

    let formattedNomorWa;
    if (nomor_wa) {
      formattedNomorWa = formatPhoneNumber(nomor_wa);
      // Cek apakah nomor WA baru sudah terdaftar oleh user lain
      const checkUser = await pool.query(
        'SELECT id_user FROM sigab_app."user_app" WHERE nomor_wa = $1 AND id_user != $2',
        [formattedNomorWa, id_user]
      );
      if (checkUser.rows.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Nomor WA sudah terdaftar oleh pengguna lain'
        });
      }
    }

    const fieldsToUpdate = [];
    const values = [];
    let queryIndex = 1;

    if (nama) {
      fieldsToUpdate.push(`nama = $${queryIndex++}`);
      values.push(nama);
    }
    if (formattedNomorWa) {
      fieldsToUpdate.push(`nomor_wa = $${queryIndex++}`);
      values.push(formattedNomorWa);
    }

    values.push(id_user); // Untuk klausa WHERE

    const updateQuery = `UPDATE sigab_app."user_app" SET ${fieldsToUpdate.join(', ')} WHERE id_user = $${queryIndex} RETURNING id_user, nomor_wa, nama`;

    const result = await pool.query(updateQuery, values);

    res.status(200).json({
      status: 'success',
      message: 'Profil berhasil diperbarui',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat memperbarui profil'
    });
  }
};

// Change user password
exports.changePassword = async (req, res) => {
  try {
    const id_user = req.userId; // Menggunakan req.userId sesuai dengan authMiddleware
    const { old_password, new_password, confirm_new_password } = req.body;

    if (!old_password || !new_password || !confirm_new_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Semua field password harus diisi'
      });
    }

    if (new_password !== confirm_new_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password baru dan konfirmasi password tidak cocok'
      });
    }

    const userResult = await pool.query(
      'SELECT password FROM sigab_app."user_app" WHERE id_user = $1',
      [id_user]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User tidak ditemukan'
      });
    }

    const user = userResult.rows[0];
    const isOldPasswordValid = await bcrypt.compare(old_password, user.password);

    if (!isOldPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Password lama salah'
      });
    }
    
    if (old_password === new_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password baru tidak boleh sama dengan password lama'
      });
    }

    const hashedNewPassword = await bcrypt.hash(new_password, 10);

    await pool.query(
      'UPDATE sigab_app."user_app" SET password = $1 WHERE id_user = $2',
      [hashedNewPassword, id_user]
    );

    res.status(200).json({
      status: 'success',
      message: 'Password berhasil diperbarui'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat memperbarui password'
    });
  }
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000); // 6 digit OTP
};

// Request reset password
exports.requestResetPassword = async (req, res) => {
  try {
    const { nomor_wa } = req.body;
    
    if (!nomor_wa) {
      return res.status(400).json({
        status: 'error',
        message: 'Nomor WA harus diisi'
      });
    }
    
    const formattedNomorWa = formatPhoneNumber(nomor_wa);
    
    // Cek apakah nomor WA terdaftar dan ambil data user
    const user = await pool.query(
      'SELECT id_user, nomor_wa FROM sigab_app."user_app" WHERE nomor_wa = $1',
      [formattedNomorWa]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Nomor WA tidak terdaftar'
      });
    }

    const userWa = user.rows[0].nomor_wa; // Mengambil nomor WA dari database

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 5); // OTP berlaku 5 menit
    
    // Simpan OTP ke database
    await pool.query(
      'UPDATE sigab_app."user_app" SET reset_token = $1, reset_token_expires = $2 WHERE nomor_wa = $3',
      [otp.toString(), otpExpiry, userWa]
    );

    // Kirim OTP via WhatsApp menggunakan Twilio
    const message = `Kode OTP untuk reset password SIGAB Anda adalah: ${otp}\n\nKode ini berlaku selama 5 menit.\nJangan bagikan kode ini kepada siapapun.`;
    
    await client.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+62${userWa.substring(1)}` // Menggunakan nomor WA dari database
    });

    res.status(200).json({
      status: 'success',
      message: 'Kode OTP telah dikirim ke WhatsApp Anda'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat memproses permintaan reset password'
    });
  }
};

// Verify OTP and reset password
exports.resetPassword = async (req, res) => {
  try {
    const { nomor_wa, otp, new_password, confirm_password } = req.body;
    
    if (!nomor_wa || !otp || !new_password || !confirm_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Semua field harus diisi'
      });
    }
    
    if (new_password !== confirm_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password baru dan konfirmasi password tidak cocok'
      });
    }
    
    const formattedNomorWa = formatPhoneNumber(nomor_wa);
    
    // Cek OTP dan expiry time
    const user = await pool.query(
      'SELECT * FROM sigab_app."user_app" WHERE nomor_wa = $1 AND reset_token = $2 AND reset_token_expires > NOW()',
      [formattedNomorWa, otp]
    );
    
    if (user.rows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Kode OTP tidak valid atau sudah kadaluarsa'
      });
    }
    
    // Hash password baru
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update password dan hapus token reset
    await pool.query(
      'UPDATE sigab_app."user_app" SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE nomor_wa = $2',
      [hashedPassword, formattedNomorWa]
    );
    
    res.status(200).json({
      status: 'success',
      message: 'Password berhasil direset'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat mereset password'
    });
  }
};