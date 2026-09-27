import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

export type QueryResult = {
  rows: any[];
  rowCount: number;
  lastInsertRowid?: number;
};

export type QueryStatement = { text: string; params?: any[] };

const DB_PATH = process.env.DB_PATH || './data/timemark.db';
const resolvedDbPath = path.resolve(DB_PATH);
const dataDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory database instance
let db: SqlJsDatabase | null = null;
let dbReady = false;
let initPromise: Promise<SqlJsDatabase> | null = null;

// Initialize database
async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  
  // Load existing database if exists
  if (fs.existsSync(resolvedDbPath)) {
    const fileBuffer = fs.readFileSync(resolvedDbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  dbReady = true;
  startAutoSave();
  return db;
}

// Get database instance
export function getDb(): SqlJsDatabase {
  if (!db || !dbReady) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Save database to file
function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(resolvedDbPath, buffer);
  }
}

// Wait for database initialization (lazy singleton - no race condition)
export async function waitForDb(): Promise<SqlJsDatabase> {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  await initPromise;
  return getDb();
}

// Periodic auto-save (every 5 minutes) as safety net for crash recovery
const SAVE_INTERVAL = 5 * 60 * 1000;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let isDirty = false;

// Debounced save - delays file write by 2 seconds after last write operation
const DEBOUNCE_SAVE_MS = 2000;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function markDirty(): void {
  isDirty = true;
}

function debouncedSave(): void {
  markDirty();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveDatabase();
    isDirty = false;
    debounceTimer = null;
  }, DEBOUNCE_SAVE_MS);
}

function startAutoSave(): void {
  if (saveTimer) return;
  saveTimer = setInterval(() => {
    if (isDirty && db) {
      saveDatabase();
      isDirty = false;
    }
  }, SAVE_INTERVAL);
  // Don't prevent process exit
  if (saveTimer.unref) saveTimer.unref();
}

// Graceful shutdown - exported for unified handler in index.ts
export function gracefulShutdown(): void {
  // Cancel pending debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (db) {
    console.log('[DB] Saving database before shutdown...');
    saveDatabase();
    console.log('[DB] Database saved.');
  }
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
}

const LOG_QUERIES = process.env.LOG_QUERIES === 'true';

/**
 * Convert PostgreSQL-style $1, $2 params to SQLite ? placeholders.
 * WARNING: This is a simple regex replacement. It does NOT handle:
 * - $N inside string literals (e.g., 'price is $5')
 * - Out-of-order parameters (assumes $1, $2, $3... in order)
 * All current queries use sequential params, so this works.
 */
function convertPgParamsToSqlite(text: string): string {
  return text.replace(/\$\d+/g, '?');
}

function isRowReturningQuery(sql: string): boolean {
  const normalized = sql.trim();
  const isSelectLike = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(normalized);
  const hasReturning = /\bRETURNING\b/i.test(normalized);
  return isSelectLike || hasReturning;
}

export async function query(text: string, params: any[] = []): Promise<QueryResult> {
  const start = Date.now();
  const sqliteText = convertPgParamsToSqlite(text);
  
  // Ensure database is ready
  await waitForDb();
  
  try {
    const database = getDb();
    
    if (isRowReturningQuery(sqliteText)) {
      const stmt = database.prepare(sqliteText);
      stmt.bind(params);
      
      const rows: any[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push(row);
      }
      stmt.free();
      
      const duration = Date.now() - start;
      
      if (LOG_QUERIES) {
        console.log('Executed query', { text, duration, rows: rows.length });
      }
      
      return {
        rows,
        rowCount: rows.length,
      };
    }
    
    database.run(sqliteText, params);
    
    const lastId = database.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0];
    const changes = database.getRowsModified();
    
    const duration = Date.now() - start;
    
    if (LOG_QUERIES) {
      console.log('Executed query', { text, duration, rows: changes });
    }
    
    // Debounced save after writes (2-second delay, batches rapid writes)
    debouncedSave();
    
    return {
      rows: [],
      rowCount: changes,
      lastInsertRowid: typeof lastId === 'number' ? lastId : undefined,
    };
  } catch (error) {
    if (LOG_QUERIES) {
      console.error('Query failed', { text, params, error });
    }
    throw error;
  }
}

/** Execute mutation statements atomically against the SQLite database. */
export async function queryTransaction(statements: QueryStatement[]): Promise<QueryResult[]> {
  await waitForDb();
  if (statements.length === 0) return [];

  const database = getDb();
  database.exec('BEGIN TRANSACTION');
  try {
    const results = statements.map(({ text, params = [] }) => {
      const sqliteText = convertPgParamsToSqlite(text);
      if (isRowReturningQuery(sqliteText)) {
        throw new Error('queryTransaction only supports mutation statements');
      }
      database.run(sqliteText, params);
      return { rows: [], rowCount: database.getRowsModified() };
    });

    database.exec('COMMIT');
    debouncedSave();
    return results;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original statement/commit error.
    }
    throw error;
  }
}

export function getClient(): SqlJsDatabase {
  return getDb();
}

export default { query, db: { getClient }, waitForDb };