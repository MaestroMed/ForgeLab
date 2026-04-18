import sqlite3
db = sqlite3.connect(r"C:\Users\Matter1\FORGE_LIBRARY\forge.db")
c = db.cursor()
c.execute("UPDATE jobs SET status='failed', error='Switching to small model' WHERE status IN ('pending','running')")
print(f"Cancelled {c.rowcount} jobs")
c.execute("UPDATE projects SET status='ingested' WHERE status='analyzing'")
print(f"Reset {c.rowcount} projects")
db.commit()
db.close()
