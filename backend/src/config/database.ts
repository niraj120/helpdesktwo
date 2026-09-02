import mongoose from 'mongoose';

/**
 * Get MongoDB URI - Works with both old and new .env formats
 * Priority: MONGODB_URI > MONGODB_PRODUCTION_URI/MONGODB_LOCAL_URI
 */
const getMongoDBUri = (): string => {
  // First check for MONGODB_URI (used in production .env on server)
  if (process.env.MONGODB_URI) {
    console.log('💾 Using MongoDB from MONGODB_URI');
    return process.env.MONGODB_URI;
  }
  
  // Fallback to new dual-environment format
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const uri = process.env.MONGODB_PRODUCTION_URI;
    if (!uri) {
      // Never silently fall back to localhost in production — that masks a
      // misconfiguration and can point the app at the wrong database.
      throw new Error(
        'FATAL: neither MONGODB_URI nor MONGODB_PRODUCTION_URI is set in production. Refusing to start.',
      );
    }
    console.log('🔐 Using PRODUCTION MongoDB (from MONGODB_PRODUCTION_URI)');
    return uri;
  }
  
  // Development MongoDB
  const uri = process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/sac_helpdesk';
  console.log('💾 Using LOCAL development MongoDB');
  return uri;
};

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = getMongoDBUri();
    
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    console.error('💡 Please check if MongoDB server is running and accessible');
    process.exit(1);
  }
};
