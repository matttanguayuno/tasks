const Database = require('better-sqlite3');
const db = new Database('./dev.db');

// List tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Query sprints
try {
  const rows = db.prepare("SELECT number, status, trelloBoardId, projectId, id FROM Sprint ORDER BY number ASC").all();
  console.table(rows);
} catch (e) {
  console.log('Sprint table error, trying lowercase...');
  const rows = db.prepare("SELECT * FROM sprint ORDER BY number ASC").all();
  console.table(rows);
}

db.close();
