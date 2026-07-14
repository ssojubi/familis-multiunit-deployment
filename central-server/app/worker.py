import asyncio

from .services.kafka_consumer import start_fer_consumer


def main():
    asyncio.run(start_fer_consumer())


if __name__ == "__main__":
    main()
