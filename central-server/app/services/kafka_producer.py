import os
from aiokafka import AIOKafkaProducer
import json
import asyncio

_kafka_producer = None


def get_kafka_producer():
    return _kafka_producer


def set_kafka_producer(producer):
    global _kafka_producer
    _kafka_producer = producer


class KafkaProducerService:
    def __init__(self):
        self.producer = None
        self.ready = False

    async def start(self):
        bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.producer = AIOKafkaProducer(
            bootstrap_servers=bootstrap_servers,
            max_request_size=6 * 1024 * 1024,
            value_serializer=lambda v: json.dumps(v).encode(),
            key_serializer=lambda v: v.encode(),
        )
        await self.producer.start()
        self.ready = True

    async def send(self, topic: str, value: dict, key: str | None = None):
        if not self.ready:
            raise Exception("Kafka producer not ready")
        await self.producer.send_and_wait(topic, value, key=key)

    async def stop(self):
        if self.producer:
            await self.producer.stop()
        self.ready = False

    def is_ready(self):
        return self.ready

    async def check_broker(self):
        if not self.ready or self.producer is None:
            return False
        try:
            updated = await asyncio.wait_for(
                self.producer.client.force_metadata_update(), timeout=2
            )
            if not updated:
                return False
            partitions = await asyncio.wait_for(
                self.producer.partitions_for("video-frames"), timeout=2
            )
            return bool(partitions)
        except Exception:
            return False
