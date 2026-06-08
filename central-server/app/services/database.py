import os
import mysql.connector
from mysql.connector import pooling

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "familis_central")

db_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="dashboard_pool",
    pool_size=10,
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME
)

def get_db_connection():
    return db_pool.get_connection()