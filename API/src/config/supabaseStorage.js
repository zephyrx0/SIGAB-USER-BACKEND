const { createClient } = require('@supabase/supabase-js');
const dns = require('dns').promises;
const https = require('https');
require('dotenv').config();

// Custom DNS resolver function
async function resolveDNS(hostname) {
  const dnsServers = [
    '8.8.8.8',    // Google DNS
    '1.1.1.1',    // Cloudflare DNS
    '208.67.222.222' // OpenDNS
  ];

  for (const dnsServer of dnsServers) {
    try {
      const resolver = new dns.Resolver();
      resolver.setServers([dnsServer]);
      const addresses = await resolver.resolve4(hostname);
      if (addresses && addresses.length > 0) {
        console.log(`Successfully resolved ${hostname} using DNS ${dnsServer}:`, addresses[0]);
        return addresses[0];
      }
    } catch (error) {
      console.error(`Failed to resolve using DNS ${dnsServer}:`, error.message);
    }
  }
  throw new Error(`Could not resolve ${hostname} using any DNS server`);
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL and service key must be provided in environment variables');
  process.exit(1);
}

console.log('Attempting to connect to Supabase with URL:', supabaseUrl);

// Create custom fetch with DNS resolution
const customFetch = async (url, options) => {
  const urlObj = new URL(url);
  try {
    // Resolve IP address
    const ip = await resolveDNS(urlObj.hostname);
    
    // Create new URL with resolved IP
    const resolvedUrl = new URL(url);
    resolvedUrl.hostname = ip;
    
    // Add original hostname in headers
    const headers = {
      ...options.headers,
      'Host': urlObj.hostname,
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive'
    };

    // Create agent with longer timeout
    const agent = new https.Agent({
      keepAlive: true,
      timeout: 30000,
      rejectUnauthorized: false // Only if necessary
    });

    // Perform fetch with resolved IP
    const response = await fetch(resolvedUrl.toString(), {
      ...options,
      headers,
      agent,
      timeout: 30000
    });

    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: customFetch
  }
});

// Test the connection with retry logic
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connection attempt ${i + 1}/${retries}...`);
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      console.log('Successfully connected to Supabase Storage');
      return true;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to Supabase after all attempts');
  return false;
};

// Run connection test
testConnection();

module.exports = supabase;