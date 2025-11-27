/**
 * Database Service - Centralized database operations and connection management
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * Initialize database connection and create tables
     * @param {string} dbPath - Path to SQLite database file
     * @returns {Promise<void>}
     */
    async initialize(dbPath) {
        await this.validateDatabasePermissions(dbPath);
        await this.connect(dbPath);
        await this.createTables();
        this.isInitialized = true;
    }

    /**
     * Connect to SQLite database
     * @param {string} dbPath - Path to database file
     * @returns {Promise<void>}
     */
    async connect(dbPath) {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    reject(err);
                } else {
                    console.log(`Connected to SQLite database: ${dbPath}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Create database tables with proper constraints
     * @returns {Promise<void>}
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Enable foreign key constraints
                this.db.run('PRAGMA foreign_keys = ON;');
                
                // Create tables with proper constraints
                this.db.run(`CREATE TABLE IF NOT EXISTS panels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL CHECK(length(name) > 0),
                    size INTEGER NOT NULL CHECK(size >= 12 AND size <= 42),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                this.db.run(`CREATE TABLE IF NOT EXISTS breakers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    panel_id INTEGER NOT NULL,
                    position INTEGER NOT NULL CHECK(position > 0),
                    slot_position TEXT DEFAULT 'single' CHECK(slot_position IN ('single', 'A', 'B')),
                    label TEXT,
                    amperage INTEGER CHECK(amperage > 0 AND amperage <= 200),
                    monitor BOOLEAN DEFAULT 0,
                    confirmed BOOLEAN DEFAULT 0,
                    breaker_type TEXT DEFAULT 'single' CHECK(breaker_type IN ('single', 'double_pole', 'tandem')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (panel_id) REFERENCES panels (id) ON DELETE CASCADE,
                    UNIQUE(panel_id, position, slot_position)
                )`);

                this.db.run(`CREATE TABLE IF NOT EXISTS rooms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE CHECK(length(name) > 0),
                    level TEXT NOT NULL CHECK(level IN ('basement', 'main', 'upper', 'outside')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                this.db.run(`CREATE TABLE IF NOT EXISTS circuits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    breaker_id INTEGER NOT NULL,
                    room_id INTEGER,
                    type TEXT CHECK(type IN ('outlet', 'lighting', 'heating', 'appliance', 'subpanel')),
                    notes TEXT,
                    subpanel_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (breaker_id) REFERENCES breakers (id) ON DELETE CASCADE,
                    FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
                    FOREIGN KEY (subpanel_id) REFERENCES panels (id) ON DELETE SET NULL
                )`, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Execute a SELECT query that returns a single row
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object|null>}
     */
    async get(query, params = []) {
        this.ensureInitialized();
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Execute a SELECT query that returns multiple rows
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    async all(query, params = []) {
        this.ensureInitialized();
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Execute an INSERT, UPDATE, or DELETE query
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<{id: number, changes: number}>}
     */
    async run(query, params = []) {
        this.ensureInitialized();
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Execute multiple queries in a transaction
     * @param {Function} callback - Function containing database operations
     * @returns {Promise<any>}
     */
    async transaction(callback) {
        this.ensureInitialized();
        await this.run('BEGIN TRANSACTION');
        
        try {
            const result = await callback(this);
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Validate database path and permissions
     * @param {string} dbPath - Database file path
     * @returns {Promise<void>}
     */
    async validateDatabasePermissions(dbPath) {
        return new Promise((resolve, reject) => {
            const dbDir = path.dirname(dbPath);
            
            // Ensure directory exists
            if (!fs.existsSync(dbDir)) {
                try {
                    fs.mkdirSync(dbDir, { recursive: true });
                    console.log(`Created database directory: ${dbDir}`);
                } catch (dirErr) {
                    console.error('Error creating database directory:', dirErr.message);
                    reject(dirErr);
                    return;
                }
            }
            
            // Check directory permissions
            try {
                fs.accessSync(dbDir, fs.constants.W_OK);
                console.log(`Database directory is writable: ${dbDir}`);
            } catch (accessErr) {
                console.error(`Database directory is not writable: ${dbDir}`);
                console.error('Permission details:', accessErr.message);
                console.error('Current user in container:', process.getuid ? `UID=${process.getuid()} GID=${process.getgid()}` : 'Unknown');
                const stats = fs.statSync(dbDir);
                console.error(`Directory permissions: mode=${stats.mode.toString(8)} uid=${stats.uid} gid=${stats.gid}`);
                reject(new Error(`Database directory ${dbDir} is not writable. Check volume mount permissions.`));
                return;
            }
            
            // Check if database file exists and is writable
            if (fs.existsSync(dbPath)) {
                try {
                    fs.accessSync(dbPath, fs.constants.W_OK);
                    console.log(`Database file is writable: ${dbPath}`);
                } catch (dbAccessErr) {
                    console.error(`Database file is read-only: ${dbPath}`);
                    const dbStats = fs.statSync(dbPath);
                    console.error(`Database file permissions: mode=${dbStats.mode.toString(8)} uid=${dbStats.uid} gid=${dbStats.gid}`);
                    console.error('Current user in container:', process.getuid ? `UID=${process.getuid()} GID=${process.getgid()}` : 'Unknown');
                    console.error('\nFIX: Run these commands on your Unraid server:');
                    console.error(`  chmod 644 ${dbPath}`);
                    console.error(`  chown 1001:1001 ${dbPath}`);
                    console.error('Or delete the file to let the application create a new one.');
                    reject(new Error(`Database file ${dbPath} is read-only. See console for fix instructions.`));
                    return;
                }
            }
            
            resolve();
        });
    }

    /**
     * Close database connection gracefully
     * @returns {Promise<void>}
     */
    async close() {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    this.isInitialized = false;
                    resolve();
                }
            });
        });
    }

    /**
     * Ensure database is initialized before operations
     * @private
     */
    ensureInitialized() {
        if (!this.isInitialized || !this.db) {
            throw new Error('Database service not initialized. Call initialize() first.');
        }
    }
}

module.exports = DatabaseService;