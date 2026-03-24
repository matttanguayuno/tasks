const Database = require('better-sqlite3');
const db = new Database('./dev.db');

// Check table exists
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Task%'").all();
console.log('Task-related tables:', tables.map(t => t.name));

// Count links
try {
  const cnt = db.prepare('SELECT COUNT(*) as cnt FROM TaskLink').get();
  console.log('TaskLink count:', cnt);
} catch (e) {
  console.error('TaskLink error:', e.message);
}

// Check if the specific tasks exist
const tasks = db.prepare("SELECT id, substr(title,1,60) as title FROM Task WHERE id IN ('cmmrxpqfj000nmoq97mgahz40', 'cmmrxnvvi000emoq9lrwtal3p')").all();
console.log('Tasks:', tasks);

db.close();
