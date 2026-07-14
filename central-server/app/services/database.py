import os
import time
import mysql.connector
from mysql.connector import pooling

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "familis_central")

db_pool = None


def _create_pool():
    return mysql.connector.pooling.MySQLConnectionPool(
        pool_name="dashboard_pool",
        pool_size=10,
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )


def get_db_connection():
    global db_pool
    if db_pool is None:
        last_error = None
        for _ in range(10):
            try:
                db_pool = _create_pool()
                break
            except mysql.connector.Error as exc:
                last_error = exc
                time.sleep(2)
        else:
            raise last_error

    return db_pool.get_connection()
