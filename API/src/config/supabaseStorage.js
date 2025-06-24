const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Add detailed logging
console.log('Attempting to connect to Supabase with:');
console.log('URL:', supabaseUrl);
console.log('Key exists:', !!supabaseKey);
console.log('Key length:', supabaseKey ? supabaseKey.length : 0);

// Validate URL format
if (!supabaseUrl || !supabaseUrl.startsWith('https://') || !supabaseUrl.endsWith('.co')) {
  console.error('Invalid Supabase URL format. URL should start with https:// and end with .co');
  console.error('Current URL:', supabaseUrl);
  process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL and service key must be provided in environment variables');
  process.exit(1);
}

console.log('Initializing Supabase with:', {
  url: supabaseUrl,
  hasKey: !!supabaseKey
});

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  // Add fetch configuration
  fetch: (url, options) => {
    const timeout = 30000; // 30 seconds timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Request timed out')), timeout);
      fetch(url, {
        ...options,
        // Add DNS configuration
        headers: {
          ...options.headers,
          'Accept-Encoding': 'gzip, deflate, br',
        }
      })
        .then(response => {
          clearTimeout(timer);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timer);
          console.error('Fetch error:', error);
          reject(error);
        });
    });
  }
});

// Function to ensure bucket exists
const ensureBucketExists = async () => {
  try {
    // Try to create bucket directly first
      const { error: createError } = await supabase.storage.createBucket('images', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg'],
        fileSizeLimit: 10 * 1024 * 1024 // 10MB
      });

      if (createError) {
      // If bucket already exists, this is fine
      if (createError.message.includes('already exists')) {
        console.log('Images bucket already exists');
        return true;
      }
        console.error('Error creating bucket:', createError);
        throw createError;
      }

      console.log('Images bucket created successfully');
    return true;
  } catch (error) {
    console.error('Error in ensureBucketExists:', error);
    // Don't throw the error, just log it and continue
    return false;
  }
};

// Test the connection
const testConnection = async () => {
  try {
    // Create a very small transparent PNG buffer
    const transparentPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    // Try to upload a test file
    const { data, error } = await supabase.storage
      .from('images')
      .upload('test.png', transparentPngBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (error) {
      console.error('Error testing connection:', error);
      return false;
    }

    // If upload successful, try to delete the test file
    await supabase.storage
      .from('images')
      .remove(['test.png']);

    console.log('Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('Error testing connection:', error);
    return false;
  }
};

// Initialize storage
(async () => {
  try {
    await ensureBucketExists();
    await testConnection();
  } catch (error) {
    console.error('Error initializing storage:', error);
  }
})();

module.exports = supabase;