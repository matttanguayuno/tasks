const Database = require('better-sqlite3');
const db = new Database('./dev.db');

const rows = db.prepare("SELECT c.id, substr(c.content,1,80) as content, c.trelloCommentId, c.createdAt FROM Comment c ORDER BY c.createdAt DESC LIMIT 20").all();
console.table(rows);
db.close();
