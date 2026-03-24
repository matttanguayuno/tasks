const D = require('better-sqlite3');
const d = new D('./dev.db');
const ids = [
  'cmmrxnvvi000emoq9lrwtal3p',
  'cmmrxq1g8000omoq9uzk0st3u',
  'cmmrxogpy000fmoq9h6umo2k5',
  'cmmsklyqr0006dcq945va4j52'
];
const placeholders = ids.map(() => '?').join(',');
const rows = d.prepare(`SELECT st.taskId, s.number as sprintNum, substr(t.title,1,45) as title FROM SprintTask st JOIN Sprint s ON s.id=st.sprintId JOIN Task t ON t.id=st.taskId WHERE st.taskId IN (${placeholders})`).all(...ids);
console.table(rows);
d.close();
