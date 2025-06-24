const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');
require('dotenv').config();

// Force IPv4
dns.setDefaultResultOrder('ipv4first');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Add detailed logging
console.log('Attempting to connect to Supabase with:');
console.log('URL:', supabaseUrl);
console.log('Key exists:', !!supabaseKey);

// DNS lookup test
dns.lookup(new URL(supabaseUrl).hostname, (err, address, family) => {
  if (err) {
    console.error('DNS lookup error:', err);
  } else {
    console.log('Resolved IP:', address, 'IP version:', family);
  }
});

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL and service key must be provided in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  // Add global fetch configuration
  global: {
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        // Force IPv4
        family: 4,
        // Add longer timeout
        timeout: 30000,
        headers: {
          ...options.headers,
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        }
      });
    }
  }
});

// Test the connection immediately
const testConnection = async () => {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    console.log('Successfully connected to Supabase Storage');
    return true;
  } catch (error) {
    console.error('Failed to connect to Supabase:', error);
    return false;
  }
};

// Run connection test
testConnection();

module.exports = supabase;