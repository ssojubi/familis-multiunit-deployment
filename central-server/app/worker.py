import asyncio
from prometheus_client import start_http_server

from .services.kafka_consumer import start_fer_consumer


def main():
    start_http_server(9100)
    asyncio.run(start_fer_consumer())


if __name__ == "__main__":
    main()
