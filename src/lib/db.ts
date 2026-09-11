import mongoose, { Connection } from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI!
const ARCHIVE_MONGODB_URI = process.env.ARCHIVE_MONGODB_URI!

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable")
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

interface ArchiveCache {
  conn: Connection | null
  promise: Promise<Connection> | null
}

let cached: MongooseCache = (global as any).mongooseCache || { conn: null, promise: null }

if (!(global as any).mongooseCache) {
  (global as any).mongooseCache = cached
}

let archiveCached: ArchiveCache = (global as any).mongooseArchiveCache || { conn: null, promise: null }

if (!(global as any).mongooseArchiveCache) {
  (global as any).mongooseArchiveCache = archiveCached
}

export async function connectDB() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    throw e
  }

  return cached.conn
}

export async function connectArchiveDB() {
  if (archiveCached.conn) return archiveCached.conn

  if (!archiveCached.promise) {
    const archiveUri = ARCHIVE_MONGODB_URI || MONGODB_URI.replace(/\/logiflow$/, "/logiflow_archive")
    archiveCached.promise = mongoose.createConnection(archiveUri, {
      bufferCommands: false,
    }).asPromise()
  }

  try {
    archiveCached.conn = await archiveCached.promise
  } catch (e) {
    archiveCached.promise = null
    throw e
  }

  return archiveCached.conn
}
