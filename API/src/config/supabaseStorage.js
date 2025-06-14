const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

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
    // Try to upload a test file
    const testBuffer = Buffer.from('test');
    const { data, error } = await supabase.storage
      .from('images')
      .upload('test.txt', testBuffer, {
        contentType: 'text/plain',
        upsert: true
      });

    if (error) {
      console.error('Error testing connection:', error);
      return false;
    }

    // If upload successful, try to delete the test file
    await supabase.storage
      .from('images')
      .remove(['test.txt']);

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