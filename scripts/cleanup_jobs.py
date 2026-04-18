"""Cancel all stuck jobs and reset projects."""
import sqlite3

db = sqlite3.connect(r'C:\Users\Matter1\FORGE_LIBRARY\forge.db')
c = db.cursor()

# Count stuck jobs
c.execute('SELECT id, type, status, progress FROM jobs WHERE status IN ("pending", "running")')
stuck = c.fetchall()
print(f'Found {len(stuck)} stuck jobs:')
for j in stuck:
    print(f'  {j[0][:8]} | {j[1]:10s} | {j[2]:10s} | {j[3]:.0f}%')

# Cancel them all
c.execute('UPDATE jobs SET status = "cancelled", error = "Cancelled: cleanup" WHERE status IN ("pending", "running")')
count = c.rowcount
db.commit()
print(f'Cancelled {count} jobs.')

# Reset stuck projects
c.execute('SELECT id, name, status FROM projects WHERE status IN ("analyzing", "ingesting", "downloading", "exporting")')
stuck_projects = c.fetchall()
for p in stuck_projects:
    print(f'  Project {p[0][:8]} "{p[1][:40]}" stuck in {p[2]}')

c.execute('UPDATE projects SET status = "ingested" WHERE status = "analyzing"')
c.execute('UPDATE projects SET status = "created" WHERE status IN ("ingesting", "downloading")')
db.commit()
print('Reset stuck projects.')
db.close()
print('Done. Safe to restart.')
